import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { analyticsOverview } from "@/lib/platform/analytics";
import { analyticsRangeSchema } from "@/lib/validation/platform";

/**
 * The operations dashboard, computed from live rows.
 *
 * The window is mandatory and bounded to 366 days, and it may not end in the
 * future — there is no data for a window that has not happened, and a dashboard
 * that silently accepted one would render last month's totals under this
 * month's heading.
 *
 * Every figure carries its own definition, the timestamp its window is applied
 * to, and whether it is complete. A metric that could not be computed comes back
 * as `null` with a `missingReason` rather than as a zero, because a zero is a
 * measurement and "we could not measure this" is not.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.analytics_read");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, analyticsRangeSchema, "That reporting window");
  if (!parsed.ok) return parsed.response;

  const overview = await analyticsOverview(parsed.data);
  return jsonOk({ overview });
}
