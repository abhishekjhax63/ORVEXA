import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { requestVerificationInfo } from "@/lib/platform/verifications";
import { verificationInfoRequestSchema } from "@/lib/validation/platform";

/**
 * Asks an applicant for something without deciding their request.
 *
 * The request stays pending, so it keeps its place in the queue and the next
 * reviewer can see what was asked. Nothing here can approve or reject.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("verification.review");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminDecisionWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, verificationInfoRequestSchema, "That information request");
  if (!parsed.ok) return parsed.response;

  const result = await requestVerificationInfo({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ requestId: result.data.requestId });
}
