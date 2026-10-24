import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { decideAccountDeletion } from "@/lib/platform/retention";
import { accountDeletionDecisionSchema } from "@/lib/validation/platform";

/**
 * Resolves a deletion request.
 *
 * The service re-checks the retention obligations rather than trusting the state
 * at request time, and refuses `COMPLETE` when one applies. That check lives on
 * the server by necessity: a claim submitted during the grace period is exactly
 * the case a form cannot be trusted to notice.
 */
export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.account_deletion_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminDeletionWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, accountDeletionDecisionSchema, "That deletion decision");
  if (!parsed.ok) return parsed.response;

  const result = await decideAccountDeletion({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ request: result.data });
}
