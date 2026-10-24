import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listDispatchTrouble } from "@/lib/platform/emergency-ops";
import { dispatchTroubleFilterSchema } from "@/lib/validation/platform";

/**
 * Dispatch requests that failed or were never acknowledged.
 *
 * Two different failures are returned together because from a dispatcher's seat
 * they are one problem: nobody has answered. Demo incidents are excluded — a
 * rehearsal's failure is not an operational event.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.emergency_operations");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, dispatchTroubleFilterSchema, "That dispatch filter");
  if (!parsed.ok) return parsed.response;

  const items = await listDispatchTrouble({ limit: parsed.data.pageSize });

  return jsonOk({ items, truncated: items.length >= parsed.data.pageSize });
}
