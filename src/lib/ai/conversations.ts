import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import type { AiAssessment, AiConversation, AiMessage, AiUpload, AiUrgencyBand } from "@prisma/client";

import { AI_CONSENT_POLICY_VERSION, UPLOAD_LIMITS } from "@/lib/ai/capabilities";
import { getAiRetentionPolicy, getShareLinkSecret, retentionDeadline } from "@/lib/ai/config";
import { assessmentToView, uploadToView } from "@/lib/ai/read";
import { createAiSignedUrl, removeAiObject } from "@/lib/ai/storage";
import type { AssessmentView, ConversationSummaryView, MessageView, UploadView } from "@/lib/ai/view";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";

/**
 * The lifecycle of a stored conversation.
 *
 * A conversation is the unit of consent, retention and deletion: removing it
 * removes everything derived from it. Nothing in this module writes a row
 * without a consent record, and nothing reads one without an ownership filter —
 * the same query shape used everywhere else in this codebase, so a guessed id
 * returns `null` rather than somebody else's symptoms.
 */

export type ConversationRef = {
  id: string;
  language: string;
  familyMemberId: string | null;
  consentedAt: Date;
};

export type LifecycleResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

function refuse<T>(status: number, message: string): LifecycleResult<T> {
  return { ok: false, status, message };
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/**
 * Record the user's agreement to store an AI conversation.
 *
 * Written as a `ConsentRecord` rather than as a bare timestamp so the consent
 * has the same shape as every other consent on the platform: revocable, versioned
 * and auditable alongside its IP and user agent.
 */
async function recordStorageConsent(input: { userId: string; policyVersion: string }): Promise<Date> {
  const now = new Date();
  await prisma.consentRecord.create({
    data: {
      userId: input.userId,
      consentType: "AI_ASSESSMENT_STORAGE",
      policyVersion: input.policyVersion,
      granted: true,
      grantedAt: now,
    },
  });
  await recordAuditEvent({
    action: "consent.recorded",
    entityType: "consent",
    entityId: input.userId,
    actorUserId: input.userId,
    metadata: { consentType: "AI_ASSESSMENT_STORAGE", policyVersion: input.policyVersion },
  });
  return now;
}

export async function createConversation(input: {
  ownerUserId: string;
  language: string;
  title?: string | null;
  policyVersion?: string;
  familyMemberId?: string | null;
}): Promise<ConversationRef> {
  const policyVersion = input.policyVersion?.trim() || AI_CONSENT_POLICY_VERSION;
  const consentedAt = await recordStorageConsent({ userId: input.ownerUserId, policyVersion });
  const retention = getAiRetentionPolicy();

  const conversation = await prisma.aiConversation.create({
    data: {
      ownerUserId: input.ownerUserId,
      language: input.language,
      title: input.title?.slice(0, 160) ?? null,
      familyMemberId: input.familyMemberId ?? null,
      consentAcknowledgedAt: consentedAt,
      consentPolicyVersion: policyVersion,
      retentionUntil: retentionDeadline(retention.conversationDays),
    },
    select: { id: true, language: true, familyMemberId: true, consentAcknowledgedAt: true },
  });

  await recordAuditEvent({
    action: "ai.conversation_created",
    entityType: "ai_conversation",
    entityId: conversation.id,
    actorUserId: input.ownerUserId,
    metadata: { language: input.language, policyVersion },
  });

  return {
    id: conversation.id,
    language: conversation.language,
    familyMemberId: conversation.familyMemberId,
    consentedAt: conversation.consentAcknowledgedAt ?? consentedAt,
  };
}

/** Owned, undeleted, and consented to. Anything else reads as absent. */
export async function requireOwnedConversation(input: {
  ownerUserId: string;
  conversationId: string;
}): Promise<AiConversation | null> {
  return prisma.aiConversation.findFirst({
    where: { id: input.conversationId, ownerUserId: input.ownerUserId, deletedAt: null },
  });
}

export async function conversationIsConsented(conversation: AiConversation): Promise<boolean> {
  return conversation.consentAcknowledgedAt !== null;
}

// ---------------------------------------------------------------------------
// Reading a conversation
// ---------------------------------------------------------------------------

export async function listConversations(ownerUserId: string): Promise<ConversationSummaryView[]> {
  const conversations = await prisma.aiConversation.findMany({
    where: { ownerUserId, deletedAt: null, status: { not: "DELETED" } },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      language: true,
      status: true,
      lastMessageAt: true,
      createdAt: true,
      retentionUntil: true,
      assessments: { select: { urgency: true } },
    },
  });

  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title ?? "Untitled assessment",
    language: conversation.language,
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    retentionUntil: conversation.retentionUntil?.toISOString() ?? null,
    assessmentCount: conversation.assessments.length,
    highestUrgency: highestOf(conversation.assessments.map((assessment) => assessment.urgency)),
  }));
}

