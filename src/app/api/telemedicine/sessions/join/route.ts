import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { issueJoinLink, resolveParticipantViewer } from "@/lib/telemedicine/sessions";
import { sessionJoinSchema } from "@/lib/validation/telemedicine";

/** `reconnect` only changes the wording of the event; it grants nothing extra. */
const joinRequestSchema = sessionJoinSchema.extend({
  reconnect: z.boolean().optional().default(false),
});

/**
 * Issue a fresh join link to the caller.
 *
 * The participant is decided from the appointment, never from the request, so a
 * patient cannot be handed the clinician's link. The link is minted by the
 * configured video provider; if the provider is not reachable the request fails
 * with its reason rather than returning a link that does not work.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("telemedicineJoin", `user:${session.user.id}`, RATE_LIMITS.telemedicineJoin);
  if (!limit.allowed) {
    return jsonError(429, "Too many join attempts. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = joinRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That join request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const viewer = await resolveParticipantViewer({
    appointmentId: parsed.data.appointmentId,
    userId: session.user.id,
  });
  if (!viewer) return jsonError(403, "Only the patient and the treating clinician can join this consultation.");

  const result = await issueJoinLink({
    appointmentId: parsed.data.appointmentId,
    viewer,
    reconnect: parsed.data.reconnect,
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
        : result.code === "link_expired" || result.code === "room_expired"
          ? 410
          : result.code === "provider_failed"
            ? 502
            : result.code === "provider_unavailable"
              ? 503
              : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({
    appointmentId: result.appointmentId,
    reference: result.reference,
    viewer: result.viewer,
    linkUrl: result.linkUrl,
    expiresAt: result.expiresAt,
    sessionStatus: result.sessionStatus,
    isSandbox: result.isSandbox,
    providerConfirmed: result.providerConfirmed,
    notice: result.notice,
  });
}
