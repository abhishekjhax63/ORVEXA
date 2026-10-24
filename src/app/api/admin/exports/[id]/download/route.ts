import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { createReportExportLink } from "@/lib/platform/exports";

/**
 * Mints a short-lived download link for a generated export.
 *
 * Every call re-checks the row: it must be `READY`, its file must still be in
 * storage, it must not have passed its retention date, and — for a report that
 * identifies people — the caller must still hold `audit.read`. A link that
 * lapsed during the request marks the row `EXPIRED` on the way through, so the
 * queue stops offering it. The link itself lives for five minutes, which is why
 * it is minted per download rather than stored on the row.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformRoute("platform.export_reports");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminExportDownload", session.context);
  if (!limit.ok) return limit.response;

  const { id } = await params;
  const result = await createReportExportLink({ context: session.context, exportId: id });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({
    url: result.data.url,
    expiresAt: result.data.expiresAt.toISOString(),
    fileName: result.data.fileName,
  });
}