export async function getConversationThread(input: {
  ownerUserId: string;
  conversationId: string;
}): Promise<{ conversation: ConversationSummaryView; messages: MessageView[] } | null> {
  const conversation = await prisma.aiConversation.findFirst({
    where: { id: input.conversationId, ownerUserId: input.ownerUserId, deletedAt: null },
    select: { id: true, title: true, language: true, status: true, lastMessageAt: true, createdAt: true, retentionUntil: true },
  });
  if (!conversation) return null;

  const [messages, uploads, assessments] = await Promise.all([
    prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, kind: true, content: true, urgency: true, createdAt: true },
    }),
    prisma.aiUpload.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aiAssessment.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const uploadViews = await previewUploads(uploads);
  const uploadsByMessage = new Map<string, UploadView[]>();
  const orphanUploads: UploadView[] = [];
  uploads.forEach((upload, index) => {
    const view = uploadViews[index];
    if (upload.messageId) {
      const list = uploadsByMessage.get(upload.messageId) ?? [];
      list.push(view);
      uploadsByMessage.set(upload.messageId, list);
    } else {
      orphanUploads.push(view);
    }
  });

  // Assessments are linked to the conversation, not to a message, so each one is
  // attributed to the assistant turn that produced it: the latest assistant
  // message at or before the assessment's timestamp.
  const assessmentsByMessage = new Map<string, AssessmentView[]>();
  const assistantMessages = messages.filter((message) => message.role === "ASSISTANT");
  for (const assessment of assessments) {
    const owner = [...assistantMessages].reverse().find((message) => message.createdAt <= assessment.createdAt);
    if (!owner) continue;
    const list = assessmentsByMessage.get(owner.id) ?? [];
    list.push(assessmentToView(assessment));
    assessmentsByMessage.set(owner.id, list);
  }

  const messageViews: MessageView[] = messages.map((message, index) => ({
    id: message.id,
    role: message.role,
    kind: message.kind,
    content: message.content,
    urgency: message.urgency,
    createdAt: message.createdAt.toISOString(),
    assessments: assessmentsByMessage.get(message.id) ?? [],
    uploads: uploadsByMessage.get(message.id) ?? (index === lastUserIndex(messages) ? orphanUploads : []),
  }));

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title ?? "Untitled assessment",
      language: conversation.language,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      createdAt: conversation.createdAt.toISOString(),
      retentionUntil: conversation.retentionUntil?.toISOString() ?? null,
      assessmentCount: assessments.length,
      highestUrgency: highestOf(assessments.map((assessment) => assessment.urgency)),
    },
    messages: messageViews,
  };
}

// ---------------------------------------------------------------------------
// Saving an assessment
// ---------------------------------------------------------------------------

/**
 * Promote a turn's assessment to a saved one.
 *
 * The turn already wrote the row, because a conversation the user agreed to
 * store has to record what the assistant said. Saving is a second, explicit
 * decision: it sets `savedAt`, extends retention from days to the conversation's
 * window, and is what the share action requires.
 */
