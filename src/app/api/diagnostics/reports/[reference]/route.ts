import { jsonError, jsonOk, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getPatientLabReportByReference, REPORT_RESULT_DISCIPLINE_NOTICE } from "@/lib/diagnostics/reports";
import { labReportReferenceSchema } from "@/lib/validation/diagnostics";

/**
 * One report, for the patient who owns it.
 *
 * `contentAvailable` is false for a withdrawn or in-amendment report: the page is
 * told the release state plainly rather than being handed a stale result table.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const session = await requireRoutePermission("diagnostics.read_own");
  if (!session.ok) return session.response;

  const { reference } = await params;
  const parsed = labReportReferenceSchema.safeParse(decodeURIComponent(reference));
  if (!parsed.success) {
    return jsonError(422, "That report reference is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await getPatientLabReportByReference({ userId: session.user.id, reference: parsed.data });
  if (!result) return jsonError(404, "That report was not found on your account.");

  return jsonOk({
    report: result.report,
    contentAvailable: result.contentAvailable,
    disciplineNotice: REPORT_RESULT_DISCIPLINE_NOTICE,
  });
}
