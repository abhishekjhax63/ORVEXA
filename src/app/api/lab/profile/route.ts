import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import {
  getLabProfileDetail,
  LAB_COMPLIANCE_POLICY_VERSION,
  LAB_COMPLIANCE_STATEMENT,
  saveLabProfile,
} from "@/lib/diagnostics/lab";
import { labProfileSchema } from "@/lib/validation/diagnostics";

/**
 * The laboratory's own profile.
 *
 * Saving never touches `verificationStatus` or `canPublishReports`: a partner
 * cannot verify itself, and the profile page is told exactly that so it can
 * render the state rather than imply one.
 */
export async function GET() {
  const session = await requireRoutePermission("lab.portal_access");
  if (!session.ok) return session.response;

  const profile = await getLabProfileDetail(session.user.id);
  return jsonOk({
    profile,
    complianceStatement: LAB_COMPLIANCE_STATEMENT,
    compliancePolicyVersion: LAB_COMPLIANCE_POLICY_VERSION,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("lab.portal_access");
  if (!session.ok) return session.response;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = labProfileSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That laboratory profile is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await saveLabProfile({ user: session.user, data: parsed.data });
  if (!result.ok) return jsonError(422, result.message, { code: result.code });

  return jsonOk({ labProfileId: result.labProfileId, created: result.created }, { status: result.created ? 201 : 200 });
}
