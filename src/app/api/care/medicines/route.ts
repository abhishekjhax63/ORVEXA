import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { createMedicationSchedule, listMedicationSchedules } from "@/lib/care/medications";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { medicationScheduleCreateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * The person's medicine schedules, what is currently being taken first.
 *
 * `includeInactive=true` widens the list to paused, completed and stopped
 * schedules so a screen can show the full medicine history.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.medications_manage_own");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const result = await listMedicationSchedules({
    user: session.user,
    ownerUserId: params.get("ownerUserId")?.trim() || undefined,
    familyMemberId: params.get("familyMemberId")?.trim() || undefined,
    includeInactive: params.get("includeInactive") === "true",
  });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ schedules: result.data });
}

/**
 * Records a medicine schedule.
 *
 * The provenance of the schedule — who established it — is set by the service
 * from the subject, never taken from the request, so a client cannot label its
 * own entry as clinician-recorded.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.medications_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = medicationScheduleCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That medicine schedule is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await createMedicationSchedule({ user: session.user, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ scheduleId: result.data.scheduleId });
}
