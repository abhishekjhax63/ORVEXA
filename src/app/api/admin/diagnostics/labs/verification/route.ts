import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { setLabVerification } from "@/lib/diagnostics/lab";
import { labVerificationSchema } from "@/lib/validation/diagnostics";

/**
 * A platform reviewer's verification decision for one laboratory.
 *
 * This is the only path that writes `canPublishReports`, and the service forces
 * it false unless the decision is `VERIFIED` — so suspending or rejecting a
 * laboratory immediately closes its report desk rather than leaving a stale
 * release behind.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("verification.review");
  if (!session.ok) return session.response;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = labVerificationSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That verification decision is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await setLabVerification({
    actorUserId: session.user.id,
    actorLabel: session.user.fullName,
    data: parsed.data,
  });
  if (!result.ok) return jsonError(result.code === "not_found" ? 404 : 422, result.message, { code: result.code });

  return jsonOk({ labProfileId: result.labProfileId });
}
