import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listPlatformSettings, updatePlatformSetting } from "@/lib/platform/configuration";
import { platformSettingWriteSchema } from "@/lib/validation/platform";

/**
 * The platform's own settings.
 *
 * The key set is closed and the value is re-validated on every read as well as
 * on every write, so a row that is wrong in the database renders as an invalid
 * setting with its reason rather than as configuration the platform might act
 * on. The label and description are editable; the key and its category are not,
 * because a client that could move a security setting into another category
 * would be choosing what an operator is allowed to see.
 */
export async function GET() {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  return jsonOk({ settings: await listPlatformSettings() });
}

export async function PATCH(request: NextRequest) {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminConfigWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, platformSettingWriteSchema, "That setting");
  if (!parsed.ok) return parsed.response;

  const result = await updatePlatformSetting({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ setting: result.data });
}
