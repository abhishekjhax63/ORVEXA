import type { AiCapability, AiExtractionStatus, AiMalwareScanStatus, AiUploadKind, AiUrgencyBand } from "@prisma/client";

/**
 * What the AI layer can actually do, and what it cannot.
 *
 * This module is deliberately client-safe (type-only Prisma import, no
 * `server-only`, no environment access) because the honesty rules have to reach
 * the browser: the workspace tells the user which media types are analysed, and
 * a disabled upload button has to explain itself in the UI rather than silently
 * refusing a file.
 *
 * The numbers below were taken from the provider's published API documentation
 * when this phase was implemented. They are *provider* ceilings. The limits
 * ORVEXA enforces on its own endpoints are stricter and live in `UPLOAD_LIMITS`,
 * because a mental-health or dermatology conversation does not need a 50 MB
 * payload and a smaller cap is a smaller blast radius.
 *
 * Verified at implementation time for OpenAI:
 *  - Image input: PNG, JPEG, WEBP and non-animated GIF. 50 MB total request
 *    payload, up to 500 images per request.
 *  - Audio transcription: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm.
 *    25 MiB per request for `whisper-1`; the `gpt-4o-transcribe` family is also
 *    bounded by duration (roughly 25 minutes).
 *  - Documents: PDF and plain text through a file input.
 *  - Video: no native video input. Providers that accept a video file do so by
 *    extracting frames, which is a different pipeline with different validation.
 *    ORVEXA therefore treats video as an attachment for the clinician and never
 *    as evidence the assistant reasoned over.
 */

export type AiProviderId = "openai";

export const AI_PROVIDER_IDS = ["openai"] as const satisfies readonly AiProviderId[];

export type AiProviderProfile = {
  id: AiProviderId;
  label: string;
  /** Capabilities the provider handles natively today. */
  native: readonly AiCapability[];
  /**
   * Capabilities the provider does not handle. Anything listed here must be
   * reported as unsupported rather than approximated.
   */
  unsupported: readonly AiCapability[];
  /**
   * Why a capability is unavailable, in words a user can act on. Required for
   * every entry in `unsupported`.
   */
  unsupportedReason: Partial<Record<AiCapability, string>>;
  /** Provider-published ceilings, kept for reference and for the capability report. */
  providerCeilings: {
    requestBytes: number;
    imagesPerRequest: number;
    audioBytes: number;
    audioSeconds: number;
    documentBytes: number;
  };
  /** Media types the provider accepts, per upload kind. */
  acceptedMimeTypes: Record<AiUploadKind, readonly string[]>;
  /** Prompt and safety policy revisions, bumped whenever the prompts change. */
  promptVersion: string;
  defaultModel: string;
};

export const AI_PROVIDER_PROFILES: Record<AiProviderId, AiProviderProfile> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    native: ["TEXT", "VISION_IMAGE", "AUDIO_TRANSCRIPTION", "DOCUMENT"],
    unsupported: ["VIDEO"],
    unsupportedReason: {
      VIDEO:
        "The configured model has no validated video input. ORVEXA will attach a short video to a clinician report, but it is never analysed by the assistant.",
    },
    providerCeilings: {
      requestBytes: 50 * 1024 * 1024,
      imagesPerRequest: 500,
      audioBytes: 25 * 1024 * 1024,
      audioSeconds: 25 * 60,
      documentBytes: 512 * 1024 * 1024,
    },
    acceptedMimeTypes: {
      IMAGE: ["image/jpeg", "image/png", "image/webp"],
      VIDEO: ["video/mp4", "video/webm", "video/quicktime"],
      DOCUMENT: ["application/pdf", "text/plain"],
      AUDIO: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/flac", "audio/x-m4a"],
    },
    promptVersion: "orvexa.triage.v1",
    defaultModel: "gpt-4o",
  },
};

export function providerProfile(id: AiProviderId): AiProviderProfile {
  return AI_PROVIDER_PROFILES[id];
}

export function providerSupports(id: AiProviderId, capability: AiCapability): boolean {
  return AI_PROVIDER_PROFILES[id].native.includes(capability);
}

/**
 * ORVEXA's own upload limits.
 *
 * These are the numbers the upload endpoint enforces. They are deliberately
 * well below the provider ceilings: a bounded upload is cheaper to scan, cheaper
 * to store and cheaper to delete when the user withdraws consent.
 */
