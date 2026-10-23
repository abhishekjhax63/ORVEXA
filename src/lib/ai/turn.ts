import "server-only";

import type { AiCapability, AiProviderOutcome, AiUrgencyBand } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { AI_CONSENT_POLICY_VERSION } from "@/lib/ai/capabilities";
import {
  aiCapabilityReport,
  getAiEscalationPolicy,
  getAiRetentionPolicy,
  retentionDeadline,
} from "@/lib/ai/config";
import { createConversation, requestClinicalReview, requireOwnedConversation } from "@/lib/ai/conversations";
import { assessmentToView, redFlagsToView } from "@/lib/ai/read";
import {
  AI_ERROR_COPY,
  type AiAttachment,
  type AiError,
  type AiErrorKind,
  type AiProvider,
  type AiTriageDraft,
  type AiTriageRequest,
} from "@/lib/ai/provider";
import { applySafetyPolicy, buildRedFlagEscalation, redFlagsForRequest, type SafetyOutcome } from "@/lib/ai/safety";
import { requireAiProvider } from "@/lib/ai/service";
import { uploadsToAttachments, type TurnUploads } from "@/lib/ai/uploads";
import type { AssessmentMediaView, AssessmentView, TurnResponse, UnavailableStateView } from "@/lib/ai/view";
import type { AiTurnRequestInput } from "@/lib/ai/validation";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";

/**
 * One turn of the assistant.
 *
 * This is the only place where a user's words and files become an assessment,
 * and the ordering in here is the safety design:
 *
 *  1. Consent is resolved before anything else. Without it the turn is
 *     ephemeral: the model is still consulted, but nothing is written down.
 *  2. Attachments are assembled from stored uploads, and anything the model
 *     cannot read is *withheld and reported* rather than silently dropped.
 *  3. The provider is called. If it fails and the description contains a red
 *     flag, the deterministic escalation from `safety.ts` is used instead — a
 *     failed network call must never be able to suppress an emergency warning.
 *     If it fails and there is no red flag, the turn fails. Nothing is invented.
 *  4. `applySafetyPolicy` runs over the draft. It strips prescribing, imposes the
 *     red-flag urgency floor, and attaches the limitations text.
 *  5. Only then is anything persisted, and only when the user agreed to storage.
 *
 * There is no branch anywhere in this file that produces medical content the
 * model or the lexicon did not produce.
 */

export type TurnResult =
  | { ok: true; response: TurnResponse }
  | { ok: false; kind: "rejected"; status: number; message: string }
  | { ok: false; kind: "unavailable"; error: AiError; conversationId: string | null; unavailable: UnavailableStateView };

/** How many earlier messages are replayed so a follow-up keeps its thread. */
const MAX_HISTORY_MESSAGES = 12;

const PROVIDER_OUTCOME_BY_ERROR: Record<AiErrorKind, AiProviderOutcome> = {
  not_configured: "NOT_CONFIGURED",
  unsupported_capability: "UNSUPPORTED_CAPABILITY",
  timeout: "TIMEOUT",
  network_error: "PROVIDER_ERROR",
  rate_limited: "RATE_LIMITED",
  provider_error: "PROVIDER_ERROR",
  safety_blocked: "SAFETY_BLOCKED",
};

const EPHEMERAL_NOTICE =
  "This assessment is not being stored. Nothing you wrote or uploaded is kept, and follow-up questions need a " +
  "stored conversation.";

