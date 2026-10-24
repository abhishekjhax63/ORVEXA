import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listVerificationQueue } from "@/lib/platform/verifications";
import { verificationQueueFilterSchema } from "@/lib/validation/platform";

/**
 * The verification queue, oldest first.
 *
 * Gated on `verification.review`, which the hospital, doctor and laboratory
 * reviewers hold. The subject type is a filter rather than a scope, because the
 * queue row is the record of what was submitted and a reviewer needs to be able
 * to see the request they are deciding even after the subject has been edited.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("verification.review");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, verificationQueueFilterSchema, "That queue filter");
  if (!parsed.ok) return parsed.response;

  const result = await listVerificationQueue({ context: session.context, filter: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ items: result.data.items, total: result.data.total });
}
