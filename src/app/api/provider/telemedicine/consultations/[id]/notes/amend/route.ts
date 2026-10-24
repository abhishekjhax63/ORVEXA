import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { amendConsultationNote } from "@/lib/telemedicine/notes";
import { consultationNoteAmendSchema } from "@/lib/validation/telemedicine";

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
 * Amend a finalised note.
 *
 * A signed note is never edited in place: the amendment is a new record that
 * points back at the one it corrects and carries the reason. Both remain on the
 * consultation, so the change is visible rather than silent.
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

  const parsed = consultationNoteAmendSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That amendment is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }
  if (parsed.data.appointmentId !== decodeURIComponent(id)) {
    return jsonError(409, "That amendment does not match this consultation.");
  }

  const result = await amendConsultationNote({
    actor: { userId: session.user.id, role: "DOCTOR", label: session.user.fullName },
    appointmentId: parsed.data.appointmentId,
    noteId: parsed.data.noteId,
    reason: parsed.data.reason,
    assessment: parsed.data.assessment,
    plan: parsed.data.plan,
    followUpInstructions: parsed.data.followUpInstructions,
  });
  if (!result.ok) {
    return jsonError(NOTE_ERROR_STATUS[result.code] ?? 422, result.message, { code: result.code });
  }

  return jsonOk({ note: result.note }, { status: 201 });
}
