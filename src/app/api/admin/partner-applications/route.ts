import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { allowedPartnerApplicationTypes, listPartnerApplications } from "@/lib/platform/verifications";
import { partnerApplicationFilterSchema } from "@/lib/validation/platform";

/**
 * Partner applications awaiting review, submitted first.
 *
 * Two gates, and they do different jobs. `partner_application.review` decides
 * whether the account may work this queue at all; the operator's verification
 * grants decide which *kinds* of application the queue contains. A pharmacy
 * reviewer therefore opens a queue of pharmacy applications, not a list of every
 * partner the platform is onboarding — which is what "least privilege" has to
 * mean for a queue that shows an organisation's registration papers.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("partner_application.review");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const allowedTypes = allowedPartnerApplicationTypes(session.context);
  if (allowedTypes.length === 0) {
    return jsonError(403, "Your operations role does not include any partner application type.", {
      code: "not_permitted",
    });
  }

  const parsed = readConsoleQuery(request, partnerApplicationFilterSchema, "That queue filter");
  if (!parsed.ok) return parsed.response;

  const result = await listPartnerApplications({
    context: session.context,
    filter: parsed.data,
    allowedTypes,
  });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ items: result.data.items, total: result.data.total, allowedTypes });
}
