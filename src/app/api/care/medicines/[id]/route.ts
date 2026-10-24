import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { updateMedicationSchedule } from "@/lib/care/medications";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { medicationScheduleUpdateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * Edits a medicine schedule the person owns.
 *
 * A schedule recorded by a clinician cannot be edited here: the refusal (and the
 * attempt behind it) is surfaced exactly as the service reports it, with its own
 * message and code, because changing a prescription is a clinical decision the
 * app does not take on the person's behalf. Stopping such a schedule is the
 * exception and lives on `POST .../stop`.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = medicationScheduleUpdateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That medicine schedule change is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await updateMedicationSchedule({ user: session.user, scheduleId: id, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ scheduleId: result.data.scheduleId });
}
