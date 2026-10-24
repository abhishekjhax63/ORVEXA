import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { recordJoinFromToken, resolveJoinLink } from "@/lib/telemedicine/sessions";

const consultActionSchema = z.object({
  action: z.enum(["join", "waiting_room", "joined"]).default("join"),
});

/**
 * The public entry point for a consultation join link.
 *
 * The token in the path decides which participant the caller is; the signed-in
 * account must be that participant, or the request is refused and audited. A
 * `join` action exchanges the platform token for a real provider meeting token;
 * `waiting_room` and `joined` only record presence. Neither opens a room or
 * marks a call connected — that requires the provider's own confirmed response.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("telemedicineJoin", `user:${session.user.id}`, RATE_LIMITS.telemedicineJoin);
  if (!limit.allowed) {
    return jsonError(429, "Too many join attempts. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken).trim();

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = consultActionSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    return jsonError(422, "That consult request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const joinErrorStatus = (code: string) => {
    if (code === "link_invalid") return 400;
    if (code === "link_expired" || code === "room_expired") return 410;
    if (code === "not_a_participant") return 403;
    if (code === "not_found" || code === "no_session") return 404;
    if (code === "provider_failed") return 502;
    if (code === "provider_unavailable") return 503;
    return 409;
  };

  if (parsed.data.action === "join") {
    const result = await resolveJoinLink({ token, userId: session.user.id });
    if (!result.ok) {
      return jsonError(joinErrorStatus(result.code), result.message, { code: result.code });
    }

    const { grant } = result;
    return jsonOk({
      appointmentId: grant.appointmentId,
      reference: grant.reference,
      viewer: grant.viewer,
      sessionStatus: grant.sessionStatus,
      provider: grant.provider,
      providerConfirmed: grant.providerConfirmed,
      isSandbox: grant.isSandbox,
      roomUrl: grant.roomUrl,
      token: grant.token,
      tokenExpiresAt: grant.tokenExpiresAt,
      roomExpiresAt: grant.roomExpiresAt,
      notice: grant.notice,
    });
  }

  const result = await recordJoinFromToken({
    token,
    userId: session.user.id,
    kind: parsed.data.action === "waiting_room" ? "waiting_room" : "joined",
  });
  if (!result.ok) {
    return jsonError(joinErrorStatus(result.code), result.message, { code: result.code });
  }

  return jsonOk({ appointmentId: result.appointmentId, viewer: result.viewer, recorded: parsed.data.action });
}
