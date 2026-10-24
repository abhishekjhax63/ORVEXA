import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { DOCUMENT_MAX_BYTES } from "@/lib/documents/storage";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { uploadConsultationAttachment } from "@/lib/telemedicine/messages";

/**
 * Stores one file for a consultation's chat.
 *
 * The bytes are scanned before they are written, so a file the scanner rejected
 * is never stored. The scan verdict is reported verbatim: on a deployment with
 * no scanner configured the verdict is `SKIPPED`, and that is what the caller is
 * told. The returned key must sit under the uploader's own prefix, which is what
 * keeps one participant's file from being attached to another's consultation.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("fileUpload", `user:${session.user.id}`, RATE_LIMITS.fileUpload);
  if (!limit.allowed) {
    return jsonError(429, "Too many uploads. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const bodyCeiling = DOCUMENT_MAX_BYTES + 512 * 1024;
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > bodyCeiling) {
    return jsonError(
      413,
      `That upload is larger than the ${Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024))} MB limit. Nothing was stored.`,
    );
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
    return jsonError(
      413,
      `That file is larger than the ${Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024))} MB limit. Nothing was stored.`,
    );
  }

  const { id } = await params;
  const fileName = file instanceof File && file.name ? file.name : "attachment";
  const bytes = new Uint8Array(await file.arrayBuffer());

  const result = await uploadConsultationAttachment({
    actor: {
      userId: session.user.id,
      role: session.user.roles.includes("DOCTOR") ? "DOCTOR" : "PATIENT",
      label: session.user.fullName,
    },
    appointmentId: decodeURIComponent(id),
    fileName,
    mimeType: file.type || "application/octet-stream",
    bytes,
  });
  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "not_a_participant"
          ? 403
          : result.code === "invalid_attachment" || result.code === "attachment_rejected"
            ? 422
            : result.code === "storage_not_configured"
              ? 503
              : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ attachment: result.attachment }, { status: 201 });
}
