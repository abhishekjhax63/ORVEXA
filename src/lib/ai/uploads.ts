import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { AiUpload } from "@prisma/client";

import { getAiRetentionPolicy, retentionDeadline } from "@/lib/ai/config";
import { scanAiUpload, verdictPermitsAnalysis } from "@/lib/ai/malware";
import type { AiAttachment } from "@/lib/ai/provider";
import { createAiSignedUrl, putAiObject, readAiObject, removeAiObject } from "@/lib/ai/storage";
import {
  buildStorageKey,
  extensionForContainer,
  sniffContainerType,
  validateUploadCandidate,
  type UploadRejection,
} from "@/lib/ai/validation";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";

/**
 * Accepting, storing and later reading back an upload.
 *
 * The order is fixed and matters: validate the declared type and the size, sniff
 * the actual container, scan, and only then store. A file that fails validation
 * is rejected before a single byte is written anywhere, and a file the scanner
 * calls infected is never stored at all.
 *
 * The original file name is kept as a label for the user and is never used to
 * build the storage key or to decide the file's type.
 */

/** Bytes handed to the container sniffer. Enough for every signature we check. */
const SNIFF_LENGTH = 64;

/** Character cap for text extracted from a document, so one file cannot exhaust a prompt. */
const MAX_EXTRACTED_CHARS = 200_000;

export type AcceptedUpload = {
  id: string;
  kind: AiUpload["kind"];
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  malwareScan: AiUpload["malwareScan"];
  malwareScanDetail: string | null;
  extraction: AiUpload["extraction"];
  extractionNotes: string | null;
  /** Short-lived preview link. Null when storage is unconfigured or the link failed. */
  previewUrl: string | null;
  previewExpiresAt: string | null;
  /** Transcript, for an audio upload. Null otherwise. */
  transcript: string | null;
  retentionUntil: string | null;
};

export type UploadOutcome =
  | { ok: true; upload: AcceptedUpload }
  | { ok: false; rejection: UploadRejection; status: number };

export async function acceptUpload(input: {
  ownerUserId: string;
  conversationId: string;
  fileName: string;
  declaredMimeType: string;
  bytes: Uint8Array;
  /** Injected so the caller can run the transcription step without this module knowing about providers. */
  transcribe?: (bytes: Uint8Array, mimeType: string) => Promise<{ transcript: string } | null>;
}): Promise<UploadOutcome> {
  const conversation = await prisma.aiConversation.findFirst({
    where: { id: input.conversationId, ownerUserId: input.ownerUserId, deletedAt: null },
    select: { id: true, ownerUserId: true, consentAcknowledgedAt: true },
  });

  if (!conversation) {
    return {
      ok: false,
      status: 404,
      rejection: { code: "not_storable", message: "That conversation was not found on your account." },
    };
  }

  if (!conversation.consentAcknowledgedAt) {
    return {
      ok: false,
      status: 409,
      rejection: {
        code: "not_storable",
        message:
          "Nothing is stored on this conversation yet. Agree to store files before uploading, or the file would have nowhere to live.",
      },
    };
  }

  const existingCount = await prisma.aiUpload.count({
    where: { conversationId: conversation.id, deletedAt: null },
  });

  const head = input.bytes.slice(0, SNIFF_LENGTH);
  const validation = validateUploadCandidate({
    fileName: input.fileName,
    declaredMimeType: input.declaredMimeType,
    sizeBytes: input.bytes.byteLength,
    head,
    existingCount,
  });

  if (!validation.ok) {
    await recordAuditEvent({
      action: "ai.upload_rejected",
      entityType: "ai_conversation",
      entityId: conversation.id,
      outcome: "DENIED",
      actorUserId: input.ownerUserId,
      metadata: { reason: validation.rejection.code, declaredMimeType: input.declaredMimeType, sizeBytes: input.bytes.byteLength },
    });
    return { ok: false, status: 422, rejection: validation.rejection };
  }

  const kind = validation.kind;
  const container = sniffContainerType(head);
  const mimeType = input.declaredMimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");

  const verdict = await scanAiUpload({ bytes: input.bytes, fileName: safeFileName(input.fileName, container), mimeType });

  if (verdict.status === "INFECTED") {
    // Rejected and not stored: an infected file has no purpose here, and keeping
    // it "for inspection" would mean holding the one thing we most want gone.
    await recordAuditEvent({
      action: "ai.upload_rejected",
      entityType: "ai_conversation",
      entityId: conversation.id,
      outcome: "DENIED",
      actorUserId: input.ownerUserId,
      metadata: { reason: "malware_signature", kind },
    });
    return { ok: false, status: 422, rejection: { code: "not_storable", message: verdict.detail } };
  }

  const uploadId = randomUUID();
  const extension = extensionForContainer(container);
  const storageKey = buildStorageKey({
    ownerUserId: input.ownerUserId,
    conversationId: conversation.id,
    uploadId,
    extension,
  });

  const stored = await putAiObject({ key: storageKey, bytes: input.bytes, contentType: mimeType });
  if (!stored.ok) {
    return {
      ok: false,
      status: stored.error.kind === "not_configured" ? 503 : 502,
      rejection: { code: "not_storable", message: stored.error.message },
    };
  }

  // Reading the file's contents happens here rather than at upload time for
  // images, because a vision model reads the image itself; only plain text is
  // read locally so a text report does not have to be sent as bytes.
  const extraction = await extractUploadContent({ kind, mimeType, bytes: input.bytes, transcribe: input.transcribe });

  const retention = getAiRetentionPolicy();
  const upload = await prisma.aiUpload.create({
    data: {
      id: uploadId,
      conversationId: conversation.id,
      ownerUserId: input.ownerUserId,
      kind,
      fileName: input.fileName.slice(0, 200),
      mimeType,
      sizeBytes: input.bytes.byteLength,
      storageBucket: getBucketName(),
      storageKey,
      checksumSha256,
      status: "READY",
      malwareScan: verdict.status,
      malwareScanDetail: verdict.detail,
      extraction: extraction.status,
      extractedText: extraction.text,
      extractionNotes: extraction.notes,
      retentionUntil: retentionDeadline(retention.uploadDays),
    },
    select: {
      id: true,
      kind: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      malwareScan: true,
      malwareScanDetail: true,
      extraction: true,
      extractionNotes: true,
      extractedText: true,
      retentionUntil: true,
      storageKey: true,
    },
  });

  await recordAuditEvent({
    action: "ai.upload_received",
    entityType: "ai_upload",
    entityId: upload.id,
    actorUserId: input.ownerUserId,
    metadata: {
      kind,
      sizeBytes: upload.sizeBytes,
      malwareScan: upload.malwareScan,
      extraction: upload.extraction,
      conversationId: conversation.id,
    },
  });

  const signed = await createAiSignedUrl(upload.storageKey);

  return {
    ok: true,
    upload: {
      id: upload.id,
      kind: upload.kind,
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      malwareScan: upload.malwareScan,
      malwareScanDetail: upload.malwareScanDetail,
      extraction: upload.extraction,
      extractionNotes: upload.extractionNotes,
      previewUrl: signed.ok ? signed.data.url : null,
      previewExpiresAt: signed.ok ? signed.data.expiresAt.toISOString() : null,
      transcript: kind === "AUDIO" ? upload.extractedText : null,
      retentionUntil: upload.retentionUntil?.toISOString() ?? null,
    },
  };
}

