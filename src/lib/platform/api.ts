import "server-only";

import type { ZodType } from "zod";

import { jsonError, readJsonBody, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, type RateLimitName, RATE_LIMITS } from "@/lib/security/rate-limit";
import type { PlatformErrorCode } from "@/lib/platform/errors";
import type { PlatformContext } from "@/lib/platform/console";

/**
 * Shared plumbing for the operations console's route handlers.
 *
 * Thirty-odd handlers all do the same four things — check the permission, apply
 * the console rate limit, parse and validate the input, then turn a
 * `PlatformResult` failure into a response. Doing that inline in each file would
 * mean thirty chances to forget one of them, and the one most likely to be
 * forgotten is the rate limit.
 *
 * This module deliberately contains no policy. The permission is chosen by the
 * caller, the schema is chosen by the caller, and the service decides everything
 * else. What lives here is only the translation between HTTP and the result
 * vocabulary the console already uses.
 */

/**
 * The HTTP status for a service failure.
 *
 * The console's codes are about *why* something failed, and an operator's screen
 * needs *what to do about it*: a 404 means "reload, it is gone", a 403 means
 * "this is not yours", a 422 means "fix the form", and anything else is a
 * conflict with the state the row is actually in — which is the common case
 * here, because two operators working the same queue is normal.
 */
export function platformFailureStatus(code: PlatformErrorCode): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "not_permitted" || code === "export_scope_denied" || code === "purge_scope_denied") return 403;
  if (code === "validation" || code === "setting_value_invalid" || code === "range_invalid") return 422;
  return 409;
}

/** The console's standard failure response, so the shape is identical everywhere. */
export function platformFailure(code: PlatformErrorCode, message: string) {
  return jsonError(platformFailureStatus(code), message, { code });
}

export type ConsoleLimitOutcome = { ok: true } | { ok: false; response: Response };

/**
 * Applies a console rate limit, keyed on the operator's own account.
 *
 * The identity is the signed-in user id, never a role or an id from the request:
 * a limit an operator can reset by changing a header is not a limit.
 */
export async function enforceConsoleLimit(
  name: RateLimitName,
  context: PlatformContext,
): Promise<ConsoleLimitOutcome> {
  const limit = await consumeRateLimit(name, `user:${context.user.id}`, RATE_LIMITS[name]);
  if (limit.allowed) return { ok: true };
  return {
    ok: false,
    response: jsonError(429, "That is more operations than this workspace allows in one window. Try again shortly.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    }),
  };
}

export type ParsedInput<T> = { ok: true; data: T } | { ok: false; response: Response };

function invalid(prefix: string, error: Parameters<typeof zodFieldErrors>[0]): Response {
  return jsonError(422, prefix, { fieldErrors: zodFieldErrors(error) });
}

/**
 * Validates a JSON request body against a schema.
 *
 * Every console write goes through this, which is what makes "validate and
 * sanitize inputs" a property of the console rather than a habit: a handler that
 * asked the service to read a raw body would not compile against this module's
 * callers.
 */
export async function readConsoleBody<T>(request: Request, schema: ZodType<T>, label: string): Promise<ParsedInput<T>> {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return { ok: false, response: parsedBody.response };

  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) return { ok: false, response: invalid(`${label} is not valid.`, parsed.error) };

  return { ok: true, data: parsed.data };
}

/**
 * Validates query-string filters against a schema.
 *
 * Query values are always strings, so every filter schema coerces. An unknown
 * parameter is dropped by the schema rather than refused — a stale bookmark
 * carrying an old filter name should still open the queue.
 */
export function readConsoleQuery<T>(request: Request, schema: ZodType<T>, label: string): ParsedInput<T> {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!(key in raw)) raw[key] = value;
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: invalid(`${label} is not valid.`, parsed.error) };

  return { ok: true, data: parsed.data };
}
