import "server-only";

import type { AiCapability } from "@prisma/client";

import { providerProfile, type AiProviderId } from "@/lib/ai/capabilities";
import {
  TRIAGE_DRAFT_JSON_SCHEMA,
  aiFailure,
  type AiAttachment,
  type AiErrorKind,
  type AiProvider,
  type AiProviderCallOutcome,
  type AiResult,
  type AiTranscribeRequest,
  type AiVisionQuestionRequest,
  type AiTranscript,
  type AiTriageDraft,
  type AiTriageRequest,
} from "@/lib/ai/provider";
import { buildTriageSystemPrompt, type PromptAttachmentNotes } from "@/lib/ai/safety";
import { parseTriageDraft } from "@/lib/ai/validation";

/**
 * The OpenAI implementation of `AiProvider`.
 *
 * Two endpoints are used, both from the provider's current documented REST API:
 *
 *  - `POST /responses` for triage, with structured output bound to
 *    `TRIAGE_DRAFT_JSON_SCHEMA` so the model cannot answer in prose the safety
 *    layer would then have to parse. An unparseable reply is a failed call, not
 *    a best-effort extraction.
 *  - `POST /audio/transcriptions` for voice notes. Transcription returns text
 *    the user can correct; the corrected text is what gets assessed.
 *
 * The failure contract is `src/lib/ai/provider.ts`, and it is honoured strictly:
 * every path returns an `AiResult`. Nothing here throws for an expected
 * condition, and nothing here invents a draft when the call did not produce one.
 */

const REQUEST_TIMEOUT_MS = 45_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

/**
 * Ceiling on the draft. A triage draft is a bounded structure — the schema
 * itself caps every list — so a run that reaches this is looping, and a
 * truncated draft must not be accepted.
 */
const MAX_OUTPUT_TOKENS = 2400;

/** Earlier turns sent back with a follow-up. Older turns stay in our database. */
const MAX_HISTORY_TURNS = 8;

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
};

export type OpenAiProviderConfig = {
  apiKey: string;
  organization: string | null;
  baseUrl: string;
  /** Vision/reasoning model used for the triage draft. */
  model: string;
  /** Explicit vision model override. */
  visionModel?: string;
  /** Speech-to-text model. A chat model cannot be used on this endpoint. */
  transcribeModel: string;
};

export class OpenAiProvider implements AiProvider {
  readonly id: AiProviderId = "openai";
  readonly label: string;
  readonly model: string;
  readonly capabilities: readonly AiCapability[];
  readonly promptVersion: string;

  private readonly apiKey: string;
  private readonly organization: string | null;
  private readonly baseUrl: string;
  private readonly transcribeModel: string;
  private readonly visionModel: string;

  constructor(config: OpenAiProviderConfig) {
    const profile = providerProfile("openai");
    this.label = profile.label;
    this.model = config.model;
    this.visionModel = config.visionModel ?? config.model;
    this.transcribeModel = config.transcribeModel;
    this.capabilities = profile.native;
    this.promptVersion = profile.promptVersion;
    this.apiKey = config.apiKey;
    this.organization = config.organization;
    this.baseUrl = config.baseUrl;
  }

  supports(capability: AiCapability): boolean {
    return this.capabilities.includes(capability);
  }

  modelFor(request: AiTriageRequest): string {
    return request.attachments.some((attachment) => attachment.kind === "IMAGE") ? this.visionModel : this.model;
  }