/**
 * Delete the stored bytes and mark the row gone.
 *
 * The row is kept until the retention job removes it so an assessment that
 * referenced this file can still explain that the file was withdrawn, but the
 * bytes leave storage immediately and the conversation no longer counts it
 * against the upload quota.
 */
export async function deleteUpload(input: { ownerUserId: string; uploadId: string }): Promise<
  { ok: true; alreadyGone: boolean } | { ok: false; message: string }
> {
  const upload = await prisma.aiUpload.findFirst({
    where: { id: input.uploadId, ownerUserId: input.ownerUserId },
    select: { id: true, storageKey: true, deletedAt: true },
  });

  if (!upload) return { ok: false, message: "That file is not on your account." };
  if (upload.deletedAt) return { ok: true, alreadyGone: true };

  const removed = await removeAiObject(upload.storageKey);
  if (!removed.ok && removed.error.kind !== "not_found") {
    return { ok: false, message: removed.error.message };
  }

  await prisma.aiUpload.update({
    where: { id: upload.id },
    data: { deletedAt: new Date(), status: "DELETED", extractedText: null, mediaSummary: null, storageKey: `deleted/${upload.id}` },
  });

  await recordAuditEvent({
    action: "ai.upload_deleted",
    entityType: "ai_upload",
    entityId: upload.id,
    actorUserId: input.ownerUserId,
  });

  return { ok: true, alreadyGone: false };
}

// ---------------------------------------------------------------------------
// Turning stored uploads into provider attachments
// ---------------------------------------------------------------------------

export type TurnUploads = {
  attachments: AiAttachment[];
  /** Upload ids the model was actually given, so their extraction state can be updated. */
  analysedIds: string[];
  /** Uploads that were deliberately not sent, with a reason a user can read. */
  withheld: { id: string; fileName: string; reason: string }[];
};

