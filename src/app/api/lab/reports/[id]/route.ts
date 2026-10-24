import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { getLabReportForOwner, REPORT_RESULT_DISCIPLINE_NOTICE } from "@/lib/diagnostics/reports";

/**
 * One report as its own laboratory sees it, working state included.
 *
 * The report must belong to the signed-in account's laboratory, so this is never
 * a cross-tenant read.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("lab.booking_manage");
  if (!session.ok) return session.response;

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile to see the report desk.");

  const { id } = await params;
  const report = await getLabReportForOwner({ labProfileId: lab.id, reportId: decodeURIComponent(id) });
  if (!report) return jsonError(404, "That report was not found for your laboratory.");

  return jsonOk({
    report,
    disciplineNotice: REPORT_RESULT_DISCIPLINE_NOTICE,
    canPublishReports: lab.canPublishReports,
  });
}
