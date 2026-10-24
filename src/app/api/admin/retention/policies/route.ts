import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listRetentionPolicies, updateRetentionPolicy } from "@/lib/platform/retention";
import { retentionPolicySchema } from "@/lib/validation/platform";

/**
 * Retention policies, one row per data class.
 *
 * `floorDays` is returned alongside the window so the console can show why a
 * number it is displaying cannot be lowered: the audit window has a floor, and a
 * form that silently refused the edit would look like a bug rather than a rule.
 */
export async function GET() {
  const session = await requirePlatformRoute("platform.retention_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  return jsonOk({ policies: await listRetentionPolicies() });
}

export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.retention_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminConfigWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, retentionPolicySchema, "That retention policy");
  if (!parsed.ok) return parsed.response;

  const result = await updateRetentionPolicy({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ policy: result.data });
}
