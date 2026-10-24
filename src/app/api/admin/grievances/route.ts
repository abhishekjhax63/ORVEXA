import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listGrievances } from "@/lib/platform/support-desk";
import { complaintFilterSchema } from "@/lib/validation/platform";

/**
 * Grievances raised against hospitals, most severe first.
 *
 * This is one of the two places in the platform that reads across hospital
 * tenants by design, the other being the audit trail. A complaint a patient
 * escalated to ORVEXA is the platform's to answer, and the platform's support
 * desk is the only account type that can reach this handler — the guard is
 * `platform.grievance_manage`, which a hospital's own staff never hold, because
 * hospital staff roles come from `HospitalStaffRole` and are resolved against a
 * single hospital.
 *
 * The response marks each row's `isDemo` state rather than hiding it. A
 * demonstration complaint is not evidence of anything, and a queue that filtered
 * it out would let a synthetic row be counted as a real grievance.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.grievance_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, complaintFilterSchema, "That queue filter");
  if (!parsed.ok) return parsed.response;

  const result = await listGrievances({ context: session.context, filter: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ items: result.data.items, total: result.data.total });
}
