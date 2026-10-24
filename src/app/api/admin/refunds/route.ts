import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listRefunds } from "@/lib/platform/support-desk";
import { refundFilterSchema } from "@/lib/validation/platform";

/**
 * The refund queue.
 *
 * Gated on `platform.refund_oversight`, which is separate from the support queue
 * because moving money back to a customer is a finance act rather than a
 * customer-service one. Each row carries `isSandbox`, so an operator cannot
 * mistake a sandbox refund for a real settlement.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.refund_oversight");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, refundFilterSchema, "That queue filter");
  if (!parsed.ok) return parsed.response;

  const result = await listRefunds({ context: session.context, filter: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ items: result.data.items, total: result.data.total });
}
