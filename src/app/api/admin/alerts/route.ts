import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { alertCounts, listAlerts } from "@/lib/security/alerts";
import { alertFilterSchema } from "@/lib/validation/platform";

/**
 * Security and integration alerts, unresolved and severe first.
 *
 * The queue is deliberately not paginated by offset: an operator reads the top
 * of it under pressure, and a security queue whose second page is stale is worse
 * than one that shows the worst hundred and says so. The counts are returned
 * alongside so the console header and the health endpoint agree.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.security_operations");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, alertFilterSchema, "That alert filter");
  if (!parsed.ok) return parsed.response;

  const [items, counts] = await Promise.all([
    listAlerts({
      kind: parsed.data.kind,
      status: parsed.data.status,
      severity: parsed.data.severity,
      limit: parsed.data.pageSize,
    }),
    alertCounts(),
  ]);

  return jsonOk({ items, counts, truncated: items.length >= parsed.data.pageSize });
}
