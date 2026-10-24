import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { createPreventivePlan, listPreventivePlans } from "@/lib/care/preventive";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { PREVENTIVE_CARE_STATUSES, preventivePlanCreateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * The person's preventive plans, soonest due first.
 *
 * A plan is a restatement of guidance attributable to a named source, not
 * ORVEXA's own advice, so every row carries its `guidanceSourceLabel`.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.reminders_manage_own");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const statusParam = params.get("status");
  const result = await listPreventivePlans({
    user: session.user,
    ownerUserId: params.get("ownerUserId")?.trim() || undefined,
    familyMemberId: params.get("familyMemberId")?.trim() || undefined,
    status: PREVENTIVE_CARE_STATUSES.find((value) => value === statusParam),
  });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ plans: result.data });
}

/**
 * Records a preventive plan.
 *
 * `guidanceSourceLabel` is required and stored exactly as entered: a plan with
 * no attributable source would be ORVEXA issuing screening advice, which it does
 * not do, so there is no default to fall back on.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.reminders_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = preventivePlanCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That preventive plan is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await createPreventivePlan({ user: session.user, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ planId: result.data.planId });
}
