import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listPlatformStaff } from "@/lib/platform/staff";
import { platformStaffFilterSchema } from "@/lib/validation/platform";

/**
 * Platform operations staff.
 *
 * Gated on `platform.staff_manage`, which is the escalation boundary: this is
 * the only queue from which a person's privileges can be widened, so it is
 * deliberately narrower than the console itself. Each row reports `isSelf` so
 * the screen can stop an operator from closing their own membership.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.staff_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, platformStaffFilterSchema, "That staff filter");
  if (!parsed.ok) return parsed.response;

  const items = await listPlatformStaff({ context: session.context, filter: parsed.data });

  return jsonOk({ items });
}
