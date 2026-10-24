import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { createWellnessEntry, listWellnessEntries } from "@/lib/care/wellness";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { WELLNESS_CATEGORIES, wellnessEntryCreateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/** Parses an optional ISO date from a query string, ignoring anything unreadable. */
function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * The person's wellness observations, newest first.
 *
 * Optional `category`, `from`, `to` and `limit` narrow the list. The rows are
 * raw readings — a value, a unit and a source — with no derived figure attached.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.wellness_manage_own");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const categoryParam = params.get("category");
  const limitParam = params.get("limit");
  const result = await listWellnessEntries({
    user: session.user,
    ownerUserId: params.get("ownerUserId")?.trim() || undefined,
    familyMemberId: params.get("familyMemberId")?.trim() || undefined,
    category: WELLNESS_CATEGORIES.find((value) => value === categoryParam) ?? null,
    from: parseDateParam(params.get("from")) ?? null,
    to: parseDateParam(params.get("to")) ?? null,
    limit: limitParam && /^\d+$/.test(limitParam) ? Number(limitParam) : undefined,
  });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ entries: result.data });
}

/**
 * Records a wellness observation.
 *
 * A value or a note is required, never both empty. There is nowhere to post a
 * score: the schema accepts a value and a unit only, and the provenance is set
 * by the service, so a self-typed number can never be labelled clinician-verified.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.wellness_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = wellnessEntryCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That wellness entry is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await createWellnessEntry({ user: session.user, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ entryId: result.data.entryId });
}
