import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { uploadLabReportDocument } from "@/lib/diagnostics/reports";
import { DOCUMENT_MAX_BYTES } from "@/lib/documents/storage";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { LAB_REPORT_DOCUMENT_KINDS } from "@/lib/validation/diagnostics";

const kindSchema = z.enum(LAB_REPORT_DOCUMENT_KINDS);

/**
 * Stores one signed file against a draft report.
 *
 * The bytes are written before the row, so a failed upload never leaves a row
 * pointing at nothing; a malware verdict is recorded either way and an infected
 * file is removed rather than kept. Uploading to a published report is refused —
 * the report must be taken back for amendment first.
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
  if (!lab) return jsonError(409, "Create your laboratory profile to attach a report file.");

  const bodyCeiling = DOCUMENT_MAX_BYTES + 512 * 1024;
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > bodyCeiling) {
    return jsonError(413, `That upload is larger than the ${Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024))} MB limit. Nothing was stored.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Send this upload as multipart form data.");
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) return jsonError(400, "This upload did not include a file.");
  if (file.size <= 0) return jsonError(422, "That file is empty.");
  if (file.size > DOCUMENT_MAX_BYTES) {
    return jsonError(413, `That file is larger than the ${Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024))} MB limit. Nothing was stored.`);
  }

  const parsedKind = kindSchema.safeParse(form.get("kind") ?? "REPORT");
  if (!parsedKind.success) {
    return jsonError(422, "That document kind is not valid.", { fieldErrors: zodFieldErrors(parsedKind.error) });
  }

  const { id } = await params;
  const fileName = file instanceof File && file.name ? file.name : "report";
  const bytes = new Uint8Array(await file.arrayBuffer());

  const result = await uploadLabReportDocument({
    actor: { userId: session.user.id, role: "LAB_PARTNER", label: session.user.fullName },
    labProfileId: lab.id,
    reportId: decodeURIComponent(id),
    kind: parsedKind.data,
    fileName,
    mimeType: file.type || "application/octet-stream",
    bytes,
  });
  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "document_rejected"
          ? 422
          : result.code === "storage_not_configured"
            ? 503
            : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk(
    {
      document: {
        id: result.documentId,
        fileName: result.fileName,
        malwareScan: result.malwareScan,
        malwareScanDetail: result.malwareScanDetail,
      },
    },
    { status: 201 },
  );
}
