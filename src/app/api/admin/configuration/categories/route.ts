import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listServiceCategories, removeServiceCategory, upsertServiceCategory } from "@/lib/platform/configuration";
import { serviceCategorySchema } from "@/lib/validation/platform";

/**
 * The bookable service catalogue.
 *
 * Entries are stored inside one platform setting but edited one at a time: the
 * service reads the whole array, changes the single member, re-validates the
 * whole array and writes it back. That is why a removal is refused when the key
 * is not configured — a silent no-op would let an operator believe a category
 * had been withdrawn while it was still live.
 */
export async function GET() {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  return jsonOk({ categories: await listServiceCategories() });
}

export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminConfigWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, serviceCategorySchema, "That service category");
  if (!parsed.ok) return parsed.response;

  const result = await upsertServiceCategory({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ categories: result.data });
}

export async function DELETE(request: NextRequest) {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminConfigWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = serviceCategorySchema.pick({ key: true }).safeParse({ key: request.nextUrl.searchParams.get("key") });
  if (!parsed.success) return jsonError(422, "That service category key is not valid.");

  const result = await removeServiceCategory({ context: session.context, key: parsed.data.key });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ categories: result.data });
}
