import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { revokePlatformStaffRole } from "@/lib/platform/staff";
import { platformStaffRevokeSchema } from "@/lib/validation/platform";

/**
 * Revokes a platform operations role.
 *
 * An operator cannot close their own membership — that would sign them out
 * mid-action and, if it were their only membership, be unrecoverable from inside
 * the console. Another administrator has to do it, which the service enforces.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.staff_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminStaffGrant", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, platformStaffRevokeSchema, "That revocation");
  if (!parsed.ok) return parsed.response;

  const result = await revokePlatformStaffRole({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ member: result.data });
}
