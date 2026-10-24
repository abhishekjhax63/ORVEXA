import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { exchangeLabReport, findPatientReportId } from "@/lib/diagnostics/reports";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { labReportExchangeSchema, labReportReferenceSchema } from "@/lib/validation/diagnostics";

/**
 * Sends an authenticated report to a recipient's system.
 *
 * The strongest claim this endpoint can make is transport acceptance, and the
 * exchange outcome is returned verbatim — `not_configured`, `not_supported` and
 * `failed` are all first-class answers. Nothing here reports a report as
 * received by a clinician.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const session = await requireRoutePermission("diagnostics.report_share_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("diagnosticReportShare", `user:${session.user.id}`, RATE_LIMITS.diagnosticReportShare);
  if (!limit.allowed) {
    return jsonError(429, "Too many exchange attempts. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { reference } = await params;
  const parsedReference = labReportReferenceSchema.safeParse(decodeURIComponent(reference));
  if (!parsedReference.success) {
    return jsonError(422, "That report reference is not valid.", { fieldErrors: zodFieldErrors(parsedReference.error) });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = labReportExchangeSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That exchange request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const report = await findPatientReportId({ userId: session.user.id, reference: parsedReference.data });
  if (!report) return jsonError(404, "That report was not found on your account.");
  if (report.id !== parsed.data.reportId) {
    return jsonError(400, "The report id in the request did not match the report being exchanged.");
  }

  const result = await exchangeLabReport({
    actor: { userId: session.user.id, role: "PATIENT", label: session.user.fullName },
    ownerUserId: session.user.id,
    reportId: report.id,
    recipient: {
      name: parsed.data.recipientName,
      reference: parsed.data.recipientReference,
      kind: parsed.data.recipientKind,
    },
  });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  // A 200 here means the exchange ran, not that it succeeded.
  return jsonOk({ reference: report.reference, exchange: result.outcome });
}
