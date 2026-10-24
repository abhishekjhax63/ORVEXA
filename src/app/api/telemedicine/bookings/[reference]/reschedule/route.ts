import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getPatientTeleconsultationByReference, rescheduleTeleconsultAppointment } from "@/lib/telemedicine/bookings";
import { teleconsultReferenceSchema, teleconsultRescheduleSchema } from "@/lib/validation/telemedicine";

const RESCHEDULE_ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  not_reschedulable: 409,
  outside_schedule: 422,
  slot_taken: 409,
  conflict: 409,
};

/**
 * Move a virtual consultation to another time.
 *
 * The old time is released before the new one is claimed, so a small shift
 * cannot fail against the appointment's own slot. Only the patient on the
 * appointment may move it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const session = await requireRoutePermission("telemedicine.book_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit(
    "telemedicineBooking",
    `user:${session.user.id}`,
    RATE_LIMITS.telemedicineBooking,
  );
  if (!limit.allowed) {
    return jsonError(429, "Too many changes. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { reference } = await params;
  const parsedReference = teleconsultReferenceSchema.safeParse(decodeURIComponent(reference));
  if (!parsedReference.success) return jsonError(400, "That is not a valid consultation reference.");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = teleconsultRescheduleSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That reschedule request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const owned = await getPatientTeleconsultationByReference({
    userId: session.user.id,
    reference: parsedReference.data,
  });
  if (!owned) return jsonError(404, "That consultation was not found on your account.");
  if (owned.id !== parsed.data.appointmentId) {
    return jsonError(409, "That reference does not match the appointment you are changing.");
  }

  const result = await rescheduleTeleconsultAppointment({
    user: { id: session.user.id, fullName: session.user.fullName },
    appointmentId: owned.id,
    scheduledAt: parsed.data.scheduledAt,
    reason: parsed.data.reason ?? null,
  });
  if (!result.ok) {
    return jsonError(RESCHEDULE_ERROR_STATUS[result.code] ?? 422, result.message, { code: result.code });
  }

  return jsonOk({ appointmentId: result.appointmentId, reference: result.reference, status: result.status });
}
