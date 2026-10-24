import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { submitLabProfileForReview } from "@/lib/diagnostics/lab";

/**
 * Submits the laboratory profile for review.
 *
 * The application stops at `SUBMITTED`/`PENDING`: approval is a reviewer's act,
 * so a partner cannot put itself in the discovery list or release a report by
 * pressing this button.
 */
export async function POST() {
  const session = await requireRoutePermission("lab.portal_access");
  if (!session.ok) return session.response;

  const result = await submitLabProfileForReview({ user: session.user });
  if (!result.ok) return jsonError(result.code === "not_found" ? 409 : 422, result.message, { code: result.code });

  return jsonOk({ labProfileId: result.labProfileId, status: result.status });
}
