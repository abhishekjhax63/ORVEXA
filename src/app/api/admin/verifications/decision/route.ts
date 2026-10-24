import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { decideVerification } from "@/lib/platform/verifications";
import { verificationDecisionSchema } from "@/lib/validation/platform";

/**
 * A reviewer's decision on one verification request.
 *
 * The reviewer's identity is taken from the session by the service, so there is
 * no field here for one. A rejection without a written reason is refused twice —
 * by the schema and again by the service — because an unexplained rejection
 * leaves the applicant with nothing to act on.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("verification.review");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminDecisionWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, verificationDecisionSchema, "That decision");
  if (!parsed.ok) return parsed.response;

  const result = await decideVerification({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({
    requestId: result.data.requestId,
    status: result.data.status,
    subjectState: result.data.subjectState,
  });
}