export async function uploadsToAttachments(input: {
  ownerUserId: string;
  uploads: AiUpload[];
  providerSupports: (capability: "VISION_IMAGE" | "DOCUMENT") => boolean;
}): Promise<TurnUploads> {
  const attachments: AiAttachment[] = [];
  const analysedIds: string[] = [];
  const withheld: TurnUploads["withheld"] = [];

  for (const upload of input.uploads) {
    if (upload.deletedAt) continue;

    if (!verdictPermitsAnalysis(upload.malwareScan)) {
      withheld.push({
        id: upload.id,
        fileName: upload.fileName,
        reason:
          upload.malwareScan === "INFECTED"
            ? "This file matched a malware signature."
            : "This file has not been scanned by a configured scanner, so it was not sent for analysis.",
      });
      continue;
    }

    if (upload.kind === "VIDEO") {
      attachments.push({
        kind: "VIDEO",
        label: upload.fileName,
        mimeType: upload.mimeType,
        note:
          "Attached to your report for a clinician. The assistant has not watched it and nothing in this assessment " +
          "was inferred from it.",
      });
      continue;
    }

    if (upload.kind === "AUDIO") {
      if (upload.extractedText) {
        attachments.push({ kind: "AUDIO", label: upload.fileName, transcript: upload.extractedText });
        analysedIds.push(upload.id);
      } else {
        withheld.push({ id: upload.id, fileName: upload.fileName, reason: "This voice note could not be transcribed." });
      }
      continue;
    }

    if (upload.kind === "IMAGE") {
      if (!input.providerSupports("VISION_IMAGE")) {
        withheld.push({
          id: upload.id,
          fileName: upload.fileName,
          reason: "The configured model has no image input, so this photo was not read.",
        });
        continue;
      }
      const bytes = await readStoredBytes(upload.storageKey);
      if (!bytes) {
        withheld.push({ id: upload.id, fileName: upload.fileName, reason: "The stored file could not be read back." });
        continue;
      }
      attachments.push({
        kind: "IMAGE",
        label: upload.fileName,
        mimeType: upload.mimeType,
        dataUrl: toDataUrl(upload.mimeType, bytes),
      });
      analysedIds.push(upload.id);
      continue;
    }

    // DOCUMENT
    if (!input.providerSupports("DOCUMENT")) {
      withheld.push({
        id: upload.id,
        fileName: upload.fileName,
        reason: "The configured model has no document input, so this report was not read.",
      });
      continue;
    }
    if (upload.extractedText) {
      attachments.push({
        kind: "DOCUMENT",
        label: upload.fileName,
        mimeType: upload.mimeType,
        text: upload.extractedText,
        dataUrl: null,
      });
      analysedIds.push(upload.id);
      continue;
    }
    const bytes = await readStoredBytes(upload.storageKey);
    if (!bytes) {
      withheld.push({ id: upload.id, fileName: upload.fileName, reason: "The stored file could not be read back." });
      continue;
    }
    attachments.push({
      kind: "DOCUMENT",
      label: upload.fileName,
      mimeType: upload.mimeType,
      text: null,
      dataUrl: toDataUrl(upload.mimeType, bytes),
    });
    analysedIds.push(upload.id);
  }

  return { attachments, analysedIds, withheld };
}

export function describeWithheld(withheld: TurnUploads["withheld"]): string | null {
  if (withheld.length === 0) return null;
  return withheld.map((item) => `${item.fileName}: ${item.reason}`).join(" ");
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function getBucketName(): string {
  return process.env.AI_UPLOAD_BUCKET?.trim() || "orvexa-ai-uploads";
}

async function readStoredBytes(key: string): Promise<Uint8Array | null> {
  const result = await readAiObject(key);
  return result.ok ? result.data : null;
}

function toDataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function safeFileName(fileName: string, container: string | null): string {
  const extension = extensionForContainer(container);
  const stem = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9._-]/gi, "_")
    .slice(0, 80);
  return `${stem || "upload"}${extension ? `.${extension}` : ""}`;
}

/**
 * Read what can be read locally.
 *
 * Images and PDFs are deliberately left to the model: the provider's vision and
 * document input *is* the OCR pipeline, and running a second, unvalidated
 * extractor over a medical image would produce text the model never saw and
 * nobody validated. Plain text is the one format we can read exactly.
 */
async function extractUploadContent(input: {
  kind: AiUpload["kind"];
  mimeType: string;
  bytes: Uint8Array;
  transcribe?: (bytes: Uint8Array, mimeType: string) => Promise<{ transcript: string } | null>;
}): Promise<{ status: AiUpload["extraction"]; text: string | null; notes: string | null }> {
  if (input.kind === "VIDEO") {
    return {
      status: "UNSUPPORTED",
      text: null,
      notes: "The configured model has no validated video input. This file is kept for a clinician, not for the assistant.",
    };
  }

  if (input.kind === "IMAGE") {
    return {
      status: "EXTRACTED",
      text: null,
      notes: "Passed to the vision model as an image. Any observation is recorded on the assessment.",
    };
  }

  if (input.kind === "AUDIO") {
    if (!input.transcribe) {
      return { status: "FAILED", text: null, notes: "Transcription is not available on this deployment." };
    }
    const result = await input.transcribe(input.bytes, input.mimeType);
    if (!result) {
      return { status: "FAILED", text: null, notes: "The voice note could not be transcribed, so it was not used." };
    }
    return {
      status: "EXTRACTED",
      text: result.transcript.slice(0, MAX_EXTRACTED_CHARS),
      notes: "Transcribed. The text is what the assistant reads; you can correct it before sending.",
    };
  }

  // DOCUMENT
  if (input.mimeType === "text/plain") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(input.bytes).slice(0, MAX_EXTRACTED_CHARS);
    if (!text.trim()) {
      return { status: "FAILED", text: null, notes: "That file contains no readable text." };
    }
    return { status: "EXTRACTED", text, notes: "Read as plain text." };
  }

  return {
    status: "EXTRACTED",
    text: null,
    notes: "Passed to the model's document input as a PDF. Nothing was executed and no macros were run.",
  };
}
