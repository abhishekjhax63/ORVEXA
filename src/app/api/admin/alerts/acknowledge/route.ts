import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { acknowledgeAlert } from "@/lib/security/alerts";
import { alertAcknowledgeSchema } from "@/lib/validation/platform";

/**
 * Marks an alert as seen by a named operator.
 *
 * Acknowledging is not resolving: it says somebody has picked the alert up. The
 * operator is taken from the session, and their optional note is kept on the
 * audit row rather than on the alert, so the alert's own evidence stays the
 * fingerprint and the timestamps.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.security_operations");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, alertAcknowledgeSchema, "That acknowledgement");
  if (!parsed.ok) return parsed.response;

  const alert = await acknowledgeAlert({
    alertId: parsed.data.alertId,
    actorUserId: session.context.user.id,
    actorLabel: session.context.user.fullName,
    note: parsed.data.note ?? null,
  });

  return jsonOk({ alertId: alert.id, status: alert.status });
}