export const UPLOAD_LIMITS = {
  /** Absolute ceiling for any single file. */
  maxFileBytes: 20 * 1024 * 1024,
  maxFilesPerTurn: 3,
  maxFilesPerConversation: 8,
  maxPerKindBytes: {
    IMAGE: 10 * 1024 * 1024,
    VIDEO: 25 * 1024 * 1024,
    AUDIO: 15 * 1024 * 1024,
    DOCUMENT: 20 * 1024 * 1024,
  } satisfies Record<AiUploadKind, number>,
  maxVideoSeconds: 30,
  maxAudioSeconds: 5 * 60,
  maxDocumentPages: 30,
  /** Short-lived signed URL lifetime, in seconds. */
  signedUrlTtlSeconds: 120,
  /** Default retention for stored conversations and uploads. */
  defaultRetentionDays: 90,
} as const;

/**
 * Media types ORVEXA accepts for each kind, given the configured provider.
 *
 * GIF is excluded on purpose. The provider reads only the first frame of an
 * animation, so a "photo" that moves would be interpreted from a single frame —
 * exactly the kind of unvalidated interpretation the brief rules out.
 */
export const ACCEPTED_MIME_TYPES = AI_PROVIDER_PROFILES.openai.acceptedMimeTypes;

export const MIME_TO_UPLOAD_KIND: Record<string, AiUploadKind> = {
  "image/jpeg": "IMAGE",
  "image/png": "IMAGE",
  "image/webp": "IMAGE",
  "video/mp4": "VIDEO",
  "video/webm": "VIDEO",
  "video/quicktime": "VIDEO",
  "application/pdf": "DOCUMENT",
  "text/plain": "DOCUMENT",
  "audio/mpeg": "AUDIO",
  "audio/mp4": "AUDIO",
  "audio/wav": "AUDIO",
  "audio/x-wav": "AUDIO",
  "audio/webm": "AUDIO",
  "audio/ogg": "AUDIO",
  "audio/flac": "AUDIO",
  "audio/x-m4a": "AUDIO",
};

/** `accept` attribute for the file input, built from the same table as the validator. */
export function uploadAcceptAttribute(): string {
  return Object.keys(MIME_TO_UPLOAD_KIND).join(",");
}

export const UPLOAD_KIND_LABELS: Record<AiUploadKind, string> = {
  IMAGE: "Photo",
  VIDEO: "Short video",
  DOCUMENT: "Document",
  AUDIO: "Voice note",
};

export const UPLOAD_KIND_HELP: Record<AiUploadKind, string> = {
  IMAGE: "A clear, well-lit photo of what you can see. One area per photo.",
  VIDEO: "Attached to a clinician report. The assistant does not analyse video.",
  DOCUMENT: "A lab or discharge report as PDF or plain text.",
  AUDIO: "A voice note describing your symptoms. It is transcribed, then discarded with the conversation.",
};

export const MALWARE_SCAN_COPY: Record<AiMalwareScanStatus, { label: string; detail: string; tone: "neutral" | "success" | "warning" | "emergency" }> = {
  PENDING: { label: "Not scanned yet", detail: "The file is held and will not be analysed until the scan finishes.", tone: "neutral" },
  CLEAN: { label: "Scan passed", detail: "No known malware signature was found.", tone: "success" },
  INFECTED: { label: "Scan failed", detail: "This file matched a known malware signature and was rejected.", tone: "emergency" },
  SKIPPED: {
    label: "Scan not configured",
    detail: "No malware scanner is configured on this deployment, so this file was not scanned. Keep it exactly as you would any other download.",
    tone: "warning",
  },
  FAILED: { label: "Scan errored", detail: "The scan could not complete. The file is not analysed until a scan succeeds.", tone: "warning" },
};

export const EXTRACTION_COPY: Record<AiExtractionStatus, { label: string; detail: string }> = {
  PENDING: { label: "Waiting to be read", detail: "Nothing has been read from this file yet." },
  EXTRACTED: { label: "Read by the assistant", detail: "The assistant used what it could read from this file." },
  UNSUPPORTED: {
    label: "Not analysed",
    detail: "The configured model cannot read this kind of file. It is attached to your report but was not interpreted.",
  },
  FAILED: { label: "Could not be read", detail: "Reading this file failed. It was not interpreted, and the assessment does not rely on it." },
  SKIPPED: { label: "Not sent to the assistant", detail: "This file was not sent for analysis." },
};

