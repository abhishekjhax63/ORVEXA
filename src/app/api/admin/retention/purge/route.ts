import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { runRetentionPurge } from "@/lib/platform/retention";
import { retentionPurgeSchema } from "@/lib/validation/platform";

/**
 * Runs the retention purge.
 *
 * `dryRun` defaults to true in the schema, so the first press reports what would
 * be removed and deletes nothing. A destructive run must be asked for
 * explicitly, which is why the schema — not this handler — owns the default: the
 * handler cannot accidentally invert it.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.retention_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRetentionRun", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, retentionPurgeSchema, "That purge request");
  if (!parsed.ok) return parsed.response;

  const result = await runRetentionPurge({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ summary: result.data });
}
