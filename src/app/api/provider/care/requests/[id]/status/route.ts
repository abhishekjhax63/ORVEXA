import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { updateCareServiceRequestStatus } from "@/lib/care/directory";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { careServiceRequestStatusSchema } from "@/lib/validation/care";

/**
 * Advance a care service request along its lifecycle.
 *
 * A request that has already ended cannot move again, and nothing here completes
 * a request on its own: the provider sets the status when the work has actually
 * reached it, so a request is never quietly closed by the platform.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.service_request_manage");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("providerWrite", `user:${session.user.id}`, RATE_LIMITS.providerWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = careServiceRequestStatusSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That status change is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await updateCareServiceRequestStatus({
    user: session.user,
    requestId: id,
    data: parsed.data,
  });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ requestId: result.data.requestId, status: result.data.status });
}
