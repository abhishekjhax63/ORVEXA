import { z } from "zod";

import type { AiUploadKind, AiUrgencyBand } from "@prisma/client";

import { ACCEPTED_MIME_TYPES, MIME_TO_UPLOAD_KIND, UPLOAD_LIMITS, AI_LANGUAGE_CODES } from "@/lib/ai/capabilities";

/**
 * Validation for everything that crosses a network boundary on the AI surface.
 *
 * Client-safe: the workspace imports the same schemas it is validated against on
 * the server, so a form's rules and the endpoint's rules cannot drift apart.
 *
 * Two rules the rest of the phase depends on:
 *  - A declared MIME type is a *claim*. `validateUploadCandidate` compares it
 *    against the file's leading bytes and rejects a mismatch instead of trusting
 *    the browser.
 *  - Size is checked against both the per-kind limit and the absolute ceiling,
 *    before any bytes are written anywhere.
 */

export const AI_UPLOAD_KINDS = ["IMAGE", "VIDEO", "DOCUMENT", "AUDIO"] as const satisfies readonly AiUploadKind[];

export const AI_URGENCY_BANDS = ["SELF_CARE", "ROUTINE", "SOON", "URGENT", "EMERGENCY"] as const satisfies readonly AiUrgencyBand[];

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

export const aiClinicalContextSchema = z.object({
  ageRange: z.string().trim().max(40).optional().or(z.literal("")),
  sexAtBirth: z.string().trim().max(40).optional().or(z.literal("")),
  symptomDuration: z.string().trim().max(120).optional().or(z.literal("")),
  symptomOnset: z.string().trim().max(120).optional().or(z.literal("")),
  historyNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  currentMedications: z.string().trim().max(2000).optional().or(z.literal("")),
  allergies: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type AiClinicalContextInput = z.infer<typeof aiClinicalContextSchema>;

export const aiTurnRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(64).optional(),
  /** What the user typed, or the transcript they confirmed. */
  statement: z.string().trim().min(3, "Describe what is happening in a few words or more.").max(4000),
  language: z.enum(AI_LANGUAGE_CODES as [string, ...string[]]).default("en"),
  followUp: z.boolean().default(false),
  familyMemberId: z.string().trim().min(1).max(64).optional(),
  clinical: aiClinicalContextSchema.default({}),
  /** Ids of uploads already accepted for this conversation. */
  uploadIds: z.array(z.string().trim().min(1).max(64)).max(UPLOAD_LIMITS.maxFilesPerTurn).default([]),
  /** Set when the user has agreed to store this conversation. */
  consentToStore: z.boolean().default(false),
  consentPolicyVersion: z.string().trim().max(40).optional(),
});

export type AiTurnRequestInput = z.infer<typeof aiTurnRequestSchema>;

export const aiUploadRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(64),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive(),
});

export const aiTranscribeFieldsSchema = z.object({
  /** Optional: used only to attribute the call in provider telemetry. */
  conversationId: z.string().trim().min(1).max(64).optional(),
  language: z.enum(AI_LANGUAGE_CODES as [string, ...string[]]).optional(),
});

export const aiConversationCreateSchema = z.object({
  language: z.enum(AI_LANGUAGE_CODES as [string, ...string[]]).default("en"),
  title: z.string().trim().max(160).optional().or(z.literal("")),
  familyMemberId: z.string().trim().min(1).max(64).optional(),
  consentPolicyVersion: z.string().trim().max(40).optional(),
  /**
   * Checkbox inputs arrive as a string when a form is submitted without
   * JavaScript. The value is checked again in the route so the refusal can
   * explain itself rather than reading as a schema error.
   */
  consentToStore: z.preprocess(
    (value) => (typeof value === "string" ? value === "on" || value === "true" : value),
    z.boolean(),
  ),
});

export const aiSaveAssessmentSchema = z.object({
  assessmentId: z.string().trim().min(1).max(64),
  consentToStore: z.boolean(),
  consentPolicyVersion: z.string().trim().max(40).optional(),
});

export const aiShareRequestSchema = z.object({
  assessmentId: z.string().trim().min(1).max(64),
  recipientLabel: z.string().trim().min(2, "Name the clinician or clinic this is for.").max(120),
  recipientEmail: z.email("Enter a valid email address.").max(200).optional().or(z.literal("")),
  includeUploads: z.boolean().default(false),
  /**
   * Checkbox inputs arrive as a string when a form is submitted without
   * JavaScript, so both a boolean and the string "on" are accepted.
   */
  consentToShare: z.preprocess(
    (value) => (typeof value === "string" ? value === "on" || value === "true" : value),
    z.boolean(),
  ),
});

