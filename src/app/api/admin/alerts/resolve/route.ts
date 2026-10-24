import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { resolveAlert } from "@/lib/security/alerts";
import { alertResolveSchema } from "@/lib/validation/platform";

/**
 * Closes an alert.
 *
 * The schema requires a written reason of at least ten characters, because
 * "resolved" with nothing said about how is an assertion the next operator
 * cannot check — and if the integration fails again in an hour, the reason is
 * the only thing that says whether the same fault came back.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.security_operations");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, alertResolveSchema, "That resolution");
  if (!parsed.ok) return parsed.response;

  const alert = await resolveAlert({
    alertId: parsed.data.alertId,
    actorUserId: session.context.user.id,
    actorLabel: session.context.user.fullName,
    note: parsed.data.note,
  });

  return jsonOk({ alertId: alert.id, status: alert.status });
}
