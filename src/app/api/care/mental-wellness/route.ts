import type { NextRequest } from "next/server";

import { jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { listCrisisResources, listMentalWellnessResources } from "@/lib/care/directory";

/**
 * Mental wellness material.
 *
 * The ordinary material and the crisis resources are returned under two distinct
 * keys so a client can never render a helpline as an ordinary article. The crisis
 * list is never gated tighter than plain workspace access and is never filtered
 * by language: a person in distress must always be able to find the number,
 * whatever language the rest of the shelf is filed in.
 */
export async function GET(_request: NextRequest) {
  const session = await requireRoutePermission("care.workspace_access");
  if (!session.ok) return session.response;

  const [resources, crisisResources] = await Promise.all([
    listMentalWellnessResources({}),
    listCrisisResources(),
  ]);

  return jsonOk({ resources, crisisResources });
}
