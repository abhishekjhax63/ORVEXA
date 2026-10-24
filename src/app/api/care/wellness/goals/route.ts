import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { createWellnessGoal, listWellnessGoals } from "@/lib/care/wellness";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { wellnessGoalCreateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/** The person's wellness goals, active first. */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.wellness_manage_own");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const result = await listWellnessGoals({
    user: session.user,
    ownerUserId: params.get("ownerUserId")?.trim() || undefined,
    familyMemberId: params.get("familyMemberId")?.trim() || undefined,
  });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ goals: result.data });
}

/** Sets a wellness goal: a target value, a unit and a cadence the person chose. */
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

  const parsed = wellnessGoalCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That wellness goal is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await createWellnessGoal({ user: session.user, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ goalId: result.data.goalId });
}