export const aiDeleteRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(64),
  /** Typed by the user to confirm an irreversible deletion. */
  confirm: z.literal("delete"),
});

export const aiReviewRequestSchema = z.object({
  assessmentId: z.string().trim().min(1).max(64),
  requestNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  specialty: z.string().trim().max(80).optional().or(z.literal("")),
});

export const aiReviewDecisionSchema = z.object({
  reviewId: z.string().trim().min(1).max(64),
  decision: z.enum(["AGREE", "RAISE_URGENCY", "LOWER_URGENCY", "SEE_CLINICIAN", "NEEDS_MORE_INFORMATION"]),
  reviewNotes: z.string().trim().min(10, "Record what you reviewed and what you concluded.").max(4000),
});

// ---------------------------------------------------------------------------
// Provider draft
// ---------------------------------------------------------------------------

export const aiTriageDraftSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  possibleCauses: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(160),
        note: z.string().trim().max(1200),
        likelihood: z.enum(["common", "possible", "uncommon"]),
      }),
    )
    .max(10),
  warningSigns: z
    .array(z.object({ label: z.string().trim().min(1).max(160), detail: z.string().trim().max(1200) }))
    .max(12),
  recommendedSteps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        detail: z.string().trim().max(1200),
        timeframe: z.enum(["now", "today", "within_48_hours", "if_worse"]),
      }),
    )
    .max(10),
  clarifyingQuestions: z
    .array(z.object({ question: z.string().trim().min(1).max(300), why: z.string().trim().max(600) }))
    .max(3),
  selfCareGuidance: z.string().trim().max(2000).nullable(),
  uncertaintyNotes: z.string().trim().min(1).max(2000),
  urgency: z.enum(AI_URGENCY_BANDS),
  urgencyRationale: z.string().trim().max(1200),
  mediaObservations: z
    .array(
      z.object({
        attachmentIndex: z.number().int().min(0),
        observation: z.string().trim().max(1200),
        confidence: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(12),
  medicationRequest: z.boolean(),
});

export type AiTriageDraftInput = z.infer<typeof aiTriageDraftSchema>;

/** Parse an untrusted provider payload, with a readable failure. */
export function parseTriageDraft(payload: unknown) {
  return aiTriageDraftSchema.safeParse(payload);
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

export type UploadRejection = {
  code:
    | "unsupported_type"
    | "type_mismatch"
    | "too_large"
    | "empty"
    | "not_storable"
    | "quota_exceeded"
    | "unsupported_media_for_provider";
  message: string;
};

export type UploadCandidate = {
  fileName: string;
  declaredMimeType: string;
  sizeBytes: number;
  /** First bytes of the file, when the caller has them. */
  head?: Uint8Array;
  /** How many files the conversation already holds. */
  existingCount?: number;
};

/**
 * Byte signatures for the containers we accept.
 *
 * Chosen over a filename extension check because an extension is user-controlled
 * text. This is not a substitute for malware scanning — a well-formed JPEG can
 * still be malicious — it only stops a file being handled as a type it is not.
 */
export function sniffContainerType(head: Uint8Array): string | null {
  const bytes = (offset: number, length: number) => String.fromCharCode(...head.slice(offset, offset + length));

  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.length >= 8 && head[0] === 0x89 && bytes(1, 3) === "PNG") return "png";
  if (head.length >= 12 && bytes(0, 4) === "RIFF" && bytes(8, 4) === "WEBP") return "webp";
  if (head.length >= 12 && bytes(0, 4) === "RIFF" && bytes(8, 4) === "WAVE") return "wav";
  if (head.length >= 6 && bytes(0, 4) === "GIF8") return "gif";
  if (head.length >= 5 && bytes(0, 5) === "%PDF-") return "pdf";
  if (head.length >= 4 && bytes(0, 4) === "fLaC") return "flac";
  if (head.length >= 4 && bytes(0, 4) === "OggS") return "ogg";
  if (head.length >= 3 && bytes(0, 3) === "ID3") return "mpeg-audio";
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mpeg-audio";
  // ISO base media file format: MP4, MOV, M4A and friends all carry "ftyp".
  if (head.length >= 12 && bytes(4, 4) === "ftyp") return "isobmff";
  // Matroska / WebM.
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "matroska";

  // Plain text has no signature. NUL bytes or invalid UTF-8 rule it out.
  if (head.length > 0 && !head.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(head);
      return "text";
    } catch {
      return null;
    }
  }

  return null;
}

