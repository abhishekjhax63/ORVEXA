import { jsonError, jsonOk, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { findPatientReportId, listReportAccessLog } from "@/lib/diagnostics/reports";
import { labReportReferenceSchema } from "@/lib/validation/diagnostics";

/**
 * The access history for one of the patient's own reports.
 *
 * This is the patient's view of who has touched their record: uploads,
 * publication, their own reads and downloads, and every time a share link was
 * resolved. Only the owners of the report can read it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const session = await requireRoutePermission("diagnostics.read_own");
  if (!session.ok) return session.response;

  const { reference } = await params;
  const parsed = labReportReferenceSchema.safeParse(decodeURIComponent(reference));
  if (!parsed.success) {
    return jsonError(422, "That report reference is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const report = await findPatientReportId({ userId: session.user.id, reference: parsed.data });
  if (!report) return jsonError(404, "That report was not found on your account.");

  const entries = await listReportAccessLog(report.id);
  return jsonOk({ reference: report.reference, entries });
}
