import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { acknowledgeWaitingRoom, resolveParticipantViewer, type SessionViewer } from "@/lib/telemedicine/sessions";
import { sessionJoinSchema } from "@/lib/validation/telemedicine";

/**
 * Record that the caller entered the waiting room.
 *
 * The participant is decided from the appointment, so the record cannot be made
 * to say the other participant arrived. This writes an event only; it opens no
 * room and moves no session state.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit(
    "telemedicineSessionWrite",
    `user:${session.user.id}`,
    RATE_LIMITS.telemedicineSessionWrite,
  );
  if (!limit.allowed) {
    return jsonError(429, "Too many waiting-room actions. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = sessionJoinSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That waiting-room request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const viewer: SessionViewer | null = await resolveParticipantViewer({
    appointmentId: parsed.data.appointmentId,
    userId: session.user.id,
  });
  if (!viewer) return jsonError(403, "Only the patient and the treating clinician can enter this waiting room.");

  const result = await acknowledgeWaitingRoom({
    appointmentId: parsed.data.appointmentId,
    viewer,
    actor: {
      userId: session.user.id,
      role: viewer === "PATIENT" ? "PATIENT" : "DOCTOR",
      label: session.user.fullName,
    },
  });
  if (!result.ok) {
    return jsonError(result.code === "no_session" ? 404 : 409, result.message, { code: result.code });
  }

  return jsonOk({ waitingRoom: true, viewer });
}
