import type { AiAssessment, AiUpload, AiUrgencyBand } from "@prisma/client";

import { aiLanguageLabel } from "@/lib/ai/capabilities";
import { RED_FLAGS, safetyLineFor, urgencyRank, type RedFlagHit } from "@/lib/ai/safety";
import {
  urgencyPresentation,
  type AssessmentCauseView,
  type AssessmentMediaView,
  type AssessmentQuestionView,
  type AssessmentStepView,
  type AssessmentView,
  type AssessmentWarningView,
  type RedFlagView,
  type UploadView,
} from "@/lib/ai/view";

/**
 * Row-to-view mapping.
 *
 * Pure and server-safe: it reads a stored row and produces the exact shape the
 * workspace renders, so the live turn response and the history page can never
 * describe the same assessment differently.
 *
 * Two details are honest by construction rather than by convention:
 *
 *  - A red flag is stored as its code. The label and rationale are looked up
 *    from the lexicon, but the *evidence* — the phrase the user actually wrote —
 *    is only available while the turn is being processed, so a stored
 *    assessment reports it as empty rather than inventing one.
 *  - Media observations are stored on the upload (`mediaSummary`), not on the
 *    assessment, so a withdrawn file cannot leave an observation behind that
 *    nothing refers to.
 */

export type AssessmentViewExtras = {
  /** The model's own band, known only while the turn is live. */
  modelUrgency?: AiUrgencyBand | null;
  mediaObservations?: AssessmentMediaView[];
  /** Files that were attached but deliberately not analysed. */
  withheld?: { fileName: string; reason: string }[];
  followUp?: boolean;
  /** The live red flags, which still carry the phrase that matched. */
  redFlags?: RedFlagView[];
  /** Overrides the recomputed line when the turn that produced this is in hand. */
  safetyLine?: string | null;
};

export function uploadToView(upload: AiUpload, signed?: { url: string; expiresAt: Date } | null): UploadView {
  return {
    id: upload.id,
    kind: upload.kind,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    sizeBytes: upload.sizeBytes,
    malwareScan: upload.malwareScan,
    malwareScanDetail: upload.malwareScanDetail,
    extraction: upload.extraction,
    extractionNotes: upload.extractionNotes,
    previewUrl: signed?.url ?? null,
    previewExpiresAt: signed?.expiresAt.toISOString() ?? null,
    transcript: upload.kind === "AUDIO" ? upload.extractedText : null,
    retentionUntil: upload.retentionUntil?.toISOString() ?? null,
  };
}

export function assessmentToView(assessment: AiAssessment, extras: AssessmentViewExtras = {}): AssessmentView {
  const presentation = urgencyPresentation(assessment.urgency);
  const redFlags = extras.redFlags ?? redFlagsFromCodes(assessment.redFlagCodes);
  const modelUrgency = extras.modelUrgency ?? null;

  return {
    id: assessment.id,
    conversationId: assessment.conversationId,
    language: assessment.language,
    languageLabel: aiLanguageLabel(assessment.language),

    summary: assessment.summary,
    possibleCauses: asArray<AssessmentCauseView>(assessment.possibleCauses),
    warningSigns: asArray<AssessmentWarningView>(assessment.warningSigns),
    recommendedSteps: asArray<AssessmentStepView>(assessment.recommendedSteps),
    clarifyingQuestions: asArray<AssessmentQuestionView>(assessment.clarifyingQuestions),
    selfCareGuidance: assessment.selfCareGuidance,
    uncertaintyNotes: assessment.uncertaintyNotes ?? "",
    mediaObservations: extras.mediaObservations ?? [],

    urgency: assessment.urgency,
    urgencyLabel: presentation.label,
    urgencyTone: presentation.tone,
    urgencySummary: presentation.summary,
    urgencyAction: presentation.action,
    modelUrgency: modelUrgency && modelUrgency !== assessment.urgency ? modelUrgency : null,
    overrideReason: assessment.escalationReason,

    redFlags,
    medicationRefused: assessment.medicationRefused,
    limitationsNotice: assessment.limitationsNotice,
    safetyLine:
      extras.safetyLine !== undefined
        ? extras.safetyLine
        : safetyLineFor({
            urgency: assessment.urgency,
            language: assessment.language,
            redFlagCount: assessment.redFlagCodes.length,
          }),

    withheld: (extras.withheld ?? []).map((item) => ({ fileName: item.fileName, reason: item.reason })),

    provider: assessment.provider,
    model: assessment.model,
    isDegraded: assessment.provider === null,
    promptVersion: assessment.promptVersion,
    safetyPolicyVersion: assessment.safetyPolicyVersion,

    status: assessment.status,
    savedAt: assessment.savedAt?.toISOString() ?? null,
    retentionUntil: assessment.retentionUntil?.toISOString() ?? null,
    clinicalReviewRequired: assessment.clinicalReviewRequired,

    emergencyRecommended: redFlags.length > 0 || urgencyRank(assessment.urgency) >= urgencyRank("URGENT"),
    followUp: extras.followUp ?? false,
  };
}

/**
 * Rebuild a red flag from its stored code.
 *
 * A code with no lexicon entry is skipped rather than shown as a blank banner:
 * an unknown code cannot be explained to a user, and the escalation it produced
 * is already recorded on the assessment's urgency.
 */
export function redFlagsFromCodes(codes: readonly string[]): RedFlagView[] {
  const byCode = new Map(RED_FLAGS.map((flag) => [flag.code, flag]));
  const views: RedFlagView[] = [];
  for (const code of codes) {
    const flag = byCode.get(code);
    if (!flag) continue;
    views.push({ code: flag.code, label: flag.label, rationale: flag.rationale, evidence: "" });
  }
  return views;
}

/** The live form of the same shape, where the matched phrase is still in hand. */
export function redFlagsToView(hits: readonly RedFlagHit[]): RedFlagView[] {
  return hits.map((hit) => ({ code: hit.code, label: hit.label, rationale: hit.rationale, evidence: hit.evidence }));
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