export async function saveAssessment(input: {
  ownerUserId: string;
  assessmentId: string;
  policyVersion?: string;
}): Promise<LifecycleResult<AssessmentView>> {
  const assessment = await prisma.aiAssessment.findFirst({
    where: { id: input.assessmentId, ownerUserId: input.ownerUserId, deletedAt: null },
  });
  if (!assessment) return refuse(404, "That assessment is not on your account.");

  const retention = getAiRetentionPolicy();
  const saved = await prisma.aiAssessment.update({
    where: { id: assessment.id },
    data: {
      savedAt: assessment.savedAt ?? new Date(),
      consentToStoreAt: assessment.consentToStoreAt ?? new Date(),
      consentPolicyVersion: input.policyVersion?.trim() || AI_CONSENT_POLICY_VERSION,
      status: assessment.status === "DRAFT" ? "SAVED" : assessment.status,
      retentionUntil: retentionDeadline(retention.conversationDays),
    },
  });

  await recordAuditEvent({
    action: "ai.assessment_saved",
    entityType: "ai_assessment",
    entityId: saved.id,
    actorUserId: input.ownerUserId,
    metadata: { urgency: saved.urgency, status: saved.status, conversationId: saved.conversationId },
  });

  return { ok: true, data: assessmentToView(saved) };
}

export async function getAssessment(input: {
  ownerUserId: string;
  assessmentId: string;
}): Promise<AssessmentView | null> {
  const assessment = await prisma.aiAssessment.findFirst({
    where: { id: input.assessmentId, ownerUserId: input.ownerUserId, deletedAt: null },
    include: { uploads: { include: { upload: true } } },
  });
  if (!assessment) return null;
  return assessmentToView(assessment, { mediaObservations: mediaObservations(assessment.uploads.map((link) => link.upload)) });
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

export async function deleteConversation(input: {
  ownerUserId: string;
  conversationId: string;
}): Promise<LifecycleResult<{ removedObjects: number; storageUnavailable: boolean }>> {
  const conversation = await prisma.aiConversation.findFirst({
    where: { id: input.conversationId, ownerUserId: input.ownerUserId },
    select: { id: true, deletedAt: true },
  });
  if (!conversation) return refuse(404, "That conversation is not on your account.");
  if (conversation.deletedAt) return { ok: true, data: { removedObjects: 0, storageUnavailable: false } };

  const uploads = await prisma.aiUpload.findMany({
    where: { conversationId: conversation.id, deletedAt: null },
    select: { id: true, storageKey: true },
  });

  // The bytes go first. A row marked deleted while its file is still readable is
  // not a deletion, and the user asked for one.
  let removedObjects = 0;
  let storageUnavailable = false;
  for (const upload of uploads) {
    const removed = await removeAiObject(upload.storageKey);
    if (removed.ok) removedObjects += 1;
    else if (removed.error.kind === "not_configured") storageUnavailable = true;
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.aiUpload.updateMany({
      where: { conversationId: conversation.id },
      data: { deletedAt: now, status: "DELETED", extractedText: null, mediaSummary: null },
    }),
    prisma.aiAssessment.updateMany({
      where: { conversationId: conversation.id },
      data: { status: "WITHDRAWN", deletedAt: now },
    }),
    prisma.aiAssessmentShare.updateMany({
      where: { assessment: { conversationId: conversation.id }, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    }),
    prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { status: "DELETED", deletedAt: now },
    }),
  ]);

  await recordAuditEvent({
    action: "ai.conversation_deleted",
    entityType: "ai_conversation",
    entityId: conversation.id,
    actorUserId: input.ownerUserId,
    metadata: { uploads: uploads.length, removedObjects, storageUnavailable },
  });
  await recordAuditEvent({
    action: "ai.assessment_deleted",
    entityType: "ai_conversation",
    entityId: conversation.id,
    actorUserId: input.ownerUserId,
    metadata: { cascade: true },
  });

  return { ok: true, data: { removedObjects, storageUnavailable } };
}