export async function runTurn(input: { ownerUserId: string; request: AiTurnRequestInput }): Promise<TurnResult> {
  const { ownerUserId, request } = input;
  const policy = getAiEscalationPolicy();
  const retention = getAiRetentionPolicy();

  // --- 1. Consent and conversation -----------------------------------------

  let stored: { id: string; language: string } | null = null;

  if (request.conversationId) {
    const conversation = await requireOwnedConversation({ ownerUserId, conversationId: request.conversationId });
    if (!conversation) return { ok: false, kind: "rejected", status: 404, message: "That conversation is not on your account." };
    if (!conversation.consentAcknowledgedAt) {
      return {
        ok: false,
        kind: "rejected",
        status: 409,
        message: "This conversation is not set to store anything, so nothing can be added to it.",
      };
    }
    stored = { id: conversation.id, language: conversation.language };
  } else if (request.consentToStore) {
    const created = await createConversation({
      ownerUserId,
      language: request.language,
      title: titleFrom(request.statement),
      policyVersion: request.consentPolicyVersion,
      familyMemberId: request.familyMemberId ?? null,
    });
    stored = { id: created.id, language: created.language };
  } else {
    if (request.uploadIds.length > 0) {
      return {
        ok: false,
        kind: "rejected",
        status: 400,
        message: "Files need a stored conversation. Agree to store this one before attaching anything.",
      };
    }
    if (request.followUp) {
      return {
        ok: false,
        kind: "rejected",
        status: 409,
        message: "Follow-up questions need a stored conversation, so the earlier turns are still there to answer from.",
      };
    }
  }

  // --- 2. Attachments ------------------------------------------------------

  const uploads = stored
    ? await prisma.aiUpload.findMany({
        where: { id: { in: request.uploadIds }, conversationId: stored.id, ownerUserId, deletedAt: null },
      })
    : [];

  if (stored && uploads.length !== request.uploadIds.length) {
    return { ok: false, kind: "rejected", status: 404, message: "One of the attached files is not on this conversation." };
  }

  const providerResult = requireAiProvider();
  const provider = providerResult.ok ? providerResult.data : null;

  const turnUploads: TurnUploads = await uploadsToAttachments({
    ownerUserId,
    uploads,
    providerSupports: (capability) => provider?.supports(capability) ?? false,
  });

  // --- 3. Build the request ------------------------------------------------

  const history = stored ? await loadHistory(stored.id) : [];
  const triageRequest: AiTriageRequest = {
    language: request.language,
    clinical: {
      ageRange: emptyToNull(request.clinical.ageRange),
      sexAtBirth: emptyToNull(request.clinical.sexAtBirth),
      symptomDuration: emptyToNull(request.clinical.symptomDuration),
      symptomOnset: emptyToNull(request.clinical.symptomOnset),
      historyNotes: emptyToNull(request.clinical.historyNotes),
      currentMedications: emptyToNull(request.clinical.currentMedications),
      allergies: emptyToNull(request.clinical.allergies),
    },
    statement: request.statement,
    history,
    attachments: turnUploads.attachments,
    followUp: request.followUp,
  };

  const draftOutcome = await produceDraft({ triageRequest, provider, policy, conversationId: stored?.id ?? null, ownerUserId });
  if (!draftOutcome.ok) return draftOutcome.failure;

  const { draft, isDegraded, providerId, model, latencyMs, inputChars, failureError } = draftOutcome;

  // --- 4. Safety layer -----------------------------------------------------

  const safety = applySafetyPolicy({ request: triageRequest, draft, policy });
  const capabilities = isDegraded ? (["TEXT"] as AiCapability[]) : capabilitiesFor(turnUploads.attachments);

  const mediaObservations = buildMediaObservations(safety, turnUploads.attachments);
  const assessmentFields = assessmentFieldsFrom({ safety, draft, mediaObservations });

  // --- 5. Persist ----------------------------------------------------------

  if (!stored) {
    return {
      ok: true,
      response: {
        conversationId: null,
        ephemeral: true,
        assessment: {
          ...assessmentToView(
            ephemeralAssessmentRow({
              ownerUserId,
              language: request.language,
              statement: request.statement,
              fields: assessmentFields,
            }),
            {
              modelUrgency: safety.modelUrgency,
              redFlags: redFlagsToView(safety.redFlags),
              safetyLine: safety.safetyLine,
              mediaObservations,
              withheld: turnUploads.withheld.map((item) => ({ fileName: item.fileName, reason: item.reason })),
              followUp: request.followUp,
            },
          ),
          conversationId: null,
        },
      },
    };
  }

  const now = new Date();
  const userMessage = await prisma.aiMessage.create({
    data: {
      conversationId: stored.id,
      role: "USER",
      kind: uploads.length > 0 ? "ATTACHMENT" : "TEXT",
      content: request.statement,
      language: request.language,
      redFlagCodes: safety.redFlags.map((flag) => flag.code),
      urgency: null,
    },
    select: { id: true },
  });

  const assessment = await prisma.$transaction(async (tx) => {
    const assistantMessage = await tx.aiMessage.create({
      data: {
        conversationId: stored.id,
        role: "ASSISTANT",
        kind: isDegraded ? "PROVIDER_UNAVAILABLE" : "ASSESSMENT",
        content: safety.draft.summary,
        language: request.language,
        provider: providerId,
        model,
        capabilities,
        redFlagCodes: safety.redFlags.map((flag) => flag.code),
        urgency: safety.urgency,
        medicationRefused: safety.medicationRefused,
        latencyMs,
      },
      select: { id: true },
    });

    const created = await tx.aiAssessment.create({
      data: {
        conversationId: stored.id,
        ownerUserId,
        familyMemberId: request.familyMemberId ?? null,
        status: statusFor(safety),
        language: request.language,
        ageRange: triageRequest.clinical.ageRange,
        sexAtBirth: triageRequest.clinical.sexAtBirth,
        symptomDuration: triageRequest.clinical.symptomDuration,
        symptomOnset: triageRequest.clinical.symptomOnset,
        historyNotes: triageRequest.clinical.historyNotes,
        currentMedications: triageRequest.clinical.currentMedications,
        allergies: triageRequest.clinical.allergies,
        ...assessmentFields,
        provider: providerId,
        model,
        promptVersion: provider?.promptVersion ?? null,
        safetyPolicyVersion: safety.safetyPolicyVersion,
        escalatedAt: safety.escalated ? now : null,
        escalationReason: safety.overrideReason,
        clinicalReviewRequired: safety.clinicalReviewRequired,
        consentToStoreAt: now,
        consentPolicyVersion: request.consentPolicyVersion?.trim() || AI_CONSENT_POLICY_VERSION,
        retentionUntil: retentionDeadline(retention.unsavedAssessmentDays),
      },
    });

    const linked = alignUploads(uploads, turnUploads);
    const analysedIds = linked.filter((upload) => turnUploads.analysedIds.includes(upload.id)).map((upload) => upload.id);
    if (analysedIds.length > 0) {
      await tx.aiAssessmentUpload.createMany({
        data: analysedIds.map((uploadId) => ({ assessmentId: created.id, uploadId })),
        skipDuplicates: true,
      });
    }

    for (const upload of linked) {
      const observation = mediaObservations.find((item) => item.label === upload.fileName);
      await tx.aiUpload.update({
        where: { id: upload.id },
        data: {
          messageId: userMessage.id,
          mediaSummary: observation?.observation ?? upload.mediaSummary,
        },
      });
    }

    await tx.aiConversation.update({
      where: { id: stored.id },
      data: {
        language: request.language,
        lastMessageAt: now,
        title: undefined,
      },
    });

    return { row: created, assistantMessageId: assistantMessage.id };
  });

  await recordProviderCalls({
    ownerUserId,
    conversationId: stored.id,
    capabilities,
    providerId: providerId ?? "none",
    model,
    latencyMs,
    inputChars,
    errorKind: failureError?.kind ?? null,
  });

  await recordAuditEvent({
    action: "ai.turn_completed",
    entityType: "ai_assessment",
    entityId: assessment.row.id,
    actorUserId: ownerUserId,
    metadata: {
      conversationId: stored.id,
      urgency: safety.urgency,
      modelUrgency: safety.modelUrgency,
      escalated: safety.escalated,
      redFlags: safety.redFlags.map((flag) => flag.code),
      medicationRefused: safety.medicationRefused,
      degraded: isDegraded,
      withheld: turnUploads.withheld.length,
    },
  });

  if (safety.escalated) {
    await recordAuditEvent({
      action: "ai.escalated",
      entityType: "ai_assessment",
      entityId: assessment.row.id,
      actorUserId: ownerUserId,
      metadata: { urgency: safety.urgency, redFlags: safety.redFlags.map((flag) => flag.code) },
    });
  }

  if (safety.clinicalReviewRequired) {
    // Raised automatically, and recorded as requested rather than as reviewed: a
    // queue entry is a real record of a request, never a claim that a clinician
    // has already looked at it.
    await requestClinicalReview({
      requestedById: ownerUserId,
      assessmentId: assessment.row.id,
      automatic: true,
      requestNotes: `Raised automatically: the assessment reached ${safety.urgency.toLowerCase()} with ${
        safety.redFlags.length
      } red flag(s).`,
    });
  }

  const view = assessmentToView(assessment.row, {
    modelUrgency: safety.modelUrgency,
    redFlags: redFlagsToView(safety.redFlags),
    safetyLine: safety.safetyLine,
    mediaObservations,
    withheld: turnUploads.withheld.map((item) => ({ fileName: item.fileName, reason: item.reason })),
    followUp: request.followUp,
  });

  return { ok: true, response: { conversationId: stored.id, ephemeral: false, assessment: view } };
}

