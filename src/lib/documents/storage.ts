import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { createAiSignedUrl, isAiStorageConfigured, putAiObject, readAiObject, removeAiObject } from "@/lib/ai/storage";
import { UPLOAD_LIMITS } from "@/lib/ai/capabilities";

/**
 * Private storage for the documents this platform handles on behalf of a
 * patient: prescriptions, policy papers and claim evidence.
 *
 * The bytes live in the same private bucket as AI uploads, under a namespace per
 * document family, and are read through the same short-lived signed links. The
 * bucket has no public URL, and the service-role key that opens it never leaves
 * the server.
 *
 * Two rules are enforced here rather than at each call site, because forgetting
 * either one is a disclosure:
 *
 *  1. **A key always begins with a namespace and the owning account's id**, so a
 *     mis-scoped query cannot walk into another patient's documents.
 *  2. **A document is only ever handed to a caller through a signed URL that
 *     expires in minutes.** There is no function here that returns an object
 *     key to a browser.
 *
 * A storage failure is reported as a failure. Nothing is recorded as stored
 * until the object really is, and the database row that references a key is
 * written only after the upload succeeds.
 */

export const DOCUMENT_MAX_BYTES = UPLOAD_LIMITS.maxFileBytes;

/** Minutes, not hours: a link copied out of the UI is useless almost immediately. */
export const DOCUMENT_LINK_TTL_SECONDS = 300;

export const ACCEPTED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedDocumentMimeType = (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number];

export const ACCEPTED_DOCUMENT_MIME_LABELS: Record<AcceptedDocumentMimeType, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG photo",
  "image/png": "PNG image",
  "image/webp": "WebP image",
};

export function documentAcceptAttribute(): string {
  return ACCEPTED_DOCUMENT_MIME_TYPES.join(",");
}

export function isAcceptedDocumentMimeType(mimeType: string): mimeType is AcceptedDocumentMimeType {
  return (ACCEPTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType);
}

const EXTENSION_BY_MIME: Record<AcceptedDocumentMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Namespaces keep one patient's prescription scans out of another's claim file. */
export type DocumentNamespace = "prescriptions" | "insurance-policies" | "insurance-claims";

export type DocumentKeyInput = {
  namespace: DocumentNamespace;
  /** The account the document belongs to. Always the first path segment. */
  ownerUserId: string;
  /** The parent record, so orphaned objects are identifiable. */
  parentId: string;
  mimeType: AcceptedDocumentMimeType;
  /** Overrides the generated identifier, used when retrying a known upload. */
  documentId?: string;
};

/**
 * Builds a storage key.
 *
 * `randomUUID` rather than a checksum keeps two photographs of the same
 * prescription as two objects, which matters because they may be retained or
 * deleted independently.
 */
export function buildDocumentKey(input: DocumentKeyInput): string {
  const documentId = input.documentId ?? randomUUID();
  const extension = EXTENSION_BY_MIME[input.mimeType];
  return `${input.namespace}/${input.ownerUserId}/${input.parentId}/${documentId}.${extension}`;
}

export function documentChecksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type StoredDocument = {
  key: string;
  sizeBytes: number;
  contentType: string;
  checksum: string;
};

export type DocumentStorageFailure = {
  kind: "not_configured" | "too_large" | "unsupported_type" | "not_found" | "failed";
  message: string;
};

export type DocumentStorageResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DocumentStorageFailure };

const FAILURE_COPY: Record<DocumentStorageFailure["kind"], string> = {
  not_configured:
    "Private document storage is not configured on this deployment, so no document can be uploaded or opened. Nothing was stored.",
  too_large: `That file is larger than the ${Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024))} MB limit.`,
  unsupported_type: "That file type is not accepted. Upload a PDF, JPEG, PNG or WebP file.",
  not_found: "That document is no longer available. It may have passed its retention date.",
  failed: "The document could not be stored. Nothing was saved, and the upload can be retried.",
};

function storageFailure<T>(kind: DocumentStorageFailure["kind"]): DocumentStorageResult<T> {
  return { ok: false, error: { kind, message: FAILURE_COPY[kind] } };
}

export function isDocumentStorageConfigured(): boolean {
  return isAiStorageConfigured();
}

export async function storeDocument(input: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<DocumentStorageResult<StoredDocument>> {
  if (!isDocumentStorageConfigured()) return storageFailure<StoredDocument>("not_configured");
  if (!isAcceptedDocumentMimeType(input.contentType)) return storageFailure<StoredDocument>("unsupported_type");
  if (input.bytes.byteLength > DOCUMENT_MAX_BYTES) return storageFailure<StoredDocument>("too_large");
  if (input.bytes.byteLength === 0) return storageFailure<StoredDocument>("failed");

  const stored = await putAiObject({ key: input.key, bytes: input.bytes, contentType: input.contentType });
  if (!stored.ok) {
    return storageFailure<StoredDocument>(
      stored.error.kind === "not_configured"
        ? "not_configured"
        : stored.error.kind === "too_large"
          ? "too_large"
          : "failed",
    );
  }

  return {
    ok: true,
    data: {
      key: stored.data.key,
      sizeBytes: stored.data.sizeBytes,
      contentType: stored.data.contentType,
      checksum: documentChecksum(input.bytes),
    },
  };
}

export type DocumentLink = { url: string; expiresAt: Date; expiresInSeconds: number };

/**
 * A short-lived link to one document.
 *
 * Authorization happens before this is called — the caller must already have
 * proved the requester may see this document. This function only turns a key
 * into a URL that stops working in a few minutes.
 */
export async function createDocumentLink(
  key: string,
  ttlSeconds: number = DOCUMENT_LINK_TTL_SECONDS,
): Promise<DocumentStorageResult<DocumentLink>> {
  const link = await createAiSignedUrl(key, ttlSeconds);
  if (!link.ok) {
    return storageFailure<DocumentLink>(
      link.error.kind === "not_configured" ? "not_configured" : link.error.kind === "not_found" ? "not_found" : "failed",
    );
  }
  return { ok: true, data: link.data };
}

export async function readDocument(key: string): Promise<DocumentStorageResult<Uint8Array>> {
  const bytes = await readAiObject(key);
  if (!bytes.ok) {
    return storageFailure<Uint8Array>(
      bytes.error.kind === "not_configured" ? "not_configured" : bytes.error.kind === "not_found" ? "not_found" : "failed",
    );
  }
  return { ok: true, data: bytes.data };
}

/**
 * Removes a document.
 *
 * Deletion is best-effort by design: the database row is the record of truth for
 * whether a document exists, so a storage error here must not stop a patient
 * withdrawing consent or a retention sweep from completing. The returned flag
 * says whether the bytes are gone, and a caller that cares can say so.
 */
export async function removeDocument(key: string): Promise<{ removed: boolean }> {
  const result = await removeAiObject(key);
  return { removed: result.ok && result.data.removed };
}
