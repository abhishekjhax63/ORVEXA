import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { decidePlatformRefund } from "@/lib/platform/support-desk";
import { refundDecisionSchema } from "@/lib/validation/platform";

/**
 * Approves a refund for settlement, or declines it.
 *
 * The console cannot write `PROCESSED`. The settlement code records `PROCESSING`
 * when the gateway accepts the instruction and `PROCESSED` only when the gateway
 * confirms it, and the status returned here is read back from the row — so the
 * console can never display a settled refund that has not settled.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.refund_oversight");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminDecisionWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, refundDecisionSchema, "That refund decision");
  if (!parsed.ok) return parsed.response;

  const result = await decidePlatformRefund({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ refundId: result.data.refundId, status: result.data.status });
}
