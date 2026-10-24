import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { updateGrievance } from "@/lib/platform/support-desk";
import { complaintUpdateSchema } from "@/lib/validation/platform";

/**
 * The platform's intervention on a hospital grievance.
 *
 * Every change writes a `ComplaintUpdate` row attributed to the platform, so the
 * hospital reading its own complaint can see that ORVEXA acted and why. The
 * hospital is recorded on the audit line as well as on the complaint, which is
 * what lets that hospital's administrator find the intervention in their own
 * trail.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.grievance_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminSupportWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, complaintUpdateSchema, "That grievance change");
  if (!parsed.ok) return parsed.response;

  const result = await updateGrievance({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ complaintId: result.data.complaintId, status: result.data.status });
}
