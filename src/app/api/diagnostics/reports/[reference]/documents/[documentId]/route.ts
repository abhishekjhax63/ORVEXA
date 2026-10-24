import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { createPatientReportDocumentLink, findPatientReportId } from "@/lib/diagnostics/reports";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { labReportDocumentLinkSchema, labReportReferenceSchema } from "@/lib/validation/diagnostics";

/**
 * A short-lived signed link to one file on the patient's own report.
 *
 * The link expires in five minutes and is audited, which is why this is a POST
 * rather than something a browser or proxy can cache and re-serve. A draft
 * report has no readable file: the request is refused rather than issued and
 * hidden.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string; documentId: string }> },
) {
  const session = await requireRoutePermission("diagnostics.read_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit(
    "diagnosticReportDownload",
    `user:${session.user.id}`,
    RATE_LIMITS.diagnosticReportDownload,
  );
  if (!limit.allowed) {
    return jsonError(429, "Too many file requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { reference, documentId } = await params;
  const parsedReference = labReportReferenceSchema.safeParse(decodeURIComponent(reference));
  if (!parsedReference.success) {
    return jsonError(422, "That report reference is not valid.", { fieldErrors: zodFieldErrors(parsedReference.error) });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = labReportDocumentLinkSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const report = await findPatientReportId({ userId: session.user.id, reference: parsedReference.data });
  if (!report) return jsonError(404, "That report was not found on your account.");

  const link = await createPatientReportDocumentLink({
    ownerUserId: session.user.id,
    reportId: report.id,
    documentId: decodeURIComponent(documentId),
    download: parsed.data.download,
  });
  if (!link.ok) return jsonError(link.code === "not_found" ? 404 : 409, link.message, { code: link.code });

  return jsonOk({
    url: link.url,
    expiresAt: link.expiresAt,
    fileName: link.fileName,
    mimeType: link.mimeType,
  });
}