// ---------------------------------------------------------------------------
// Producing a draft
// ---------------------------------------------------------------------------

type DraftOutcome =
  | {
      ok: true;
      draft: AiTriageDraft;
      isDegraded: boolean;
      providerId: string | null;
      model: string | null;
      latencyMs: number;
      inputChars: number;
      failureError: AiError | null;
    }
  | { ok: false; failure: TurnResult };

async function produceDraft(input: {
  triageRequest: AiTriageRequest;
  provider: AiProvider | null;
  policy: ReturnType<typeof getAiEscalationPolicy>;
  conversationId: string | null;
  ownerUserId: string;
}): Promise<DraftOutcome> {
  const { triageRequest, policy } = input;

  if (!input.provider) {
    return degradeOrFail({
      triageRequest,
      policy,
      error: { kind: "not_configured", message: AI_ERROR_COPY.not_configured },
      conversationId: input.conversationId,
      ownerUserId: input.ownerUserId,
    });
  }

  const outcome = await input.provider.triage(triageRequest);
  if (outcome.result.ok) {
    return {
      ok: true,
      draft: outcome.result.data,
      isDegraded: false,
      providerId: input.provider.id,
      model: input.provider.model,
      latencyMs: outcome.usage.latencyMs,
      inputChars: outcome.usage.inputChars,
      failureError: null,
    };
  }

  return degradeOrFail({
    triageRequest,
    policy,
    error: outcome.result.error,
    conversationId: input.conversationId,
    ownerUserId: input.ownerUserId,
    providerId: input.provider.id,
    model: input.provider.model,
    latencyMs: outcome.usage.latencyMs,
    inputChars: outcome.usage.inputChars,
  });
}

