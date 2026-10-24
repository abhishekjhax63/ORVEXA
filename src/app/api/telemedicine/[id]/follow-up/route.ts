import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { createFollowUpAppointment } from "@/lib/telemedicine/bookings";
import { followUpBookingSchema } from "@/lib/validation/telemedicine";

const FOLLOW_UP_ERROR_STATUS: Record<string, number> = {
  doctor_not_found: 404,
  teleconsult_disabled: 409,
  not_accepting_patients: 409,
  not_found: 404,
  parent_not_completed: 409,
  consent_required: 409,
  outside_schedule: 422,
  slot_taken: 409,
  conflict: 409,
};

/**
 * Book a follow-up to a completed consultation.
 *
 * The appointment in the path is the consultation being followed; the service
 * refuses a parent that is not the patient's own or is not yet completed, and
 * keeps the parent chain one deep.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = followUpBookingSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That follow-up request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  if (parsed.data.parentAppointmentId !== decodeURIComponent(id)) {
    return jsonError(409, "That request does not match the consultation it follows.");
  }

  const result = await createFollowUpAppointment({ user: session.user, data: parsed.data });
  if (!result.ok) {
    return jsonError(FOLLOW_UP_ERROR_STATUS[result.code] ?? 422, result.message, { code: result.code });
  }

  return jsonOk(
    { appointment: result.appointment, reused: result.reused },
    { status: result.reused ? 200 : 201 },
  );
}
