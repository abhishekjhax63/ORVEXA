import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { updatePlatformStaffRole } from "@/lib/platform/staff";
import { platformStaffUpdateSchema } from "@/lib/validation/platform";

/**
 * Moves a member from one operations role to another.
 *
 * The service implements this as a close-and-open, so the history reads as two
 * decisions rather than as one row whose role silently changed under an older
 * audit entry.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.staff_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminStaffGrant", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, platformStaffUpdateSchema, "That role change");
  if (!parsed.ok) return parsed.response;

  const result = await updatePlatformStaffRole({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ member: result.data });
}
