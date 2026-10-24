import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listAccountDeletionRequests } from "@/lib/platform/retention";
import { accountDeletionFilterSchema } from "@/lib/validation/platform";

/**
 * Open and decided account-deletion requests.
 *
 * Read from the platform console only; the person's own request is raised and
 * withdrawn from their account settings, against their own session. This screen
 * exists so a request cannot sit unexamined, not so an operator can start one.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.account_deletion_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, accountDeletionFilterSchema, "That deletion filter");
  if (!parsed.ok) return parsed.response;

  const items = await listAccountDeletionRequests({ status: parsed.data.status });

  return jsonOk({ items });
}
