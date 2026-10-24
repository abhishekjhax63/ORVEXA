import { jsonError, jsonOk, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { findPatientReportId, revokeLabReportShare } from "@/lib/diagnostics/reports";
import { labReportReferenceSchema } from "@/lib/validation/diagnostics";

/**
 * Withdraws a share link the patient created.
 *
 * Revoking is idempotent — a link that is already dead reports success, because
 * the caller's intent is satisfied either way. The share must belong to the
 * signed-in account and to the report named in the path.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ reference: string; shareId: string }> },
) {
  const session = await requireRoutePermission("diagnostics.report_share_own");
  if (!session.ok) return session.response;

  const { reference, shareId } = await params;
  const parsedReference = labReportReferenceSchema.safeParse(decodeURIComponent(reference));
  if (!parsedReference.success) {
    return jsonError(422, "That report reference is not valid.", { fieldErrors: zodFieldErrors(parsedReference.error) });
  }

  const report = await findPatientReportId({ userId: session.user.id, reference: parsedReference.data });
  if (!report) return jsonError(404, "That report was not found on your account.");

  const result = await revokeLabReportShare({
    actor: { userId: session.user.id, role: "PATIENT", label: session.user.fullName },
    ownerUserId: session.user.id,
    shareId: decodeURIComponent(shareId),
  });
  if (!result.ok) return jsonError(result.code === "share_not_found" ? 404 : 409, result.message, { code: result.code });

  return jsonOk({ revoked: result.revoked, reference: report.reference });
}