// ---------------------------------------------------------------------------
// Clinician share links
// ---------------------------------------------------------------------------

export type CreatedShare = {
  id: string;
  url: string;
  recipientLabel: string;
  expiresAt: string;
};

function hashShareToken(token: string): string | null {
  const secret = getShareLinkSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(token).digest("hex");
}

export async function shareAssessment(input: {
  ownerUserId: string;
  assessmentId: string;
  recipientLabel: string;
  recipientEmail?: string | null;
  policyVersion?: string;
  origin: string;
}): Promise<LifecycleResult<CreatedShare>> {
  const assessment = await prisma.aiAssessment.findFirst({
    where: { id: input.assessmentId, ownerUserId: input.ownerUserId, deletedAt: null },
    select: { id: true, savedAt: true, status: true, conversationId: true },
  });
  if (!assessment) return refuse(404, "That assessment is not on your account.");
  if (assessment.status === "WITHDRAWN") return refuse(409, "That assessment was withdrawn and cannot be shared.");
  if (!assessment.savedAt) return refuse(409, "Save the assessment before sharing it. A share should point at something you have chosen to keep.");

  const secret = getShareLinkSecret();
  if (!secret) {
    return refuse(503, "Clinician share links are not configured on this deployment, so nothing was shared.");
  }

  const policyVersion = input.policyVersion?.trim() || AI_CONSENT_POLICY_VERSION;
  const retention = getAiRetentionPolicy();
  const expiresAt = retentionDeadline(retention.shareLinkDays);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashShareToken(token);
  if (!tokenHash) return refuse(503, "Clinician share links are not configured on this deployment, so nothing was shared.");

  const now = new Date();
  await prisma.consentRecord.create({
    data: {
      userId: input.ownerUserId,
      consentType: "AI_CLINICIAN_SHARE",
      policyVersion,
      granted: true,
      grantedAt: now,
    },
  });

  const share = await prisma.aiAssessmentShare.create({
    data: {
      assessmentId: assessment.id,
      createdById: input.ownerUserId,
      recipientLabel: input.recipientLabel,
      recipientEmail: input.recipientEmail?.trim() || null,
      tokenHash,
      expiresAt,
      consentRecordedAt: now,
      consentPolicyVersion: policyVersion,
    },
    select: { id: true, recipientLabel: true, expiresAt: true },
  });

  await recordAuditEvent({
    action: "ai.assessment_shared",
    entityType: "ai_assessment_share",
    entityId: share.id,
    actorUserId: input.ownerUserId,
    metadata: { assessmentId: assessment.id, recipientLabel: share.recipientLabel, expiresAt: expiresAt.toISOString() },
  });

  return {
    ok: true,
    data: {
      id: share.id,
      url: `${input.origin.replace(/\/+$/, "")}/assistant/shared/${token}`,
      recipientLabel: share.recipientLabel,
      expiresAt: share.expiresAt.toISOString(),
    },
  };
}