/**
 * Decide what a failed (or absent) provider call means.
 *
 * The asymmetry is the point: a red flag in the description is escalated by the
 * fixed rules even with no model, because a network outage must not be able to
 * silence "call an ambulance". With no red flag there is nothing safe to say, so
 * the turn fails and the workspace shows that the assistant is unavailable.
 */
async function degradeOrFail(input: {
  triageRequest: AiTriageRequest;
  policy: ReturnType<typeof getAiEscalationPolicy>;
  error: AiError;
  conversationId: string | null;
  ownerUserId: string;
  providerId?: string;
  model?: string;
  latencyMs?: number;
  inputChars?: number;
}): Promise<DraftOutcome> {
  const redFlags = redFlagsForRequest(input.triageRequest);

  if (redFlags.length === 0) {
    await recordAuditEvent({
      action: "ai.turn_failed",
      entityType: "ai_conversation",
      entityId: input.conversationId,
      outcome: "FAILURE",
      actorUserId: input.ownerUserId,
      metadata: { errorKind: input.error.kind },
    });
    return {
      ok: false,
      failure: {
        ok: false,
        kind: "unavailable",
        error: input.error,
        conversationId: input.conversationId,
        unavailable: unavailableState(input.error),
      },
    };
  }

  return {
    ok: true,
    draft: buildRedFlagEscalation({ redFlags, policy: input.policy, language: input.triageRequest.language }),
    isDegraded: true,
    providerId: input.providerId ?? null,
    model: null,
    latencyMs: input.latencyMs ?? 0,
    inputChars: input.inputChars ?? 0,
    failureError: input.error,
  };
}

