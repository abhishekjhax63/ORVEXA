import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { saveConsultationNoteDraft } from "@/lib/telemedicine/notes";
import { consultationNoteDraftSchema } from "@/lib/validation/telemedicine";

const NOTE_ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  not_treating_clinician: 403,
  clinician_not_verified: 403,
  appointment_closed: 409,
  not_editable: 409,
  incomplete: 422,
  conflict: 409,
};

/**
 * Save a clinical note as a draft.
 *
 * A draft is the clinician's working text: it is never shown to the patient and
 * is never a signed record. Only a verified clinician treating the appointment
 * may write here, and the appointment must not be closed.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("consultation.notes_write");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit(
    "consultationNoteWrite",
    `user:${session.user.id}`,
    RATE_LIMITS.consultationNoteWrite,
  );
  if (!limit.allowed) {
    return jsonError(429, "Too many note actions. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = consultationNoteDraftSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That note is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }
  if (parsed.data.appointmentId !== decodeURIComponent(id)) {
    return jsonError(409, "That note does not match this consultation.");
  }

  const result = await saveConsultationNoteDraft({
    actor: { userId: session.user.id, role: "DOCTOR", label: session.user.fullName },
    data: parsed.data,
  });
  if (!result.ok) {
    return jsonError(NOTE_ERROR_STATUS[result.code] ?? 422, result.message, { code: result.code });
  }

  return jsonOk({ note: result.note, created: result.created }, { status: result.created ? 201 : 200 });
}
