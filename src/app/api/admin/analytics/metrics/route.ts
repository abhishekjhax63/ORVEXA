import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listOperationalMetrics } from "@/lib/platform/analytics";
import { operationalMetricFilterSchema } from "@/lib/validation/platform";

/**
 * The stored metric series.
 *
 * Distinct from the live dashboard: `GET /api/admin/analytics` recomputes from
 * the operational tables, while this reads the samples a snapshot has persisted.
 * Keeping them apart is what lets a chart show a gap honestly — a window nobody
 * recorded is absent here rather than interpolated, and the dashboard says which
 * windows it could not compute.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.analytics_read");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, operationalMetricFilterSchema, "That metric filter");
  if (!parsed.ok) return parsed.response;

  const items = await listOperationalMetrics({
    metricKey: parsed.data.metricKey,
    from: parsed.data.from,
    to: parsed.data.to,
    limit: parsed.data.limit,
  });

  return jsonOk({ items, truncated: items.length >= parsed.data.limit });
}
