import type { AiCapability, AiUrgencyBand } from "@prisma/client";

/**
 * The replaceable AI service interface.
 *
 * ## Swapping the provider
 *
 * Everything above this file talks to `AiProvider` and to `AiResult`; nothing
 * above it knows a vendor name, an endpoint or a payload shape. To move to a
 * different model vendor:
 *
 *  1. Add an entry to `AI_PROVIDER_PROFILES` in `src/lib/ai/capabilities.ts`
 *     describing what that vendor can actually ingest. Anything the vendor does
 *     not support natively is listed under `unsupported` with a reason a user
 *     can read, and the workspace will say so instead of pretending.
 *  2. Implement `AiProvider` in `src/lib/ai/providers/<vendor>.ts`. The only
 *     required behaviour beyond the type signatures is the failure contract
 *     below.
 *  3. Register it in `src/lib/ai/service.ts`. Nothing else changes.
 *
 * ## The failure contract
 *
 * A provider never throws for an expected condition and never returns a partial
 * answer as if it were complete. Every call resolves to `AiResult`, and a
 * failure carries a kind the caller can render:
 *
 *  - `not_configured`     — no credentials on this deployment.
 *  - `unsupported_capability` — the vendor cannot read this media type.
 *  - `timeout` / `network_error` — the call never completed.
 *  - `rate_limited`       — the vendor is throttling us.
 *  - `provider_error`     — the vendor returned an error or an unusable body.
 *  - `safety_blocked`     — the vendor's own safety filter refused the request.
 *
 * There is deliberately no fallback that synthesises a plausible assessment
 * when a call fails. A failed call is shown to the user as a failed call.
 */

export type AiErrorKind =
  | "not_configured"
  | "unsupported_capability"
  | "timeout"
  | "network_error"
  | "rate_limited"
  | "provider_error"
  | "safety_blocked";

export type AiError = {
  kind: AiErrorKind;
  /** Safe to render. Never contains an API key or a raw vendor payload. */
  message: string;
  /** Upstream HTTP status, when there was one. */
  status?: number;
};

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiError };

export const AI_ERROR_COPY: Record<AiErrorKind, string> = {
  not_configured:
    "No AI provider is configured on this deployment, so no assessment can be produced. Nothing you write here is being analysed.",
  unsupported_capability: "The configured model cannot read this kind of file.",
  timeout: "The assistant did not respond in time. Nothing was saved. You can try again.",
  network_error: "The assistant could not be reached. Check your connection and try again.",
  rate_limited: "The assistant is handling a lot of requests right now. Try again shortly.",
  provider_error: "The assistant returned an error and no assessment was produced.",
  safety_blocked: "The request was refused by the provider's safety filter, so no assessment was produced.",
};

export function aiFailure<T>(kind: AiErrorKind, status?: number): AiResult<T> {
  return { ok: false, error: { kind, message: AI_ERROR_COPY[kind], status } };
}

// ---------------------------------------------------------------------------
// Request and response contract
// ---------------------------------------------------------------------------

/** Clinical context the user supplied. Every field is optional by design. */
export type AiClinicalContext = {
  ageRange: string | null;
  sexAtBirth: string | null;
  symptomDuration: string | null;
  symptomOnset: string | null;
  historyNotes: string | null;
  currentMedications: string | null;
  allergies: string | null;
};

export type AiImageAttachment = {
  kind: "IMAGE";
  label: string;
  mimeType: string;
  /** Base64 data URL. Built on the server from the private object, never in the browser. */
  dataUrl: string;
};

export type AiDocumentAttachment = {
  kind: "DOCUMENT";
  label: string;
  mimeType: string;
  /** Plain text read from the file locally, when it had a text layer. */
  text: string | null;
  /** Base64 data URL, for providers that read a PDF directly. Never built in the browser. */
  dataUrl: string | null;
};

export type AiAudioAttachment = {
  kind: "AUDIO";
  label: string;
  transcript: string;
};

/**
 * Video is an attachment the assistant is told about but never given.
 *
 * The type carries the note that the UI and the assessment must both repeat: it
 * travels with a clinician report, nothing was inferred from it.
 */
export type AiVideoAttachment = {
  kind: "VIDEO";
  label: string;
  mimeType: string;
  note: string;
};

export type AiAttachment = AiImageAttachment | AiDocumentAttachment | AiAudioAttachment | AiVideoAttachment;

export type AiTriageRequest = {
  /** BCP-47 language tag the explanation must be written in. */
  language: string;
  clinical: AiClinicalContext;
  /** What the user typed, or the transcript of what they said. */
  statement: string;
  /** Earlier turns, oldest first, so a follow-up keeps its thread. */
  history: { role: "user" | "assistant"; content: string }[];
  attachments: AiAttachment[];
  /** True when the caller wants a follow-up answer rather than a full assessment. */
  followUp: boolean;
  signal?: AbortSignal;
};