const EXPECTED_CONTAINERS: Record<string, readonly string[]> = {
  "image/jpeg": ["jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  "text/plain": ["text"],
  "video/mp4": ["isobmff"],
  "video/quicktime": ["isobmff"],
  "video/webm": ["matroska"],
  "audio/mpeg": ["mpeg-audio"],
  "audio/mp4": ["isobmff"],
  "audio/x-m4a": ["isobmff"],
  "audio/wav": ["wav"],
  "audio/x-wav": ["wav"],
  "audio/webm": ["matroska"],
  "audio/ogg": ["ogg"],
  "audio/flac": ["flac"],
};

export function uploadKindForMimeType(mimeType: string): AiUploadKind | null {
  return MIME_TO_UPLOAD_KIND[mimeType] ?? null;
}

/**
 * Validate a declared upload before any byte is stored.
 *
 * Returns the resolved kind on success. Every rejection carries a code the UI
 * can branch on, so an unsupported type is explained rather than appearing as a
 * generic failure.
 */
export function validateUploadCandidate(
  candidate: UploadCandidate,
): { ok: true; kind: AiUploadKind } | { ok: false; rejection: UploadRejection } {
  const mimeType = candidate.declaredMimeType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (candidate.sizeBytes <= 0) {
    return { ok: false, rejection: { code: "empty", message: "That file is empty." } };
  }

  const kind = uploadKindForMimeType(mimeType);
  if (!kind) {
    return {
      ok: false,
      rejection: {
        code: "unsupported_type",
        message: `${describeMime(mimeType)} is not one of the file types this workspace accepts.`,
      },
    };
  }

  const accepted = ACCEPTED_MIME_TYPES[kind];
  if (!accepted.includes(mimeType)) {
    return {
      ok: false,
      rejection: { code: "unsupported_type", message: `${describeMime(mimeType)} is not accepted for ${kind.toLowerCase()} uploads.` },
    };
  }

  const perKindLimit = UPLOAD_LIMITS.maxPerKindBytes[kind];
  const limit = Math.min(perKindLimit, UPLOAD_LIMITS.maxFileBytes);
  if (candidate.sizeBytes > limit) {
    return {
      ok: false,
      rejection: {
        code: "too_large",
        message: `That file is ${formatBytes(candidate.sizeBytes)}. The limit for ${kind.toLowerCase()} uploads is ${formatBytes(limit)}.`,
      },
    };
  }

  if (candidate.head && candidate.head.length > 0) {
    const container = sniffContainerType(candidate.head);
    const expected = EXPECTED_CONTAINERS[mimeType] ?? [];
    if (container === "gif") {
      return {
        ok: false,
        rejection: {
          code: "unsupported_type",
          message:
            "Animated images cannot be analysed: only the first frame would be read, which would misrepresent what the file shows. Upload a still photo instead.",
        },
      };
    }
    if (!container || (expected.length > 0 && !expected.includes(container))) {
      return {
        ok: false,
        rejection: {
          code: "type_mismatch",
          message: `That file's contents do not match what it claims to be (${describeMime(mimeType)}). It was rejected.`,
        },
      };
    }
  }

  if (candidate.existingCount !== undefined && candidate.existingCount >= UPLOAD_LIMITS.maxFilesPerConversation) {
    return {
      ok: false,
      rejection: {
        code: "quota_exceeded",
        message: `A conversation can hold up to ${UPLOAD_LIMITS.maxFilesPerConversation} files. Remove one before adding another.`,
      },
    };
  }

  return { ok: true, kind };
}

function describeMime(mimeType: string): string {
  if (!mimeType) return "That file type";
  const friendly = MIME_TO_UPLOAD_KIND[mimeType];
  return friendly ? `“${mimeType}” (${friendly.toLowerCase()})` : `“${mimeType}”`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A stable, non-guessable storage key.
 *
 * The original file name never forms part of the key: it is user-controlled, it
 * sometimes carries a patient's name, and it should not be legible from a bucket
 * listing.
 */
export function buildStorageKey(input: { ownerUserId: string; conversationId: string; uploadId: string; extension: string }): string {
  const safeExtension = input.extension.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  return `ai/${input.ownerUserId}/${input.conversationId}/${input.uploadId}${safeExtension ? `.${safeExtension}` : ""}`;
}

/** Best-effort extension derived from the *sniffed* container, never the file name. */
export function extensionForContainer(container: string | null): string {
  switch (container) {
    case "jpeg":
      return "jpg";
    case "png":
      return "png";
    case "webp":
      return "webp";
    case "pdf":
      return "pdf";
    case "wav":
      return "wav";
    case "flac":
      return "flac";
    case "ogg":
      return "ogg";
    case "mpeg-audio":
      return "mp3";
    case "isobmff":
      return "mp4";
    case "matroska":
      return "webm";
    case "text":
      return "txt";
    default:
      return "";
  }
}
