import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { issueConsultationPrescription } from "@/lib/telemedicine/prescriptions";
import { consultationPrescriptionSchema } from "@/lib/validation/telemedicine";

const PRESCRIPTION_ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  not_treating_clinician: 403,
  clinician_not_verified: 403,
  appointment_closed: 409,
  not_issuable: 409,
  consent_required: 409,
  empty_prescription: 422,
  conflict: 409,
};

/**
 * Issue a prescription from a consultation.
 *
 * Only a verified clinician treating the appointment may issue one, and the
 * consent flag records that the clinician intends the medicines written. The
 * lines are stored exactly as written — the platform never substitutes a
 * medicine — and the prescriber's name and registration number are stamped on
 * the record from the clinician's own profile, not from the request body.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("consultation.prescribe");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit(
    "consultationPrescriptionWrite",
    `user:${session.user.id}`,
    RATE_LIMITS.consultationPrescriptionWrite,
  );
  if (!limit.allowed) {
    return jsonError(429, "Too many prescription actions. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = consultationPrescriptionSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That prescription is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }
  if (parsed.data.appointmentId !== decodeURIComponent(id)) {
    return jsonError(409, "That prescription does not match this consultation.");
  }

  const result = await issueConsultationPrescription({
    actor: { userId: session.user.id, role: "DOCTOR", label: session.user.fullName },
    data: parsed.data,
  });
  if (!result.ok) {
    return jsonError(PRESCRIPTION_ERROR_STATUS[result.code] ?? 422, result.message, { code: result.code });
  }

  return jsonOk({ prescription: result.prescription, notice: result.notice }, { status: 201 });
}
