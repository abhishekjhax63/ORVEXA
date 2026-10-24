import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { endTeleconsultSession, resolveParticipantViewer } from "@/lib/telemedicine/sessions";
import { sessionEndSchema } from "@/lib/validation/telemedicine";

/**
 * Close a consultation room.
 *
 * Either participant may close it. Closing reports whether the video provider
 * actually confirmed the room was deleted; when it did not, the response says so
 * rather than implying the room is gone.
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
    return jsonError(429, "Too many session actions. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = sessionEndSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That end-session request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const viewer = await resolveParticipantViewer({
    appointmentId: parsed.data.appointmentId,
    userId: session.user.id,
  });
  if (!viewer) return jsonError(403, "Only the patient and the treating clinician can close this consultation.");

  const result = await endTeleconsultSession({
    appointmentId: parsed.data.appointmentId,
    reason: parsed.data.reason ?? null,
    actor: {
      userId: session.user.id,
      role: viewer === "PATIENT" ? "PATIENT" : "DOCTOR",
      label: session.user.fullName,
    },
  });
  if (!result.ok) {
    const status = result.code === "no_session" || result.code === "not_found" ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ session: result.session, roomClosed: result.roomClosed });
}
