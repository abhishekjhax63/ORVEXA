import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { saveLabReportResults } from "@/lib/diagnostics/reports";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { labReportResultsSchema } from "@/lib/validation/diagnostics";

/**
 * Replaces the analyte lines on a draft report.
 *
 * The lines are the laboratory's own text and units. Nothing here parses,
 * converts or normalises a value, and `flag` is whatever the laboratory chose —
 * the discipline notice is rendered next to the table, not inferred by ORVEXA.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("lab.booking_manage");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("diagnosticReportWrite", `user:${session.user.id}`, RATE_LIMITS.diagnosticReportWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many report actions. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile to edit a report.");

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = labReportResultsSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "Those result lines are not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }
  if (parsed.data.reportId !== decodeURIComponent(id)) {
    return jsonError(400, "The report id in the request did not match the report being edited.");
  }

  const result = await saveLabReportResults({
    actor: { userId: session.user.id, role: "LAB_PARTNER", label: session.user.fullName },
    labProfileId: lab.id,
    reportId: parsed.data.reportId,
    results: parsed.data.results,
  });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "report_not_editable" ? 409 : 422;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ reportId: result.reportId, saved: result.saved });
}
