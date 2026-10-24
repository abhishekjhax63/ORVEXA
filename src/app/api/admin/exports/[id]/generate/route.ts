import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { generateReportExport } from "@/lib/platform/exports";

/**
 * Builds a queued export's file and stores it.
 *
 * The generation is a separate step from the request so the expensive part is an
 * explicit act with its own limit, and so a report whose window turns out to be
 * larger than expected can be narrowed without losing the request that asked for
 * it. A report over the row ceiling is refused rather than truncated: a partial
 * export that looks complete is the one outcome a report must never have.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformRoute("platform.export_reports");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminWrite", session.context);
  if (!limit.ok) return limit.response;

  const { id } = await params;
  const result = await generateReportExport({ context: session.context, exportId: id });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ export: result.data });
}
