import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { listCareServiceRequestsForStaff } from "@/lib/care/directory";

/**
 * The care service request queue.
 *
 * Unlike a person's own list, this one carries the requester's contact details —
 * a home-visit request is useless to whoever is arranging it without a phone
 * number — which is exactly why it requires the manage permission and returns a
 * 403 rather than degrading to a patient view.
 */
export async function GET(_request: NextRequest) {
  const session = await requireRoutePermission("care.service_request_manage");
  if (!session.ok) return session.response;

  const result = await listCareServiceRequestsForStaff({ user: session.user });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ requests: result.data });
}
