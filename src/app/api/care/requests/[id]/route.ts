import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { cancelOwnCareServiceRequest } from "@/lib/care/directory";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * Cancel the caller's own care service request.
 *
 * Only a request the provider has not yet progressed can be cancelled. Once it
 * has been scheduled or started, cancelling is a conversation rather than a
 * button, so the service refuses it and that refusal is returned as a 409 rather
 * than swallowing it into a success.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.services_request_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("appointmentWrite", `user:${session.user.id}`, RATE_LIMITS.appointmentWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const result = await cancelOwnCareServiceRequest({ user: session.user, requestId: id });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ requestId: result.data.requestId });
}
