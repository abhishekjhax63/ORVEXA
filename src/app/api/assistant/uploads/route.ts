import type { NextRequest } from "next/server";

import { UPLOAD_LIMITS } from "@/lib/ai/capabilities";
import { transcribeAudio } from "@/lib/ai/turn";
import { acceptUpload, deleteUpload } from "@/lib/ai/uploads";
import { formatBytes } from "@/lib/ai/validation";
import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * Accept one upload for a conversation.
 *
 * Three checks happen before the body is read, in this order:
 *
 *  1. The declared `Content-Length` is compared against the ceiling, so a huge
 *     body is refused rather than buffered into memory first.
 *  2. The multipart part is checked to be a file rather than a field.
 *  3. The file's own size is checked before `arrayBuffer()` is called.
 *
 * Everything after that — declared type, sniffed container, malware verdict,
 * storage — is enforced inside `acceptUpload`, which never trusts the browser's
 * claim about what a file is.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("ai.assess");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("aiUpload", `user:${session.user.id}`, RATE_LIMITS.aiUpload);
  if (!limit.allowed) {
    return jsonError(429, "Too many uploads. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  // Multipart adds a boundary and headers on top of the file, so the body
  // ceiling is slightly above the file ceiling.
  const bodyCeiling = UPLOAD_LIMITS.maxFileBytes + 512 * 1024;
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > bodyCeiling) {
    return jsonError(413, `That upload is larger than the ${formatBytes(UPLOAD_LIMITS.maxFileBytes)} limit. Nothing was stored.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Send this upload as multipart form data.");
  }

  const conversationId = form.get("conversationId");
  if (typeof conversationId !== "string" || conversationId.trim().length === 0) {
    return jsonError(400, "This upload did not name the conversation it belongs to.");
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return jsonError(400, "This upload did not include a file.");
  }

  if (file.size <= 0) {
    return jsonError(422, "That file is empty.");
  }

  if (file.size > UPLOAD_LIMITS.maxFileBytes) {
    return jsonError(413, `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(UPLOAD_LIMITS.maxFileBytes)}.`);
  }

  const fileName = file instanceof File && file.name ? file.name : "upload";
  const bytes = new Uint8Array(await file.arrayBuffer());

  const outcome = await acceptUpload({
    ownerUserId: session.user.id,
    conversationId: conversationId.trim(),
    fileName,
    declaredMimeType: file.type || "application/octet-stream",
    bytes,
    // A voice note is transcribed at upload time so the user can correct the
    // words before they are used. A null result is recorded as "not read".
    transcribe: (audioBytes, mimeType) =>
      transcribeAudio({ ownerUserId: session.user.id, conversationId: conversationId.trim(), bytes: audioBytes, mimeType }),
  });

  if (!outcome.ok) {
    return jsonError(outcome.status, outcome.rejection.message, { code: outcome.rejection.code });
  }

  return jsonOk({ upload: outcome.upload }, { status: 201 });
}

/**
 * Remove an upload before it is used.
 *
 * The bytes are deleted first and the row is kept, so a later assessment can
 * still explain that a file was withdrawn rather than silently losing it.
 */
export async function DELETE(request: NextRequest) {
  const session = await requireRoutePermission("ai.assess");
  if (!session.ok) return session.response;

  const uploadId = request.nextUrl.searchParams.get("uploadId")?.trim();
  if (!uploadId) return jsonError(400, "Name the upload to remove.");

  const result = await deleteUpload({ ownerUserId: session.user.id, uploadId });
  if (!result.ok) return jsonError(404, result.message);

  return jsonOk({ removed: true, alreadyGone: result.alreadyGone });
}
