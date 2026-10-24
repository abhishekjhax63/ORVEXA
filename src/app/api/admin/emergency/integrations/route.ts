import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { integrationStatuses, probeIntegration } from "@/lib/platform/emergency-ops";
import { integrationProbeSchema } from "@/lib/validation/platform";

/**
 * Integration configuration, and a probe that records it as an alert.
 *
 * `GET` reports the configuration state of every outbound provider so an
 * operator can see at a glance which ones this deployment cannot use at all.
 * `POST` re-checks one provider and opens or resolves the corresponding alert,
 * so a missing messaging provider or dispatch webhook shows up in the same queue
 * as every other integration failure.
 *
 * Neither is a live vendor round-trip. Calling this "healthy" on the strength of
 * an environment variable would be exactly the unverified success the platform
 * forbids; what it honestly reports is whether the deployment is able to try.
 */
export async function GET() {
  const session = await requirePlatformRoute("platform.security_operations");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  return jsonOk({ integrations: integrationStatuses() });
}

export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.security_operations");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, integrationProbeSchema, "That integration");
  if (!parsed.ok) return parsed.response;

  const result = await probeIntegration({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk(result.data);
}
