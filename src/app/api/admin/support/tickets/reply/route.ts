import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { replyToPlatformSupportTicket } from "@/lib/platform/support-desk";
import { supportTicketReplySchema } from "@/lib/validation/platform";

/** Maps a support-desk failure code onto the HTTP status the console should see. */
function supportFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * Adds a reply to a ticket thread.
 *
 * `isInternal` marks a staff-only note. The two kinds of message share one
 * thread on the row and are separated only by that flag, which is why it is
 * recorded on the audit line as well as on the message: "an internal note was
 * written" is a fact a reviewer of the ticket's handling may need.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.support_queue");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminSupportWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, supportTicketReplySchema, "That reply");
  if (!parsed.ok) return parsed.response;

  const result = await replyToPlatformSupportTicket({ context: session.context, data: parsed.data });
  if (!result.ok) {
    return jsonError(supportFailureStatus(result.code), result.message, { code: result.code });
  }

  return jsonOk({ messageId: result.data.messageId, status: result.data.status });
}
