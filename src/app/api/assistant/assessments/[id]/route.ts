import type { NextRequest } from "next/server";

import { getAssessment } from "@/lib/ai/conversations";
import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";

/**
 * A single saved assessment, re-rendered from its stored row.
 *
 * The view is rebuilt on the server from the row, so the safety line, the
 * urgency floor and the limitations notice are recomputed rather than trusted
 * to whatever the browser last held.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("ai.assess");
  if (!session.ok) return session.response;

  const { id } = await params;
  const assessment = await getAssessment({ ownerUserId: session.user.id, assessmentId: id });
  if (!assessment) return jsonError(404, "That assessment was not found on your account.");

  return jsonOk({ assessment });
}
