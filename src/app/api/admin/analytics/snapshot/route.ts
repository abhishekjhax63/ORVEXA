import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { recordOperationalSnapshot } from "@/lib/platform/analytics";
import { analyticsRangeSchema } from "@/lib/validation/platform";

/**
 * Stores the current dashboard as `OperationalMetric` rows.
 *
 * The window is part of the row's identity, so re-running a snapshot for the
 * same window updates it instead of appending a duplicate — which is what makes
 * a scheduled snapshot safe to retry.
 *
 * A metric that computed to null is skipped rather than stored as zero. The
 * number of skipped metrics is returned so the caller can see that a window with
 * no activity produced an empty snapshot rather than a wrong one.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.analytics_read");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, analyticsRangeSchema, "That reporting window");
  if (!parsed.ok) return parsed.response;

  const result = await recordOperationalSnapshot({ context: session.context, range: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ recorded: result.data.recorded, skipped: result.data.skipped });
}