export async function revokeShare(input: {
  ownerUserId: string;
  shareId: string;
}): Promise<LifecycleResult<{ revoked: boolean }>> {
  const share = await prisma.aiAssessmentShare.findFirst({
    where: { id: input.shareId, createdById: input.ownerUserId },
    select: { id: true, status: true },
  });
  if (!share) return refuse(404, "That share link is not on your account.");
  if (share.status !== "ACTIVE") return { ok: true, data: { revoked: false } };

  await prisma.aiAssessmentShare.update({
    where: { id: share.id },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  await recordAuditEvent({
    action: "ai.share_revoked",
    entityType: "ai_assessment_share",
    entityId: share.id,
    actorUserId: input.ownerUserId,
  });

  return { ok: true, data: { revoked: true } };
}

/**
 * Open a shared assessment.
 *
 * No session is involved: the bearer token is the whole authority, which is why
 * it is 256 random bits, why only its HMAC is stored, and why it expires. An
 * expired link is marked expired on the way past rather than served.
 */
export async function viewSharedAssessment(token: string): Promise<
  LifecycleResult<{ assessment: AssessmentView; recipientLabel: string; expiresAt: string }>
> {
  const tokenHash = hashShareToken(token);
  if (!tokenHash) return refuse(503, "Share links are not configured on this deployment.");

  const share = await prisma.aiAssessmentShare.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      recipientLabel: true,
      assessment: { include: { uploads: { include: { upload: true } } } },
    },
  });

  if (!share) return refuse(404, "That link is not valid.");
  if (share.status === "REVOKED") return refuse(410, "That link was revoked by the person who created it.");
  if (share.status !== "ACTIVE" || share.expiresAt <= new Date()) {
    if (share.status === "ACTIVE") {
      await prisma.aiAssessmentShare.update({ where: { id: share.id }, data: { status: "EXPIRED" } });
    }
    return refuse(410, "That link has expired.");
  }
  if (share.assessment.status === "WITHDRAWN" || share.assessment.deletedAt) {
    return refuse(410, "That assessment was withdrawn and is no longer available.");
  }

  await prisma.aiAssessmentShare.update({
    where: { id: share.id },
    data: { viewedAt: new Date(), viewCount: { increment: 1 } },
  });
  await recordAuditEvent({
    action: "ai.share_viewed",
    entityType: "ai_assessment_share",
    entityId: share.id,
    metadata: { assessmentId: share.assessment.id },
  });

  return {
    ok: true,
    data: {
      assessment: assessmentToView(share.assessment, {
        mediaObservations: mediaObservations(share.assessment.uploads.map((link) => link.upload)),
      }),
      recipientLabel: share.recipientLabel,
      expiresAt: share.expiresAt.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Clinical review pathway
// ---------------------------------------------------------------------------

export async function requestClinicalReview(input: {
  requestedById: string;
  assessmentId: string;
  requestNotes?: string | null;
  specialty?: string | null;
  automatic?: boolean;
}): Promise<LifecycleResult<{ reviewId: string }>> {
  const assessment = await prisma.aiAssessment.findFirst({
    where: { id: input.assessmentId, deletedAt: null },
    select: { id: true, ownerUserId: true, urgency: true, redFlagCodes: true },
  });
  if (!assessment) return refuse(404, "That assessment could not be found.");

  const existing = await prisma.aiClinicalReview.findFirst({
    where: { assessmentId: assessment.id, status: { in: ["REQUESTED", "IN_REVIEW"] } },
    select: { id: true },
  });
  if (existing) return { ok: true, data: { reviewId: existing.id } };

  const review = await prisma.aiClinicalReview.create({
    data: {
      assessmentId: assessment.id,
      requestedById: input.requestedById,
      requestNotes: input.requestNotes?.trim() || null,
      specialty: input.specialty?.trim() || null,
    },
    select: { id: true },
  });

  await prisma.aiAssessment.update({
    where: { id: assessment.id },
    data: { clinicalReviewRequired: true, status: "AWAITING_REVIEW" },
  });

  await recordAuditEvent({
    action: "ai.review_requested",
    entityType: "ai_clinical_review",
    entityId: review.id,
    actorUserId: input.requestedById,
    metadata: {
      assessmentId: assessment.id,
      urgency: assessment.urgency,
      automatic: input.automatic ?? false,
    },
  });

  return { ok: true, data: { reviewId: review.id } };
}

export async function decideClinicalReview(input: {
  reviewerUserId: string;
  reviewId: string;
  decision: "AGREE" | "RAISE_URGENCY" | "LOWER_URGENCY" | "SEE_CLINICIAN" | "NEEDS_MORE_INFORMATION";
  reviewNotes: string;
  reviewerLabel: string;
}): Promise<LifecycleResult<{ reviewId: string }>> {
  const review = await prisma.aiClinicalReview.findUnique({
    where: { id: input.reviewId },
    select: { id: true, status: true, assessmentId: true },
  });
  if (!review) return refuse(404, "That review could not be found.");
  if (review.status === "CLOSED") return refuse(409, "That review is already closed.");

  const now = new Date();
  await prisma.$transaction([
    prisma.aiClinicalReview.update({
      where: { id: review.id },
      data: {
        status: "CLINICIAN_RESPONDED",
        reviewerUserId: input.reviewerUserId,
        reviewerLabel: input.reviewerLabel,
        reviewNotes: input.reviewNotes,
        decision: input.decision,
        reviewedAt: now,
        startedAt: review.status === "REQUESTED" ? now : undefined,
      },
    }),
    prisma.aiAssessment.update({
      where: { id: review.assessmentId },
      data: { status: "REVIEWED" },
    }),
  ]);

  await recordAuditEvent({
    action: "ai.review_decided",
    entityType: "ai_clinical_review",
    entityId: review.id,
    actorUserId: input.reviewerUserId,
    metadata: { assessmentId: review.assessmentId, decision: input.decision },
  });

  return { ok: true, data: { reviewId: review.id } };
}

export type ReviewQueueItem = {
  reviewId: string;
  assessmentId: string;
  status: string;
  urgency: AiUrgencyBand;
  summary: string;
  language: string;
  redFlagCodes: string[];
  requestedAt: string;
  specialty: string | null;
  /** Deliberately pseudonymous: a reviewer judges the assessment, not the person. */
  reference: string;
};

export async function listClinicalReviewQueue(input: { statuses?: ("REQUESTED" | "IN_REVIEW")[] } = {}): Promise<ReviewQueueItem[]> {
  const reviews = await prisma.aiClinicalReview.findMany({
    where: { status: { in: input.statuses ?? ["REQUESTED", "IN_REVIEW"] } },
    orderBy: { requestedAt: "asc" },
    take: 100,
    select: {
      id: true,
      status: true,
      specialty: true,
      requestedAt: true,
      assessment: {
        select: { id: true, urgency: true, summary: true, language: true, redFlagCodes: true },
      },
    },
  });

  return reviews.map((review) => ({
    reviewId: review.id,
    assessmentId: review.assessment.id,
    status: review.status,
    urgency: review.assessment.urgency,
    summary: review.assessment.summary,
    language: review.assessment.language,
    redFlagCodes: review.assessment.redFlagCodes,
    requestedAt: review.requestedAt.toISOString(),
    specialty: review.specialty,
    reference: review.assessment.id.slice(-8).toUpperCase(),
  }));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function previewUploads(uploads: AiUpload[]): Promise<UploadView[]> {
  const views = await Promise.all(
    uploads.map(async (upload) => {
      if (upload.deletedAt) return uploadToView(upload);
      const previewable = upload.kind === "IMAGE" || (upload.kind === "DOCUMENT" && upload.mimeType === "application/pdf");
      if (!previewable) return uploadToView(upload);
      const signed = await createAiSignedUrl(upload.storageKey, UPLOAD_LIMITS.signedUrlTtlSeconds);
      return uploadToView(upload, signed.ok ? { url: signed.data.url, expiresAt: signed.data.expiresAt } : null);
    }),
  );
  return views;
}

function mediaObservations(uploads: AiUpload[]) {
  return uploads
    .filter((upload) => !upload.deletedAt && upload.mediaSummary)
    .map((upload) => ({ label: upload.fileName, observation: upload.mediaSummary ?? "", confidence: "medium" }));
}

function highestOf(bands: readonly ("SELF_CARE" | "ROUTINE" | "SOON" | "URGENT" | "EMERGENCY")[]) {
  const order = ["SELF_CARE", "ROUTINE", "SOON", "URGENT", "EMERGENCY"] as const;
  let highest: (typeof order)[number] | null = null;
  for (const band of bands) {
    if (!highest || order.indexOf(band) > order.indexOf(highest)) highest = band;
  }
  return highest;
}

function lastUserIndex(messages: readonly Pick<AiMessage, "role">[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "USER") return index;
  }
  return -1;
}

export type { AiAssessment };
