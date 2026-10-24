import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { publishLabReport } from "@/lib/diagnostics/reports";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { labReportPublishSchema } from "@/lib/validation/diagnostics";

/**
 * Releases a report to the patient. This is the clinical act.
 *
 * The request must name the laboratory's own authenticator and their
 * registration number, and the laboratory must have been released by a platform
 * reviewer (`canPublishReports`). Four conditions are therefore enforced before
 * anything becomes visible: the report has a signed file or a result line, the
 * authenticator is named, the laboratory is verified and approved, and the
 * report desk has been released for it. Any one of them missing and nothing is
 * published.
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
  if (!lab) return jsonError(409, "Create your laboratory profile to release a report.");

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = labReportPublishSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That release request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }
  if (parsed.data.reportId !== decodeURIComponent(id)) {
    return jsonError(400, "The report id in the request did not match the report being released.");
  }

  const result = await publishLabReport({
    actor: { userId: session.user.id, role: "LAB_PARTNER", label: session.user.fullName },
    labProfileId: lab.id,
    reportId: parsed.data.reportId,
    authenticatedByName: parsed.data.authenticatedByName,
    authenticatedByRegistration: parsed.data.authenticatedByRegistration,
    reportedAt: parsed.data.reportedAt ?? null,
    sampleCollectedAt: parsed.data.sampleCollectedAt ?? null,
    interpretation: parsed.data.interpretation ?? null,
  });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "not_publishable" ? 422 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ reportId: result.reportId, reference: result.reference, status: result.status });
}
