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
  type AiTranscript,
  type AiTriageDraft,
  type AiTriageRequest,
  type AiVisionQuestionRequest,
} from "@/lib/ai/provider";
import { buildTriageSystemPrompt, type PromptAttachmentNotes } from "@/lib/ai/safety";
import { parseTriageDraft } from "@/lib/ai/validation";

/**
 * The BluesMinds implementation of `AiProvider`.
 *
 * ## Why this is not just "OpenAI with a different base URL"
 *
 * The OpenAI provider talks to `POST /responses`. Verified against the live
 * BluesMinds account, that endpoint is proxied for text but rejects an image:
 * an `input_image` part returns 404 from upstream, and the text model returns
 * 502. Images only work through `POST /chat/completions`, which is the endpoint
 * this file uses for everything.
 *
 * ## What that costs
 *
 * The Responses API can bind output to a JSON Schema, so the OpenAI provider
 * gets a machine-guaranteed shape. `chat/completions` on this account does not
 * honour `json_schema` — a probe asking for a schema-shaped object came back as
 * free text. This provider therefore asks for `json_object` and validates the
 * reply against the same canonical schema with `parseTriageDraft`.
 *
 * That is a weaker guarantee, and it changes nothing about the outcome the
 * safety layer depends on: a reply that does not validate is a failed call, not
 * a best-effort extraction. The claim in `AiProvider`'s contract is preserved —
 * a draft is either schema-valid or it does not exist.
 *
 * ## Speech to text
 *
 * `transcribe` always refuses. The account answers 503 `model_not_found` for
 * `whisper-1`, so there is no model to send audio to, and the profile declares
 * the capability unsupported. A refusal is the honest answer; inventing a
 * transcript is not.
 */

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Ceiling on the reply. A triage draft is a bounded structure, so a run that
 * reaches this is looping, and a truncated draft must not be accepted.
 * Raised relative to the OpenAI provider because this model spends part of the
 * budget on reasoning tokens before it emits the object.
 */
const MAX_TRIAGE_TOKENS = 3000;
const MAX_VISION_TOKENS = 1200;

/** Earlier turns sent back with a follow-up. Older turns stay in our database. */
const MAX_HISTORY_TURNS = 8;

export type BluesMindsProviderConfig = {
  apiKey: string;
  baseUrl: string;
  /** Chat model. Verified text-only, so it is never used for an image. */
  model: string;
  /** Verified image-reading model. */
  visionModel: string;
};

type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ChatPart[] };

type ChatCompletionResponse = {
  choices?: {
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      refusal?: string | null;
      /** Some reasoning models emit the answer here; it is never used as one. */
      reasoning?: string | null;
      reasoning_content?: string | null;
    };
  }[];
};

export class BluesMindsProvider implements AiProvider {
  readonly id: AiProviderId = "bluesminds";
  readonly label: string;
  readonly model: string;
  readonly capabilities: readonly AiCapability[];
  readonly promptVersion: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly visionModel: string;

