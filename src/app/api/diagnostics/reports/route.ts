import { jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { listPatientLabReports, REPORT_RESULT_DISCIPLINE_NOTICE } from "@/lib/diagnostics/reports";

/**
 * The signed-in patient's own laboratory reports.
 *
 * Only reports the laboratory has released are listed — a draft is the
 * laboratory's working document and is never shown here. The discipline notice
 * travels with the list so a page cannot render a result table without it.
 */
export async function GET() {
  const session = await requireRoutePermission("diagnostics.read_own");
  if (!session.ok) return session.response;

  const reports = await listPatientLabReports(session.user.id);
  return jsonOk({ reports, disciplineNotice: REPORT_RESULT_DISCIPLINE_NOTICE });
}
