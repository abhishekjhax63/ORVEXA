import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { changePreventivePlanStatus } from "@/lib/care/preventive";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { preventivePlanUpdateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * Moves a preventive plan's lifecycle status.
 *
 * This is its own endpoint rather than a field on the plan PATCH because
 * `changePreventivePlanStatus` takes the status — and, when a completion is
 * discharged by a record such as an immunisation, that record's type and id —
 * as separate arguments. It is the only path that sets or clears `completedOn`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.reminders_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = preventivePlanUpdateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That status change is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const { status } = parsed.data;
  if (!status) {
    return jsonError(422, "That status change is not valid.", { fieldErrors: { status: "Choose a status." } });
  }

  const result = await changePreventivePlanStatus({
    user: session.user,
    planId: id,
    status,
    completedRefType: parsed.data.completedRefType,
    completedRefId: parsed.data.completedRefId,
  });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ planId: result.data.planId, status: result.data.status });
}
