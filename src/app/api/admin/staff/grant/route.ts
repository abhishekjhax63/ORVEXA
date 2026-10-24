import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { grantPlatformStaffRole } from "@/lib/platform/staff";
import { platformStaffGrantSchema } from "@/lib/validation/platform";

/**
 * Grants a platform operations role.
 *
 * The target is named by email and resolved server-side, so a form cannot grant
 * a queue to an arbitrary identifier. `canGrantPlatformStaffRole` inside the
 * service refuses a self-grant as well as a grant from an operator without
 * `platform.staff_manage` — the second being impossible to reach through this
 * route, and checked anyway because the service is the last line.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.staff_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminStaffGrant", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, platformStaffGrantSchema, "That staff grant");
  if (!parsed.ok) return parsed.response;

  const result = await grantPlatformStaffRole({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ member: result.data });
}
