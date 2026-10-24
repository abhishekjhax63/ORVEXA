import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { markConsultationMessagesRead } from "@/lib/telemedicine/messages";

/**
 * Marks the other party's chat messages as read.
 *
 * Only messages the caller did not send are touched, so a read receipt can
 * never be attributed to its own author.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const { id } = await params;
  const result = await markConsultationMessagesRead({
    appointmentId: decodeURIComponent(id),
    userId: session.user.id,
  });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "not_a_participant" ? 403 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ markedCount: result.markedCount });
}