export type AiCause = {
  label: string;
  note: string;
  likelihood: "common" | "possible" | "uncommon";
};

export type AiWarningSign = { label: string; detail: string };

export type AiStep = {
  title: string;
  detail: string;
  timeframe: "now" | "today" | "within_48_hours" | "if_worse";
};

export type AiQuestion = { question: string; why: string };

export type AiMediaObservation = {
  /** Index into `AiTriageRequest.attachments`. */
  attachmentIndex: number;
  observation: string;
  /** The model's own stated confidence in what it could see. Never "certain". */
  confidence: "low" | "medium" | "high";
};

/**
 * A draft, not a finished assessment.
 *
 * The safety layer in `src/lib/ai/safety.ts` takes this and decides the final
 * urgency band, whether medication advice must be replaced with a refusal, and
 * which escalation route the user is offered. A draft is never shown to a user
 * directly, and never persisted before the safety layer has run.
 */
export type AiTriageDraft = {
  summary: string;
  possibleCauses: AiCause[];
  warningSigns: AiWarningSign[];
  recommendedSteps: AiStep[];
  clarifyingQuestions: AiQuestion[];
  selfCareGuidance: string | null;
  uncertaintyNotes: string;
  /** The model's suggestion. The safety layer may only raise this, never lower it. */
  urgency: AiUrgencyBand;
  urgencyRationale: string;
  mediaObservations: AiMediaObservation[];
  /** True when the model detected a request for a medicine, dose or regimen. */
  medicationRequest: boolean;
};

export type AiTranscribeRequest = {
  mimeType: string;
  /** Raw audio bytes. Held in memory for the duration of the call only. */
  bytes: Uint8Array;
  language?: string | null;
  signal?: AbortSignal;
};

export type AiVisionQuestionRequest = {
  question: string;
  mimeType: string;
  /** Base64 data URL validated by the server. */
  dataUrl: string;
  signal?: AbortSignal;
};

export type AiTranscript = { text: string; language: string | null; durationSeconds: number | null };

export type AiCallUsage = { latencyMs: number; inputChars: number };

export type AiProviderCallOutcome<T> = { result: AiResult<T>; usage: AiCallUsage };

export interface AiProvider {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  /** Capabilities this provider will actually attempt. */
  readonly capabilities: readonly AiCapability[];
  readonly promptVersion: string;

  supports(capability: AiCapability): boolean;

  /** Model selected for a turn, including a vision-specific override if needed. */
  modelFor(request: AiTriageRequest): string;

  /** Produce a preliminary triage draft. */
  triage(request: AiTriageRequest): Promise<AiProviderCallOutcome<AiTriageDraft>>;

  /** Answer a question about one image without turning it into a diagnosis. */
  visionQuestion(request: AiVisionQuestionRequest): Promise<AiProviderCallOutcome<{ text: string }>>;

  /** Transcribe a voice note into text the user can correct before it is used. */
  transcribe(request: AiTranscribeRequest): Promise<AiProviderCallOutcome<AiTranscript>>;
}

/**
 * JSON Schema for `AiTriageDraft`, used by providers that support structured
 * output. It lives here rather than in a vendor file because it is the canonical
 * contract: a second provider must satisfy the same shape, and the safety layer
 * parses against it regardless of vendor.
 */
export const TRIAGE_DRAFT_JSON_SCHEMA = {
  name: "orvexa_triage_draft",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "summary",
      "possibleCauses",
      "warningSigns",
      "recommendedSteps",
      "clarifyingQuestions",
      "selfCareGuidance",
      "uncertaintyNotes",
      "urgency",
      "urgencyRationale",
      "mediaObservations",
      "medicationRequest",
    ],
    properties: {
      summary: { type: "string" },
      possibleCauses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "note", "likelihood"],
          properties: {
            label: { type: "string" },
            note: { type: "string" },
            likelihood: { type: "string", enum: ["common", "possible", "uncommon"] },
          },
        },
      },
      warningSigns: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "detail"],
          properties: { label: { type: "string" }, detail: { type: "string" } },
        },
      },
      recommendedSteps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "detail", "timeframe"],
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            timeframe: { type: "string", enum: ["now", "today", "within_48_hours", "if_worse"] },
          },
        },
      },
      clarifyingQuestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "why"],
          properties: { question: { type: "string" }, why: { type: "string" } },
        },
      },
      selfCareGuidance: { type: ["string", "null"] },
      uncertaintyNotes: { type: "string" },
      urgency: { type: "string", enum: ["SELF_CARE", "ROUTINE", "SOON", "URGENT", "EMERGENCY"] },
      urgencyRationale: { type: "string" },
      mediaObservations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["attachmentIndex", "observation", "confidence"],
          properties: {
            attachmentIndex: { type: "integer" },
            observation: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
          },
        },
      },
      medicationRequest: { type: "boolean" },
    },
  },
} as const;
