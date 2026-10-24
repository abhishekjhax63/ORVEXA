import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { ensureTeleconsultSession, resolveParticipantViewer } from "@/lib/telemedicine/sessions";
import { sessionCreateSchema } from "@/lib/validation/telemedicine";

/**
 * Open the consultation room for an appointment.
 *
 * Only the patient and the treating clinician may do this, and the appointment
 * must be CONFIRMED. A room that cannot be created is reported as failed with
 * the provider's own reason — this endpoint never reports a room as ready when
 * no provider confirmed one.
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

  const parsed = sessionCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That session request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const viewer = await resolveParticipantViewer({
    appointmentId: parsed.data.appointmentId,
    userId: session.user.id,
  });
  if (!viewer) return jsonError(403, "Only the patient and the treating clinician can open this consultation room.");

  const result = await ensureTeleconsultSession({
    appointmentId: parsed.data.appointmentId,
    actor: {
      userId: session.user.id,
      role: viewer === "PATIENT" ? "PATIENT" : "DOCTOR",
      label: session.user.fullName,
    },
  });
  if (!result.ok) {
    const status =
      result.code === "not_found" || result.code === "no_session"
        ? 404
        : result.code === "provider_failed"
          ? 502
          : result.code === "provider_unavailable"
            ? 503
            : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ session: result.session, created: result.created, room: result.room });
}
