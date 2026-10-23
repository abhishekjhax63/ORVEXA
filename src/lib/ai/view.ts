import type { AiCapability, AiExtractionStatus, AiMalwareScanStatus, AiUrgencyBand } from "@prisma/client";

import { AI_URGENCY_COPY, aiLanguageLabel } from "@/lib/ai/capabilities";
import type { AiErrorKind } from "@/lib/ai/provider";

/**
 * The shapes the AI workspace renders.
 *
 * Client-safe on purpose: the workspace is a Client Component and needs the same
 * view model the API returns, so the two can never disagree about what an
 * assessment contains. Only types and pure lookups live here; everything that
 * touches the database or a provider stays on the server.
 */

export type AssessmentCauseView = { label: string; note: string; likelihood: string };
export type AssessmentWarningView = { label: string; detail: string };
export type AssessmentStepView = { title: string; detail: string; timeframe: string };
export type AssessmentQuestionView = { question: string; why: string };
export type AssessmentMediaView = { label: string; observation: string; confidence: string };

export type RedFlagView = {
  code: string;
  label: string;
  rationale: string;
  /** Where it was found, e.g. "your description: “…chest pain…”". */
  evidence: string;
};

export type WithheldUploadView = { fileName: string; reason: string };

export type AssessmentView = {
  /** Null when nothing was stored, which is the case without storage consent. */
  id: string | null;
  conversationId: string | null;
  language: string;
  languageLabel: string;

  summary: string;
  possibleCauses: AssessmentCauseView[];
  warningSigns: AssessmentWarningView[];
  recommendedSteps: AssessmentStepView[];
  clarifyingQuestions: AssessmentQuestionView[];
  selfCareGuidance: string | null;
  uncertaintyNotes: string;
  mediaObservations: AssessmentMediaView[];

  urgency: AiUrgencyBand;
  urgencyLabel: string;
  urgencyTone: "success" | "neutral" | "warning" | "emergency";
  urgencySummary: string;
  urgencyAction: string;
  /** What the model proposed. Shown when it differs from `urgency`. */
  modelUrgency: AiUrgencyBand | null;
  overrideReason: string | null;

  redFlags: RedFlagView[];
  medicationRefused: boolean;
  /** Always rendered. Stored with the assessment so the wording cannot drift. */
  limitationsNotice: string;
  safetyLine: string | null;

  /** Files that were attached but deliberately not analysed, and why. */
  withheld: WithheldUploadView[];

  provider: string | null;
  model: string | null;
  /** True when this text came from the fixed rules rather than from a model. */
  isDegraded: boolean;
  promptVersion: string | null;
  safetyPolicyVersion: string | null;

  status: "DRAFT" | "SAVED" | "ESCALATED" | "AWAITING_REVIEW" | "REVIEWED" | "WITHDRAWN";
  savedAt: string | null;
  retentionUntil: string | null;
  clinicalReviewRequired: boolean;

  /** Whether the workspace should surface emergency care and nearby hospitals. */
  emergencyRecommended: boolean;
  followUp: boolean;
};

export type UploadView = {
  id: string;
  kind: "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  malwareScan: AiMalwareScanStatus;
  malwareScanDetail: string | null;
  extraction: AiExtractionStatus;
  extractionNotes: string | null;
  previewUrl: string | null;
  previewExpiresAt: string | null;
  transcript: string | null;
  retentionUntil: string | null;
};

export type MessageView = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  kind: string;
  content: string;
  urgency: AiUrgencyBand | null;
  createdAt: string;
  assessments: AssessmentView[];
  uploads: UploadView[];
};

export type ConversationSummaryView = {
  id: string;
  title: string;
  language: string;
  status: "OPEN" | "ARCHIVED" | "DELETED";
  lastMessageAt: string | null;
  createdAt: string;
  retentionUntil: string | null;
  assessmentCount: number;
  /** The most urgent band recorded in the thread, so history can flag it. */
  highestUrgency: AiUrgencyBand | null;
};

/**
 * What the workspace shows when the assistant cannot run.
 *
 * This is a first-class state, not an error toast: with no provider configured
 * there is no assistant, and the honest thing to display is that fact rather
 * than an empty chat box that looks like it is thinking.
 */
export type UnavailableStateView = {
  kind: AiErrorKind;
  message: string;
  /** Capabilities this deployment can and cannot offer, for the honesty panel. */
  available: AiCapability[];
  unavailable: { capability: AiCapability; reason: string }[];
  providerLabel: string;
};

export type TurnResponse = {
  assessment: AssessmentView;
  conversationId: string | null;
  /** True when nothing was written to the database. */
  ephemeral: boolean;
};

export function urgencyPresentation(band: AiUrgencyBand) {
  const copy = AI_URGENCY_COPY[band];
  return { label: copy.label, tone: copy.tone, summary: copy.summary, action: copy.action };
}

export function languageLabel(code: string) {
  return aiLanguageLabel(code);
}

/**
 * The band a thread is flagged with.
 *
 * Uses the same ordering as the safety layer so a list of conversations can be
 * sorted by the worst thing in them without importing the safety core.
 */
export const URGENCY_ORDER: readonly AiUrgencyBand[] = ["SELF_CARE", "ROUTINE", "SOON", "URGENT", "EMERGENCY"];

export function higherUrgency(a: AiUrgencyBand | null, b: AiUrgencyBand | null): AiUrgencyBand | null {
  if (!a) return b;
  if (!b) return a;
  return URGENCY_ORDER.indexOf(a) >= URGENCY_ORDER.indexOf(b) ? a : b;
}
