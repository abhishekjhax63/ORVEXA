import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listSupportedRegions, removeSupportedRegion, upsertSupportedRegion } from "@/lib/platform/configuration";
import { regionEntrySchema } from "@/lib/validation/platform";

/**
 * The regions the platform serves.
 *
 * A region's code is an ISO 3166 country code plus an optional subdivision, so
 * "do we operate in Karnataka" is answerable by a machine rather than by reading
 * a label. A removal names the code in the query string and is refused when that
 * code is not configured, so an operator cannot believe a region was withdrawn
 * when the write did nothing.
 */
export async function GET() {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  return jsonOk({ regions: await listSupportedRegions() });
}

export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminConfigWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, regionEntrySchema, "That region");
  if (!parsed.ok) return parsed.response;

  const result = await upsertSupportedRegion({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ regions: result.data });
}

export async function DELETE(request: NextRequest) {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminConfigWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = regionEntrySchema.pick({ code: true }).safeParse({ code: request.nextUrl.searchParams.get("code") });
  if (!parsed.success) return jsonError(422, "That region code is not valid.");

  const result = await removeSupportedRegion({ context: session.context, code: parsed.data.code });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ regions: result.data });
}
