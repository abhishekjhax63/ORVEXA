import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listFeatureFlags, upsertFeatureFlag } from "@/lib/platform/configuration";
import { featureFlagSchema } from "@/lib/validation/platform";

/**
 * Feature flags.
 *
 * One handler serves create and edit: `flagId` in the query string names an
 * existing flag, and its absence creates one. A flag defaults off and to a zero
 * rollout, and its key is immutable once it exists — renaming it would leave
 * every call site reading a key that no longer exists, and the failure would
 * look like the feature breaking rather than the flag being renamed.
 *
 * There is no delete. Withdrawing a feature is turning its flag off, which leaves
 * the audit trail intact and is reversible.
 */
export async function GET() {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  return jsonOk({ flags: await listFeatureFlags() });
}

export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminConfigWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, featureFlagSchema, "That feature flag");
  if (!parsed.ok) return parsed.response;

  const flagId = request.nextUrl.searchParams.get("flagId");
  const result = await upsertFeatureFlag({ context: session.context, flagId, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ flag: result.data });
}
