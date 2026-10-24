import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { updatePreventivePlan } from "@/lib/care/preventive";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { preventivePlanUpdateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * Edits the descriptive fields of a preventive plan.
 *
 * The lifecycle status is deliberately not changed here: a status move goes
 * through `POST .../status`, which is the single place `completedOn` is set or
 * cleared, so the two can never disagree.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    return jsonError(422, "That preventive plan change is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await updatePreventivePlan({ user: session.user, planId: id, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ planId: result.data.planId });
}
