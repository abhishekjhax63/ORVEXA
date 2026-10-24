import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { allowedPartnerApplicationTypes, decidePartnerApplication } from "@/lib/platform/verifications";
import { partnerApplicationDecisionSchema } from "@/lib/validation/platform";

/**
 * A reviewer's decision on a partner application.
 *
 * The same scope rule as the queue applies to the write: a reviewer cannot
 * decide a partner type that is outside their verification grants, even if they
 * reach this handler directly with a known application id. The service checks
 * it as well, because the service is also reachable from a Server Action.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("partner_application.review");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminDecisionWrite", session.context);
  if (!limit.ok) return limit.response;

  const allowedTypes = allowedPartnerApplicationTypes(session.context);
  if (allowedTypes.length === 0) {
    return jsonError(403, "Your operations role does not include any partner application type.", {
      code: "not_permitted",
    });
  }

  const parsed = await readConsoleBody(request, partnerApplicationDecisionSchema, "That decision");
  if (!parsed.ok) return parsed.response;

  const result = await decidePartnerApplication({
    context: session.context,
    data: parsed.data,
    allowedTypes,
  });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ applicationId: result.data.applicationId, status: result.data.status });
}