export function unavailableState(error: AiError): UnavailableStateView {
  const report = aiCapabilityReport();
  return {
    kind: error.kind,
    message: error.message,
    available: report.available,
    unavailable: report.unavailable,
    providerLabel: report.providerLabel,
  };
}

// ---------------------------------------------------------------------------
// Voice notes
// ---------------------------------------------------------------------------

/**
 * Transcribe a voice note.
 *
 * Returns `null` for every failure — no provider, no audio capability, a failed
 * call — because the caller's only safe option in each case is the same: record
 * the upload as unread and let the user type their symptoms instead. A
 * fabricated transcript would be the worst possible answer here.
 */
export async function transcribeAudio(input: {
  ownerUserId: string;
  conversationId: string | null;
  bytes: Uint8Array;
  mimeType: string;
  language?: string | null;
}): Promise<{ transcript: string } | null> {
  const providerResult = requireAiProvider();
  if (!providerResult.ok) return null;

  const provider = providerResult.data;
  if (!provider.supports("AUDIO_TRANSCRIPTION")) return null;

  const outcome = await provider.transcribe({
    mimeType: input.mimeType,
    bytes: input.bytes,
    language: input.language ?? null,
  });

  await recordProviderCalls({
    ownerUserId: input.ownerUserId,
    conversationId: input.conversationId,
    capabilities: ["AUDIO_TRANSCRIPTION"],
    providerId: provider.id,
    model: provider.model,
    latencyMs: outcome.usage.latencyMs,
    inputChars: outcome.usage.inputChars,
    errorKind: outcome.result.ok ? null : outcome.result.error.kind,
  });

  if (!outcome.result.ok) return null;
  const text = outcome.result.data.text.trim();
  return text.length > 0 ? { transcript: text } : null;
}

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

type AssessmentFields = {
  summary: string;
  possibleCauses: Prisma.InputJsonValue;
  warningSigns: Prisma.InputJsonValue;
  recommendedSteps: Prisma.InputJsonValue;
  clarifyingQuestions: Prisma.InputJsonValue;
  selfCareGuidance: string | null;
  uncertaintyNotes: string;
  limitationsNotice: string;
  urgency: AiUrgencyBand;
  urgencyRationale: string;
  redFlagCodes: string[];
  medicationRefused: boolean;
};

function assessmentFieldsFrom(input: {
  safety: SafetyOutcome;
  draft: AiTriageDraft;
  mediaObservations: AssessmentMediaView[];
}): AssessmentFields {
  const { safety } = input;
  const draft = safety.draft;
  return {
    summary: draft.summary,
    possibleCauses: draft.possibleCauses as unknown as Prisma.InputJsonValue,
    warningSigns: draft.warningSigns as unknown as Prisma.InputJsonValue,
    recommendedSteps: draft.recommendedSteps as unknown as Prisma.InputJsonValue,
    clarifyingQuestions: draft.clarifyingQuestions as unknown as Prisma.InputJsonValue,
    selfCareGuidance: draft.selfCareGuidance,
    uncertaintyNotes: draft.uncertaintyNotes,
    limitationsNotice: safety.limitationsNotice,
    urgency: safety.urgency,
    // When the band was raised the reason is kept instead of the model's own
    // rationale: what a reader needs to know is why the screen says EMERGENCY.
    urgencyRationale: safety.overrideReason ?? draft.urgencyRationale,
    redFlagCodes: safety.redFlags.map((flag) => flag.code),
    medicationRefused: safety.medicationRefused,
  };
}

function statusFor(safety: SafetyOutcome): "DRAFT" | "ESCALATED" | "AWAITING_REVIEW" {
  if (safety.redFlags.length > 0) return "ESCALATED";
  if (safety.clinicalReviewRequired) return "AWAITING_REVIEW";
  return "DRAFT";
}

function capabilitiesFor(attachments: readonly AiAttachment[]): AiCapability[] {
  const capabilities = new Set<AiCapability>(["TEXT"]);
  for (const attachment of attachments) {
    if (attachment.kind === "IMAGE") capabilities.add("VISION_IMAGE");
    if (attachment.kind === "AUDIO") capabilities.add("AUDIO_TRANSCRIPTION");
    if (attachment.kind === "DOCUMENT") capabilities.add("DOCUMENT");
  }
  return [...capabilities];
}

