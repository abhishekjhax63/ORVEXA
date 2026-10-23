import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getObjectStorageConfig } from "@/lib/ai/config";
import { UPLOAD_LIMITS } from "@/lib/ai/capabilities";

/**
 * Private object storage for AI uploads.
 *
 * The bucket is not public and there is no public URL for anything stored here.
 * A caller that wants to show a file to its owner asks for a signed URL that
 * expires in two minutes, so a link copied out of the UI is useless almost
 * immediately.
 *
 * The service-role key used by this client can read every patient's upload, so
 * it is read from the server environment only, is never prefixed with
 * `NEXT_PUBLIC_`, and never leaves this module. The browser talks to our
 * endpoints, not to the bucket.
 *
 * Failures are typed, following the same rule as the maps and AI providers: a
 * storage operation that did not succeed is reported as a failure. There is no
 * fallback that pretends a file was stored, and no fallback that serves a file
 * we cannot prove we hold.
 */

export type AiStorageErrorKind = "not_configured" | "too_large" | "not_found" | "failed";

export type AiStorageError = { kind: AiStorageErrorKind; message: string; status?: number };

export type AiStorageResult<T> = { ok: true; data: T } | { ok: false; error: AiStorageError };

const ERROR_COPY: Record<AiStorageErrorKind, string> = {
  not_configured:
    "Private file storage is not configured on this deployment, so uploads cannot be accepted. Nothing was stored.",
  too_large: "That file is larger than the limit for this deployment.",
  not_found: "That file is no longer available. It may have passed its retention date.",
  failed: "The file could not be stored. Nothing was saved, and the upload can be retried.",
};

function failure<T>(kind: AiStorageErrorKind, status?: number, message?: string): AiStorageResult<T> {
  return { ok: false, error: { kind, message: message ?? ERROR_COPY[kind], status } };
}

let cached: { key: string; client: SupabaseClient } | null = null;

/**
 * One client per process, keyed on the credentials so a rotated key is picked up
 * rather than held for the life of the server.
 */
function storageClient(): { client: SupabaseClient; bucket: string } | null {
  const config = getObjectStorageConfig();
  if (!config) return null;

  const cacheKey = `${config.url}:${config.bucket}:${config.serviceRoleKey.slice(-8)}`;
  if (!cached || cached.key !== cacheKey) {
    cached = {
      key: cacheKey,
      client: createClient(config.url, config.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    };
  }
  return { client: cached.client, bucket: config.bucket };
}

export function isAiStorageConfigured(): boolean {
  return getObjectStorageConfig() !== undefined;
}

export type StoredObject = { key: string; sizeBytes: number; contentType: string };

export async function putAiObject(input: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<AiStorageResult<StoredObject>> {
  const store = storageClient();
  if (!store) return failure<StoredObject>("not_configured");
  if (input.bytes.byteLength > UPLOAD_LIMITS.maxFileBytes) return failure<StoredObject>("too_large", 413);

  // `upsert: false` on purpose: a storage key is derived from a fresh upload id,
  // so a collision means something is wrong and overwriting would destroy a file
  // that is already referenced by an assessment.
  const { error } = await store.client.storage
    .from(store.bucket)
    .upload(input.key, input.bytes, { contentType: input.contentType, upsert: false });

  if (error) {
    console.error("[ai] storing an upload failed", error.name);
    return failure<StoredObject>("failed", undefined, "The file could not be stored. Nothing was saved.");
  }

  return { ok: true, data: { key: input.key, sizeBytes: input.bytes.byteLength, contentType: input.contentType } };
}

export async function readAiObject(key: string): Promise<AiStorageResult<Uint8Array>> {
  const store = storageClient();
  if (!store) return failure<Uint8Array>("not_configured");

  const { data, error } = await store.client.storage.from(store.bucket).download(key);
  if (error || !data) return failure<Uint8Array>("not_found", 404);

  return { ok: true, data: new Uint8Array(await data.arrayBuffer()) };
}

export async function removeAiObject(key: string): Promise<AiStorageResult<{ removed: boolean }>> {
  const store = storageClient();
  if (!store) return failure<{ removed: boolean }>("not_configured");

  const { error } = await store.client.storage.from(store.bucket).remove([key]);
  if (error) {
    console.error("[ai] deleting an upload failed", error.name);
    return failure<{ removed: boolean }>("failed", undefined, "The stored file could not be deleted.");
  }
  return { ok: true, data: { removed: true } };
}

export type SignedUrl = { url: string; expiresAt: Date; expiresInSeconds: number };

/**
 * A short-lived link for one object.
 *
 * The lifetime comes from `UPLOAD_LIMITS.signedUrlTtlSeconds` and is deliberately
 * minutes rather than hours: the link is handed to the owner's own browser to
 * preview their own photo, and nothing else should be able to use it.
 */
export async function createAiSignedUrl(
  key: string,
  ttlSeconds: number = UPLOAD_LIMITS.signedUrlTtlSeconds,
): Promise<AiStorageResult<SignedUrl>> {
  const store = storageClient();
  if (!store) return failure<SignedUrl>("not_configured");

  const { data, error } = await store.client.storage.from(store.bucket).createSignedUrl(key, ttlSeconds);
  if (error || !data?.signedUrl) return failure<SignedUrl>("failed", undefined, "A preview link could not be created.");

  return {
    ok: true,
    data: {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      expiresInSeconds: ttlSeconds,
    },
  };
}