  async triage(request: AiTriageRequest): Promise<AiProviderCallOutcome<AiTriageDraft>> {
    const startedAt = Date.now();
    const inputChars = countRequestChars(request);

    // An attachment whose media type this provider cannot ingest must be a
    // refusal, not a silent omission. The user is told the file was not read.
    const unsupported = request.attachments.find((attachment) => {
      const capability = capabilityFor(attachment);
      return capability !== null && !this.supports(capability);
    });
    if (unsupported) {
      return outcome(aiFailure<AiTriageDraft>("unsupported_capability"), startedAt, inputChars);
    }

    const body = {
      model: this.modelFor(request),
      instructions: buildTriageSystemPrompt({
        language: request.language,
        capabilities: [...this.capabilities],
        attachments: attachmentNotes(request.attachments),
        followUp: request.followUp,
      }),
      input: buildInput(request),
      text: {
        format: {
          type: "json_schema" as const,
          name: TRIAGE_DRAFT_JSON_SCHEMA.name,
          strict: TRIAGE_DRAFT_JSON_SCHEMA.strict,
          schema: TRIAGE_DRAFT_JSON_SCHEMA.schema,
        },
      },
      max_output_tokens: MAX_OUTPUT_TOKENS,
    };

    const call = await this.postJson<ResponsesResponse>("/responses", body, REQUEST_TIMEOUT_MS, request.signal);
    if (!call.ok) return outcome(call, startedAt, inputChars);
    const response = call.data;

    // The provider's own safety filter answering with a refusal is a refusal.
    // It is never converted into an assessment.
    if (containsRefusal(response)) {
      return outcome(aiFailure<AiTriageDraft>("safety_blocked"), startedAt, inputChars);
    }

    if (response.status === "incomplete") {
      // A truncated draft is missing fields the schema requires; rejecting it is
      // the only honest option, because a partial draft is not a partial answer,
      // it is an unreliable one.
      return outcome(aiFailure<AiTriageDraft>("provider_error"), startedAt, inputChars);
    }

    const text = extractOutputText(response);
    if (!text) return outcome(aiFailure<AiTriageDraft>("provider_error"), startedAt, inputChars);

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return outcome(aiFailure<AiTriageDraft>("provider_error"), startedAt, inputChars);
    }

    const parsed = parseTriageDraft(payload);
    if (!parsed.success) return outcome(aiFailure<AiTriageDraft>("provider_error"), startedAt, inputChars);

