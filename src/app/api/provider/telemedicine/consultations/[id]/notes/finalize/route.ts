import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { finalizeConsultationNote } from "@/lib/telemedicine/notes";
import { consultationNoteFinalizeSchema } from "@/lib/validation/telemedicine";

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
 * Finalise a clinical note.
 *
 * Finalising signs the note: it is stamped with the clinician's identity and the
 * moment, and it becomes readable by the patient. The service additionally
 * requires an assessment or a plan to exist, so an empty note is not a record.
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

  const parsed = consultationNoteFinalizeSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That finalise request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }
  if (parsed.data.appointmentId !== decodeURIComponent(id)) {
    return jsonError(409, "That note does not match this consultation.");
  }

  const result = await finalizeConsultationNote({
    actor: { userId: session.user.id, role: "DOCTOR", label: session.user.fullName },
    appointmentId: parsed.data.appointmentId,
    noteId: parsed.data.noteId,
  });
  if (!result.ok) {
    return jsonError(NOTE_ERROR_STATUS[result.code] ?? 422, result.message, { code: result.code });
  }

  return jsonOk({ note: result.note });
}