  constructor(config: BluesMindsProviderConfig) {
    const profile = providerProfile("bluesminds");
    this.label = profile.label;
    this.model = config.model;
    this.visionModel = config.visionModel;
    this.capabilities = profile.native;
    this.promptVersion = profile.promptVersion;
    this.apiKey = config.apiKey;
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

    const system = [
      buildTriageSystemPrompt({
        language: request.language,
        capabilities: [...this.capabilities],
        attachments: attachmentNotes(request.attachments),
        followUp: request.followUp,
      }),
      "",
      "## Response format",
      "Reply with a single JSON object and nothing else. No prose, no markdown code fences, no commentary before or",
      "after it. Every required field must be present. It must validate against this JSON Schema:",
      JSON.stringify(TRIAGE_DRAFT_JSON_SCHEMA.schema),
    ].join("\n");

    const messages: ChatMessage[] = [{ role: "system", content: system }];

    for (const turn of request.history.slice(-MAX_HISTORY_TURNS)) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: "user", content: buildUserContent(request) });

    const call = await this.postChat(
      {
        model: this.modelFor(request),
        messages,
        max_tokens: MAX_TRIAGE_TOKENS,
        temperature: 0.2,
        response_format: { type: "json_object" },
      },
      request.signal,
    );
    if (!call.ok) return outcome(call, startedAt, inputChars);

    const choice = call.data.choices?.[0];
    if (!choice) return outcome(aiFailure<AiTriageDraft>("provider_error"), startedAt, inputChars);

    // The provider's own safety filter answering with a refusal is a refusal.
    // It is never converted into an assessment.
    if (choice.message?.refusal) {
      return outcome(aiFailure<AiTriageDraft>("safety_blocked"), startedAt, inputChars);
    }

    // A reply cut off mid-object is missing fields the schema requires.
    // Rejecting it is the only honest option: a partial draft is not a partial
    // answer, it is an unreliable one.
    if (choice.finish_reason === "length") {
      return outcome(aiFailure<AiTriageDraft>("provider_error"), startedAt, inputChars);
    }

    // Only `content` is read. `reasoning`/`reasoning_content` is the model's
    // scratchpad; treating it as the draft would be inventing an assessment the
    // model never produced.
    const text = choice.message?.content?.trim();
    if (!text) return outcome(aiFailure<AiTriageDraft>("provider_error"), startedAt, inputChars);

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return outcome(aiFailure<AiTriageDraft>("provider_error"), startedAt, inputChars);
    }

    const parsed = parseTriageDraft(payload);
    if (!parsed.success) return outcome(aiFailure<AiTriageDraft>("provider_error"), startedAt, inputChars);

    return outcome<AiTriageDraft>({ ok: true, data: parsed.data }, startedAt, inputChars);
  }

  async visionQuestion(request: AiVisionQuestionRequest): Promise<AiProviderCallOutcome<{ text: string }>> {
    const startedAt = Date.now();
    const inputChars = request.question.length;
    if (!this.supports("VISION_IMAGE")) {
      return outcome(aiFailure<{ text: string }>("unsupported_capability"), startedAt, inputChars);
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are Sakha AI, an informational healthcare assistant. Describe only visible features and state uncertainty. " +
          "Do not diagnose, prescribe, or claim an image proves or rules out a condition. Do not infer beyond the image. " +
          "For severe bleeding, breathing difficulty, loss of consciousness, serious burns, or other emergency warning signs, " +
          "advise urgent medical help immediately and tell the user not to wait for an AI response. For report images, " +
          "explain only clearly legible text and identify anything unreadable or ambiguous.",
      },
    ];

    // Earlier turns travel as text so a follow-up keeps its thread. Only the
    // turn being asked about carries the image.
    for (const turn of (request.history ?? []).slice(-MAX_HISTORY_TURNS)) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({
      role: "user",
      content: [
        { type: "text", text: request.question },
        { type: "image_url", image_url: { url: request.dataUrl } },
      ],
    });

    const call = await this.postChat(
      {
        model: this.visionModel,
        messages,
        max_tokens: MAX_VISION_TOKENS,
        temperature: 0.3,
      },
      request.signal,
    );
    if (!call.ok) return outcome(call, startedAt, inputChars);

    const choice = call.data.choices?.[0];
    if (choice?.message?.refusal) {
      return outcome(aiFailure<{ text: string }>("safety_blocked"), startedAt, inputChars);
    }

    // No reasoning fallback: chain-of-thought presented as a medical
    // explanation would be a claim the model did not actually make.
    const text = choice?.message?.content?.trim();
    if (!text) return outcome(aiFailure<{ text: string }>("provider_error"), startedAt, inputChars);

    return outcome({ ok: true, data: { text } }, startedAt, inputChars);
  }

  async transcribe(request: AiTranscribeRequest): Promise<AiProviderCallOutcome<AiTranscript>> {
    // Refused before any network call: this account serves no speech-to-text
    // model, so there is nothing to send the audio to.
    void request;
    return outcome(aiFailure<AiTranscript>("unsupported_capability"), Date.now(), 0);
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  /**
   * One place for the fetch/parse/classify sequence so a timeout, a DNS failure
   * and a provider 500 all converge on the same typed result instead of
   * escaping as an unhandled rejection.
   *
   * The provider's error body is never logged. It can quote the prompt, and the
   * prompt is the patient's symptoms.
   */
  private async postChat(body: unknown, signal: AbortSignal | undefined): Promise<AiResult<ChatCompletionResponse>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const forwardAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", forwardAbort, { once: true });
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") return aiFailure<ChatCompletionResponse>("timeout");
      console.error(`[ai] ${this.id} request failed to reach the provider`, name || "unknown error");
      return aiFailure<ChatCompletionResponse>("network_error");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forwardAbort);
    }

    if (response.status === 429) return aiFailure<ChatCompletionResponse>("rate_limited", 429);
    if (!response.ok) {
      const kind: AiErrorKind =
        response.status === 400 && (await this.errorCodeIs(response, "content_policy_violation"))
          ? "safety_blocked"
          : "provider_error";
      console.error(`[ai] ${this.id} /chat/completions returned ${response.status} (${kind})`);
      return aiFailure<ChatCompletionResponse>(kind, response.status);
    }

    try {
      return { ok: true, data: (await response.json()) as ChatCompletionResponse };
    } catch {
      return aiFailure<ChatCompletionResponse>("provider_error", response.status);
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

/**
 * Turn the stated problem, the optional clinical context and the attachments
 * into one user turn.
 *
 * Only the attachments the provider can actually ingest are sent. A video is
 * described to the model as "not provided to you" by the system prompt rather
 * than being silently dropped, so the model cannot pretend it saw one.
 */
function buildUserContent(request: AiTriageRequest): string | ChatPart[] {
  const text = describeProblem(request);
  const images = request.attachments.filter((attachment) => attachment.kind === "IMAGE");

  if (images.length === 0) return text;

  const parts: ChatPart[] = [{ type: "text", text }];
  for (const image of images) {
    parts.push({ type: "image_url", image_url: { url: image.dataUrl } });
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
    // Only what this provider actually forwards is reported as provided.
    analysed: attachment.kind === "IMAGE",
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
  return total;
}

function outcome<T>(result: AiResult<T>, startedAt: number, inputChars: number): AiProviderCallOutcome<T> {
  return { result, usage: { latencyMs: Date.now() - startedAt, inputChars } };
}
