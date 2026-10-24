import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { findPatientReportId, shareLabReport } from "@/lib/diagnostics/reports";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { labReportReferenceSchema, labReportShareSchema } from "@/lib/validation/diagnostics";

/**
 * Shares one published report through a time-limited link.
 *
 * Sharing is a second, deliberate decision on top of the booking consent, so the
 * service writes a consent record alongside the share. The plaintext token only
 * ever exists in the returned URL; the database holds its HMAC.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const session = await requireRoutePermission("diagnostics.report_share_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("diagnosticReportShare", `user:${session.user.id}`, RATE_LIMITS.diagnosticReportShare);
  if (!limit.allowed) {
    return jsonError(429, "Too many share links created. Wait a moment and try again.", {
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
  const parsed = labReportShareSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That share request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const report = await findPatientReportId({ userId: session.user.id, reference: parsedReference.data });
  if (!report) return jsonError(404, "That report was not found on your account.");
  if (report.id !== parsed.data.reportId) {
    return jsonError(400, "The report id in the request did not match the report being shared.");
  }

  const result = await shareLabReport({
    actor: { userId: session.user.id, role: "PATIENT", label: session.user.fullName },
    ownerUserId: session.user.id,
    reportId: report.id,
    sharedWithEmail: parsed.data.sharedWithEmail ?? null,
    sharedWithLabel: parsed.data.sharedWithLabel ?? null,
    canDownload: parsed.data.canDownload,
    expiresInHours: parsed.data.expiresInHours,
  });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "recipient_required" ? 409 : 422;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk(
    { share: { id: result.shareId, url: result.url, expiresAt: result.expiresAt } },
    { status: 201 },
  );
}
