import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { listMyCareServiceRequests, requestCareService } from "@/lib/care/directory";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { careServiceRequestCreateSchema } from "@/lib/validation/care";

/** The caller's own care service requests, newest first. */
export async function GET(_request: NextRequest) {
  const session = await requireRoutePermission("care.services_request_own");
  if (!session.ok) return session.response;

  const requests = await listMyCareServiceRequests({ user: session.user });
  return jsonOk({ requests });
}

/**
 * Request a care service.
 *
 * `idempotencyKey` makes the submit idempotent: a retried form returns the
 * request that already exists with `reused: true`, which is preserved here so a
 * client does not raise a second booking for an action that already succeeded.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.services_request_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("appointmentWrite", `user:${session.user.id}`, RATE_LIMITS.appointmentWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = careServiceRequestCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await requestCareService({ user: session.user, data: parsed.data });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ requestId: result.data.requestId, reused: result.data.reused });
}
