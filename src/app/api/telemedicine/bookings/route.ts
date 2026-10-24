import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { createTeleconsultAppointment, listPatientTeleconsultations } from "@/lib/telemedicine/bookings";
import { teleconsultBookingSchema } from "@/lib/validation/telemedicine";

/**
 * Request a virtual consultation.
 *
 * The request names a clinician and a time and carries explicit consent. It
 * never carries a fee: the fee is taken from the clinician's own published
 * teleconsultation price at write time. `idempotencyKey` makes a retried submit
 * land on the same appointment, and a replayed key from another account is
 * refused rather than adopted.
 */
const CREATE_ERROR_STATUS: Record<string, number> = {
  doctor_not_found: 404,
  teleconsult_disabled: 409,
  not_accepting_patients: 409,
  family_member_not_found: 404,
  consent_required: 409,
  outside_schedule: 422,
  slot_taken: 409,
  conflict: 409,
};

export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("telemedicine.book_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit(
    "telemedicineBooking",
    `user:${session.user.id}`,
    RATE_LIMITS.telemedicineBooking,
  );
  if (!limit.allowed) {
    return jsonError(429, "Too many booking attempts. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = teleconsultBookingSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That booking request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await createTeleconsultAppointment({ user: session.user, data: parsed.data });
  if (!result.ok) {
    return jsonError(CREATE_ERROR_STATUS[result.code] ?? 422, result.message, { code: result.code });
  }

  return jsonOk(
    { appointment: result.appointment, reused: result.reused },
    { status: result.reused ? 200 : 201 },
  );
}

/** The signed-in patient's own virtual consultations, newest first. */
export async function GET() {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const consultations = await listPatientTeleconsultations(session.user.id);
  return jsonOk({ consultations });
}