export const AI_URGENCY_COPY: Record<
  AiUrgencyBand,
  { label: string; tone: "success" | "neutral" | "warning" | "emergency"; summary: string; action: string }
> = {
  SELF_CARE: {
    label: "Self care",
    tone: "success",
    summary: "Nothing in what you described points to an emergency.",
    action: "Follow the self-care steps and see a doctor if it does not settle or gets worse.",
  },
  ROUTINE: {
    label: "Routine appointment",
    tone: "neutral",
    summary: "This is worth showing to a doctor, but there is no sign that it needs to be today.",
    action: "Book an appointment at a time that suits you.",
  },
  SOON: {
    label: "See a doctor soon",
    tone: "warning",
    summary: "This should be looked at within the next day or two.",
    action: "Book the next available appointment, or use a walk-in clinic.",
  },
  URGENT: {
    label: "Urgent care",
    tone: "warning",
    summary: "This needs medical attention today.",
    action: "Go to an urgent care centre or hospital now. Do not wait for an appointment.",
  },
  EMERGENCY: {
    label: "Emergency",
    tone: "emergency",
    summary: "What you described includes a warning sign of a medical emergency.",
    action: "Call emergency services or go to the nearest emergency department now. Do not wait.",
  },
};

/**
 * Languages the workspace can produce an explanation in.
 *
 * Every entry needs a reviewer who reads it before release: a triage
 * explanation in a language nobody on the clinical team can check is an
 * unvalidated medical statement, whatever the model's translation benchmark
 * says. `reviewed` records which of them have a named clinical reviewer.
 */
export type AiLanguage = { code: string; label: string; endonym: string; reviewed: boolean };

export const AI_LANGUAGES: readonly AiLanguage[] = [
  { code: "en", label: "English", endonym: "English", reviewed: true },
  { code: "hi", label: "Hindi", endonym: "हिन्दी", reviewed: false },
  { code: "bn", label: "Bengali", endonym: "বাংলা", reviewed: false },
  { code: "mr", label: "Marathi", endonym: "मराठी", reviewed: false },
  { code: "ta", label: "Tamil", endonym: "தமிழ்", reviewed: false },
  { code: "te", label: "Telugu", endonym: "తెలుగు", reviewed: false },
  { code: "kn", label: "Kannada", endonym: "ಕನ್ನಡ", reviewed: false },
  { code: "ml", label: "Malayalam", endonym: "മലയാളം", reviewed: false },
  { code: "gu", label: "Gujarati", endonym: "ગુજરાતી", reviewed: false },
  { code: "pa", label: "Punjabi", endonym: "ਪੰਜਾਬੀ", reviewed: false },
];

export const AI_LANGUAGE_CODES = AI_LANGUAGES.map((language) => language.code);

export function aiLanguageLabel(code: string): string {
  return AI_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

/**
 * The limitations notice that accompanies every assessment.
 *
 * It is stored on the row rather than composed at render time so a saved
 * assessment keeps the exact wording that was shown when it was saved. Reviewers
 * comparing an old assessment with the current policy need that.
 */
export const AI_LIMITATIONS_NOTICE =
  "This is a preliminary, automated assessment based only on what you described and uploaded. It is not a diagnosis, " +
  "it has not been reviewed by a doctor, and it can be wrong. It cannot prescribe medicines or doses. " +
  "If your symptoms change, or you are worried, contact a qualified clinician. In an emergency, call emergency services.";

export const SAFETY_POLICY_VERSION = "orvexa.ai-safety.v1";

/**
 * Version of the consent text a user agrees to before anything is stored.
 *
 * Bumped whenever the wording changes, so a stored consent record can always be
 * read back against the text that was actually shown.
 */
export const AI_CONSENT_POLICY_VERSION = "orvexa.ai-consent.v1";

/**
 * A single, always-visible statement of what the workspace will not do.
 *
 * Rendered next to the composer, in the assessment header and on the shared
 * clinician report, so the boundary survives every route the content can take.
 */
export const AI_SCOPE_STATEMENT =
  "The assistant explains possibilities and urgency. It does not diagnose, does not prescribe, and is not a substitute for a clinician.";
