import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listPlatformSupportQueue } from "@/lib/platform/support-desk";
import { supportTicketFilterSchema } from "@/lib/validation/platform";

/** Maps a support-desk failure code onto the HTTP status the console should see. */
function supportFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * The customer support queue.
 *
 * The queue itself belongs to the Phase 10 care service, which owns the rules
 * that matter — a closed ticket refuses a reply, and a privacy or prescription
 * ticket cannot be closed unresolved. This handler adds the console's own gate
 * (`platform.support_queue`) and its rate limit, and nothing else: a second
 * implementation of the queue's rules here would be a weaker copy of them.
 *
 * `status` and `severity` are the two dimensions that desk filters on; the other
 * fields the shared schema accepts are the desk's own vocabulary and are not
 * forwarded, so a caller cannot believe a filter was applied when it was not.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.support_queue");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, supportTicketFilterSchema, "That queue filter");
  if (!parsed.ok) return parsed.response;

  if (parsed.data.query || parsed.data.category || parsed.data.assignedTo) {
    return jsonError(422, "That queue filter is not supported. Filter by status or severity.", {
      fieldErrors: { query: "Not applied by this queue", category: "Not applied by this queue" },
    });
  }

  const result = await listPlatformSupportQueue({ context: session.context, filter: parsed.data });
  if (!result.ok) {
    return jsonError(supportFailureStatus(result.code), result.message, { code: result.code });
  }

  return jsonOk({ items: result.data });
}
