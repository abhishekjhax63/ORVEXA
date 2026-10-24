import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { cancelTeleconsultAppointment, getPatientTeleconsultationByReference } from "@/lib/telemedicine/bookings";
import { teleconsultCancelSchema, teleconsultReferenceSchema } from "@/lib/validation/telemedicine";

const CANCEL_ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  not_cancellable: 409,
  conflict: 409,
};

/**
 * Cancel a virtual consultation.
 *
 * Cancelling closes any live room and rotates both join links, so a link that
 * was already issued stops working. Only the patient on the appointment may
 * cancel it here.
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

  const parsed = teleconsultCancelSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That cancellation request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const owned = await getPatientTeleconsultationByReference({
    userId: session.user.id,
    reference: parsedReference.data,
  });
  if (!owned) return jsonError(404, "That consultation was not found on your account.");
  if (owned.id !== parsed.data.appointmentId) {
    return jsonError(409, "That reference does not match the appointment you are cancelling.");
  }

  const result = await cancelTeleconsultAppointment({
    user: session.user,
    appointmentId: owned.id,
    reason: parsed.data.reason,
  });
  if (!result.ok) {
    return jsonError(CANCEL_ERROR_STATUS[result.code] ?? 422, result.message, { code: result.code });
  }

  return jsonOk({ appointmentId: result.appointmentId, reference: result.reference, status: result.status });
}
