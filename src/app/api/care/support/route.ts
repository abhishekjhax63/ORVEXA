import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { createSupportTicket, listMyTickets } from "@/lib/care/support";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { supportTicketCreateSchema } from "@/lib/validation/care";

/**
 * The caller's own support tickets.
 *
 * Each ticket carries only its latest visible message; an internal staff note is
 * filtered out at the query in the service, so it can never appear on this list.
 */
export async function GET(_request: NextRequest) {
  const session = await requireRoutePermission("care.workspace_access");
  if (!session.ok) return session.response;

  const tickets = await listMyTickets({ user: session.user });
  return jsonOk({ tickets });
}

/**
 * Raise a support ticket.
 *
 * The `reference` is allocated by the service and returned so the person can
 * quote it. It is never accepted from the caller, which is what lets two people
 * read their references out loud without colliding.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.workspace_access");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = supportTicketCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That support request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await createSupportTicket({ user: session.user, data: parsed.data });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ ticketId: result.data.ticketId, reference: result.data.reference });
}
