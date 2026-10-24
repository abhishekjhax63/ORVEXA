import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { stopMedicationSchedule } from "@/lib/care/medications";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { medicationScheduleStopSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * Records that the person has stopped taking a medicine.
 *
 * This is deliberately separate from editing, and works even when the schedule
 * is clinician-recorded: "I have stopped taking this" is a fact about the
 * person, not a rewrite of the prescription. Only the status and the reason
 * change — never the dose, the frequency or the times.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.medications_manage_own");
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

  const parsed = medicationScheduleStopSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That stop request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await stopMedicationSchedule({ user: session.user, scheduleId: id, reason: parsed.data.reason ?? null });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ scheduleId: result.data.scheduleId });
}
