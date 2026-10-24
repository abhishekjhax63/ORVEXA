import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getSupportTicket, replyToTicket } from "@/lib/care/support";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { supportTicketMessageSchema } from "@/lib/validation/care";

/**
 * One support ticket and its thread.
 *
 * A ticket that is not the caller's is reported exactly as one that does not
 * exist — the service returns the same 404 for both, so this endpoint cannot be
 * used to probe which references belong to somebody else. An internal note is
 * filtered out at the query in the service; that filter is deliberately not
 * restated here.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.workspace_access");
  if (!session.ok) return session.response;

  const { id } = await params;
  const result = await getSupportTicket({ user: session.user, ticketId: id });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ ticket: result.data });
}

/**
 * Add a turn to the thread.
 *
 * A closed ticket refuses the reply rather than reopening it, and the service's
 * message is passed through as a 409. `isInternal` is only honoured for a holder
 * of `care.support_manage`, so a patient cannot write a note they would not see.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.workspace_access");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = supportTicketMessageSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That message is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await replyToTicket({ user: session.user, ticketId: id, data: parsed.data });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ messageId: result.data.messageId, status: result.data.status });
}