    const draft: AiTriageDraft = parsed.data;
    return outcome<AiTriageDraft>({ ok: true, data: draft }, startedAt, inputChars);
  }

  async visionQuestion(request: AiVisionQuestionRequest): Promise<AiProviderCallOutcome<{ text: string }>> {
    const startedAt = Date.now();
    const inputChars = request.question.length;
    if (!this.supports("VISION_IMAGE")) {
      return outcome(aiFailure<{ text: string }>("unsupported_capability"), startedAt, inputChars);
    }

    const call = await this.postJson<ResponsesResponse>(
      "/responses",
      {
        model: this.visionModel,
        instructions:
          "You are Sakha AI, an informational healthcare assistant. Describe only visible features and state uncertainty. " +
          "Do not diagnose, prescribe, or claim an image proves or rules out a condition. Do not infer beyond the image. " +
          "For severe bleeding, breathing difficulty, loss of consciousness, serious burns, or other emergency warning signs, " +
          "advise urgent medical help immediately and tell the user not to wait for an AI response. For report images, " +
          "explain only clearly legible text and identify anything unreadable or ambiguous.",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: request.question },
              { type: "input_image", image_url: request.dataUrl },
            ],
          },
        ],
        max_output_tokens: 700,
      },
      REQUEST_TIMEOUT_MS,
      request.signal,
    );
    if (!call.ok) return outcome(call, startedAt, inputChars);
    const text = extractOutputText(call.data);
    if (!text) return outcome(aiFailure<{ text: string }>("provider_error"), startedAt, inputChars);
    return outcome({ ok: true, data: { text } }, startedAt, inputChars);
  }

  async transcribe(request: AiTranscribeRequest): Promise<AiProviderCallOutcome<AiTranscript>> {
    const startedAt = Date.now();
    const inputChars = request.bytes.byteLength;

    if (!this.supports("AUDIO_TRANSCRIPTION")) {
      return outcome(aiFailure<AiTranscript>("unsupported_capability"), startedAt, inputChars);
    }

    // Copied into a fresh buffer so the Blob owns a plain `ArrayBuffer`. The
    // incoming view may be a subarray of a shared pool.
    const audio = new Uint8Array(request.bytes.byteLength);
    audio.set(request.bytes);

    const form = new FormData();
    form.append(
      "file",
      new Blob([audio], { type: request.mimeType }),
      `voice-note.${AUDIO_EXTENSIONS[request.mimeType] ?? "webm"}`,
    );
    form.append("model", this.transcribeModel);
    form.append("response_format", "json");
    if (request.language) form.append("language", request.language);

    const call = await this.postForm<TranscriptionResponse>("/audio/transcriptions", form, TRANSCRIBE_TIMEOUT_MS, request.signal);
    if (!call.ok) return outcome(call, startedAt, inputChars);

    const text = typeof call.data.text === "string" ? call.data.text.trim() : "";
    if (!text) return outcome(aiFailure<AiTranscript>("provider_error"), startedAt, inputChars);

    return outcome<AiTranscript>(
      {
        ok: true,
        // Duration is not reported by this response format, and a guessed number
        // is worse than an absent one.
        data: { text, language: request.language ?? null, durationSeconds: null },
      },
      startedAt,
      inputChars,
    );
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  private headers(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}` };
    if (contentType) headers["content-type"] = contentType;
    if (this.organization) headers["openai-organization"] = this.organization;
    return headers;
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<AiResult<T>> {
    return this.send<T>(path, JSON.stringify(body), timeoutMs, signal, "application/json");
  }

  private async postForm<T>(
    path: string,
    form: FormData,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<AiResult<T>> {
    // The multipart boundary is generated by FormData itself, so the
    // content-type header is intentionally omitted here.
    return this.send<T>(path, form, timeoutMs, signal);
  }

  /**
   * One place of the fetch/parse/classify sequence so a timeout, a DNS failure
   * and a provider 500 all converge on the same typed result instead of
   * escaping as an unhandled rejection.
   *
   * The provider's error body is never logged. It can quote the prompt, and the
   * prompt is the patient's symptoms.
   */
  private async send<T>(
    path: string,
    payload: string | FormData,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    contentType?: string,
  ): Promise<AiResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const forwardAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", forwardAbort, { once: true });
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(contentType),
        body: payload,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") return aiFailure<T>("timeout");
      console.error(`[ai] ${this.id} request failed to reach the provider`, name || "unknown error");
      return aiFailure<T>("network_error");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forwardAbort);
    }

    if (response.status === 429) return aiFailure<T>("rate_limited", 429);
    if (!response.ok) {
      const kind: AiErrorKind =
        response.status === 400 && (await this.errorCodeIs(response, "content_policy_violation"))
          ? "safety_blocked"
          : "provider_error";
      console.error(`[ai] ${this.id} ${path} returned ${response.status} (${kind})`);
      return aiFailure<T>(kind, response.status);
    }

    try {
      return { ok: true, data: (await response.json()) as T };
    } catch {
      return aiFailure<T>("provider_error", response.status);
    }
  }

  /**
   * Read only the machine-readable error code, never the message: the code is
   * an enum, while the message can quote the request back.
   */
  private async errorCodeIs(response: Response, code: string): Promise<boolean> {
    try {
      const body = (await response.json()) as { error?: { code?: string } };
      return body.error?.code === code;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Request construction
// ---------------------------------------------------------------------------

type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_file"; filename: string; file_data: string };

type InputMessage = { role: "user" | "assistant"; content: ContentPart[] };

/**
 * Turn the stated problem, the optional clinical context and the attachments
 * into one user turn, preceded by the earlier turns of the conversation.
 *
 * Only the attachments the provider can actually ingest are sent. A video is
 * described to the model as "not provided to you" by the system prompt rather
 * than being silently dropped, so the model cannot pretend it saw one.
 */
function buildInput(request: AiTriageRequest): InputMessage[] {
  const input: InputMessage[] = [];

  for (const turn of request.history.slice(-MAX_HISTORY_TURNS)) {
    input.push({
      role: turn.role,
      content: [{ type: "input_text", text: turn.content }],
    });
  }

  input.push({ role: "user", content: buildUserContent(request) });
  return input;
}

function buildUserContent(request: AiTriageRequest): ContentPart[] {
  const parts: ContentPart[] = [{ type: "input_text", text: describeProblem(request) }];

  for (const attachment of request.attachments) {
    if (attachment.kind === "IMAGE") {
      parts.push({ type: "input_image", image_url: attachment.dataUrl });
      continue;
    }
    if (attachment.kind === "DOCUMENT") {
      if (attachment.mimeType === "application/pdf" && attachment.dataUrl) {
        parts.push({ type: "input_file", filename: attachment.label, file_data: attachment.dataUrl });
      } else if (attachment.text) {
        parts.push({ type: "input_text", text: `Document "${attachment.label}":\n${attachment.text}` });
      }
      continue;
    }
    if (attachment.kind === "AUDIO" && !request.statement.includes(attachment.transcript)) {
      parts.push({ type: "input_text", text: `Voice note transcript "${attachment.label}": ${attachment.transcript}` });
    }
    // VIDEO is deliberately not forwarded. See `AiVideoAttachment`.
  }

  return parts;
}

function describeProblem(request: AiTriageRequest): string {
  const context = request.clinical;
  const lines = [request.followUp ? `Follow-up question: ${request.statement}` : `Reported problem: ${request.statement}`];

  const described: string[] = [];
  if (context.ageRange) described.push(`age range ${context.ageRange}`);
  if (context.sexAtBirth) described.push(`sex at birth ${context.sexAtBirth}`);
  if (context.symptomDuration) described.push(`duration ${context.symptomDuration}`);
  if (context.symptomOnset) described.push(`onset ${context.symptomOnset}`);
  if (context.historyNotes) described.push(`relevant history: ${context.historyNotes}`);
  if (context.currentMedications) described.push(`medicines they already take: ${context.currentMedications}`);
  if (context.allergies) described.push(`known allergies: ${context.allergies}`);

  if (described.length > 0) lines.push(`Context supplied by the user: ${described.join("; ")}.`);
  return lines.join("\n");
}

function attachmentNotes(attachments: readonly AiAttachment[]): PromptAttachmentNotes[] {
  return attachments.map((attachment) => ({
    label: attachment.label,
    kind: attachment.kind,
    // A video is attached to the clinician report and never analysed, so it is
    // reported to the model as not provided.
    analysed:
      attachment.kind === "IMAGE" ||
      (attachment.kind === "DOCUMENT" && Boolean(attachment.text || attachment.dataUrl)) ||
      attachment.kind === "AUDIO",
  }));
}

function capabilityFor(attachment: AiAttachment): AiCapability | null {
  switch (attachment.kind) {
    case "IMAGE":
      return "VISION_IMAGE";
    case "DOCUMENT":
      return "DOCUMENT";
    case "VIDEO":
      return "VIDEO";
    default:
      // An audio attachment arriving here is already text, so reading it needs
      // no audio capability.
      return null;
  }
}

function countRequestChars(request: AiTriageRequest): number {
  let total = request.statement.length;
  for (const turn of request.history) total += turn.content.length;
  for (const attachment of request.attachments) {
    if (attachment.kind === "DOCUMENT" && attachment.text) total += attachment.text.length;
    if (attachment.kind === "AUDIO") total += attachment.transcript.length;
  }
  return total;
}

function outcome<T>(result: AiResult<T>, startedAt: number, inputChars: number): AiProviderCallOutcome<T> {
  return { result, usage: { latencyMs: Date.now() - startedAt, inputChars } };
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

type ResponsesResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: {
    type?: string;
    content?: { type?: string; text?: string; refusal?: string }[];
  }[];
};

type TranscriptionResponse = { text?: string };

function containsRefusal(response: ResponsesResponse): boolean {
  return (response.output ?? []).some((item) => (item.content ?? []).some((part) => part.type === "refusal"));
}

function extractOutputText(response: ResponsesResponse): string | null {
  const text = (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim();
  return text.length > 0 ? text : null;
}