function buildMediaObservations(safety: SafetyOutcome, attachments: readonly AiAttachment[]): AssessmentMediaView[] {
  const observations: AssessmentMediaView[] = [];
  for (const observation of safety.draft.mediaObservations) {
    const attachment = attachments[observation.attachmentIndex];
    if (!attachment) continue;
    observations.push({
      label: attachment.label,
      observation: observation.observation,
      confidence: observation.confidence,
    });
  }
  return observations;
}

/**
 * Pair each attachment back to the upload it came from.
 *
 * `uploadsToAttachments` emits exactly one attachment per upload it did not
 * withhold, in order, so the two lists line up — and anything withheld keeps its
 * id out of the pairing entirely.
 */
function alignUploads(uploads: readonly UploadWithId[], turnUploads: TurnUploads) {
  const withheld = new Set(turnUploads.withheld.map((item) => item.id));
  return uploads.filter((upload) => !withheld.has(upload.id));
}

type UploadWithId = Awaited<ReturnType<typeof prisma.aiUpload.findMany>>[number];

async function loadHistory(conversationId: string): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const recent = await prisma.aiMessage.findMany({
    where: { conversationId, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY_MESSAGES,
    select: { role: true, content: true },
  });

  return recent
    .reverse()
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({ role: message.role === "ASSISTANT" ? ("assistant" as const) : ("user" as const), content: message.content }));
}

async function recordProviderCalls(input: {
  ownerUserId: string;
  conversationId: string | null;
  capabilities: readonly AiCapability[];
  providerId: string;
  model: string | null;
  latencyMs: number;
  inputChars: number;
  errorKind: AiErrorKind | null;
}): Promise<void> {
  const outcome: AiProviderOutcome = input.errorKind ? PROVIDER_OUTCOME_BY_ERROR[input.errorKind] : "SUCCESS";
  try {
    await prisma.aiProviderCall.createMany({
      data: input.capabilities.map((capability) => ({
        userId: input.ownerUserId,
        conversationId: input.conversationId,
        capability,
        provider: input.providerId,
        model: input.model,
        outcome,
        errorKind: input.errorKind,
        latencyMs: input.latencyMs,
        inputChars: input.inputChars,
      })),
    });
  } catch (error) {
    // Telemetry must never break the turn. A lost row is cheaper than a lost
    // assessment, which is the same trade-off the audit trail makes.
    console.error("[ai] provider call telemetry failed", error instanceof Error ? error.name : "unknown error");
  }
}

function titleFrom(statement: string): string {
  const trimmed = statement.trim().replace(/\s+/g, " ");
  return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57)}…`;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * A row-shaped object for an assessment that is deliberately not stored.
 *
 * It exists only so the ephemeral response can be rendered through the same
 * mapper as a stored one — there is no `id` and no `conversationId`, which is
 * what makes the difference visible to the UI instead of implied.
 */
function ephemeralAssessmentRow(input: {
  ownerUserId: string;
  language: string;
  statement: string;
  fields: AssessmentFields;
}): Parameters<typeof assessmentToView>[0] {
  const now = new Date();
  return {
    id: "",
    conversationId: "",
    ownerUserId: input.ownerUserId,
    familyMemberId: null,
    status: "DRAFT",
    language: input.language,
    ageRange: null,
    sexAtBirth: null,
    symptomDuration: null,
    symptomOnset: null,
    historyNotes: null,
    currentMedications: null,
    allergies: null,
    ...input.fields,
    provider: null,
    model: null,
    isDemo: false,
    promptVersion: null,
    safetyPolicyVersion: null,
    escalatedAt: null,
    escalationReason: null,
    emergencyIncidentId: null,
    consentToStoreAt: null,
    consentPolicyVersion: null,
    savedAt: null,
    retentionUntil: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  } as Parameters<typeof assessmentToView>[0];
}

export { EPHEMERAL_NOTICE };
