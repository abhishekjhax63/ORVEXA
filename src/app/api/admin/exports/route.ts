import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { REPORT_KEYS, listReportExports, requestReportExport } from "@/lib/platform/exports";
import { exportQueueFilterSchema, exportRequestSchema } from "@/lib/validation/platform";

/**
 * The export queue, newest first.
 *
 * Each row states whether it identifies people. That flag is decided by the
 * server — the catalogue's answer wins over the requester's declaration — so a
 * row labelled "aggregate" is one the platform agrees is aggregate.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.export_reports");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, exportQueueFilterSchema, "That queue filter");
  if (!parsed.ok) return parsed.response;

  const items = await listReportExports({ filter: parsed.data });
  return jsonOk({ items, reportKeys: REPORT_KEYS });
}

/**
 * Queues a report for export.
 *
 * The row is written before any file exists, so the request is on the record
 * even if generating it later fails. A report that identifies people requires
 * the `audit.read` permission on top of `platform.export_reports`, because a
 * person-level export is the same information the audit trail exists to protect.
 * The declared purpose is required and is shown to whoever reviews the log.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.export_reports");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminExportRequest", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, exportRequestSchema, "That export request");
  if (!parsed.ok) return parsed.response;

  const result = await requestReportExport({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ export: result.data });
}
