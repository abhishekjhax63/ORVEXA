import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { decideAbuseReport } from "@/lib/platform/support-desk";
import { abuseReportDecisionSchema } from "@/lib/validation/platform";

/**
 * The enforcement decision on an abuse report.
 *
 * The deciding operator is stamped from the session so the allegation has an
 * owner, and the report is never removed — it is the evidence that a complaint
 * was taken seriously.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.grievance_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminDecisionWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, abuseReportDecisionSchema, "That decision");
  if (!parsed.ok) return parsed.response;

  const result = await decideAbuseReport({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ reportId: result.data.reportId, status: result.data.status });
}
