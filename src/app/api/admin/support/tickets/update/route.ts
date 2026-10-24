import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { updatePlatformSupportTicket } from "@/lib/platform/support-desk";
import { supportTicketUpdateSchema } from "@/lib/validation/platform";

/** Maps a support-desk failure code onto the HTTP status the console should see. */
function supportFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * Changes a ticket's status, severity or owner.
 *
 * Closing a ticket is a decision with a customer on the other end, so the
 * resolution note is required and the desk refuses a closure that skips it.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.support_queue");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminSupportWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, supportTicketUpdateSchema, "That ticket change");
  if (!parsed.ok) return parsed.response;

  const result = await updatePlatformSupportTicket({ context: session.context, data: parsed.data });
  if (!result.ok) {
    return jsonError(supportFailureStatus(result.code), result.message, { code: result.code });
  }

  return jsonOk({ ticketId: result.data.ticketId, status: result.data.status });
}
