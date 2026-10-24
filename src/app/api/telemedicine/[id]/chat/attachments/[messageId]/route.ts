import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { openConsultationAttachment } from "@/lib/telemedicine/messages";

/**
 * Turns one chat attachment into a short-lived signed link.
 *
 * Authorization is the message itself: the caller must be a party to the
 * appointment the message belongs to, and the message must be the one carrying
 * this key. There is no path that accepts a bare storage key.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("telemedicineChat", `user:${session.user.id}`, RATE_LIMITS.telemedicineChat);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id, messageId } = await params;
  const result = await openConsultationAttachment({
    appointmentId: decodeURIComponent(id),
    messageId: decodeURIComponent(messageId),
    userId: session.user.id,
  });
  if (!result.ok) {
    const status =
      result.code === "not_found" || result.code === "attachment_not_found"
        ? 404
        : result.code === "not_a_participant"
          ? 403
          : result.code === "storage_not_configured"
            ? 503
            : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({
    url: result.attachment.url,
    expiresAt: result.attachment.expiresAt,
    fileName: result.attachment.fileName,
  });
}
