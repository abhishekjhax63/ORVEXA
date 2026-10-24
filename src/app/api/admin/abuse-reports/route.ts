import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { createAbuseReport, listAbuseReports } from "@/lib/platform/support-desk";
import { abuseReportCreateSchema, abuseReportFilterSchema } from "@/lib/validation/platform";

/**
 * The abuse and trust-and-safety queue.
 *
 * Gated on `platform.grievance_manage` rather than on the support queue itself:
 * an abuse report is an allegation about a person's conduct, and the permission
 * that says "this account answers complaints" is the right one for it. The
 * report is never deleted, and a decision on it requires written reasoning —
 * an allegation that was closed without a reason is not an answerable record.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.grievance_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, abuseReportFilterSchema, "That queue filter");
  if (!parsed.ok) return parsed.response;

  const result = await listAbuseReports({ context: session.context, filter: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ items: result.data.items, total: result.data.total });
}

/**
 * Records an abuse report.
 *
 * Available to the support desk on behalf of somebody who reported abuse through
 * another channel. The reference is allocated server-side, so one report can
 * never be written over another's.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.grievance_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminSupportWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, abuseReportCreateSchema, "That abuse report");
  if (!parsed.ok) return parsed.response;

  const result = await createAbuseReport({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ reportId: result.data.reportId, reference: result.data.reference });
}
