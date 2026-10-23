-- ORVEXA Phase 5 — AI health intelligence and medical media analysis.
--
-- Applied after 0001 (schema) and 0002 (appointment guards). This migration only
-- adds objects: nothing already stored is altered, so it is safe to run against a
-- database that is already serving traffic.
--
-- Two consent types are appended to "ConsentType" so storage of an AI thread and
-- sharing an assessment with a clinician are separate, revocable decisions.

-- AlterEnum
ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'AI_ASSESSMENT_STORAGE';
ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'AI_CLINICIAN_SHARE';

-- CreateEnum
CREATE TYPE "AiConversationStatus" AS ENUM ('OPEN', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AiMessageKind" AS ENUM ('TEXT', 'VOICE_TRANSCRIPT', 'ATTACHMENT', 'CLARIFYING_QUESTION', 'ASSESSMENT', 'SAFETY_NOTICE', 'PROVIDER_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AiUploadKind" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO');

-- CreateEnum
CREATE TYPE "AiUploadStatus" AS ENUM ('PENDING', 'SCANNING', 'READY', 'REJECTED', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "AiMalwareScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiExtractionStatus" AS ENUM ('PENDING', 'EXTRACTED', 'UNSUPPORTED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AiUrgencyBand" AS ENUM ('SELF_CARE', 'ROUTINE', 'SOON', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "AiAssessmentStatus" AS ENUM ('DRAFT', 'SAVED', 'ESCALATED', 'AWAITING_REVIEW', 'REVIEWED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AiClinicalReviewStatus" AS ENUM ('REQUESTED', 'IN_REVIEW', 'CLINICIAN_RESPONDED', 'CLOSED', 'DECLINED');

-- CreateEnum
CREATE TYPE "AiShareStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AiCapability" AS ENUM ('TEXT', 'VISION_IMAGE', 'VIDEO', 'AUDIO_TRANSCRIPTION', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AiProviderOutcome" AS ENUM ('SUCCESS', 'NOT_CONFIGURED', 'UNSUPPORTED_CAPABILITY', 'TIMEOUT', 'RATE_LIMITED', 'PROVIDER_ERROR', 'VALIDATION_ERROR', 'SAFETY_BLOCKED');

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "title" TEXT,
    "status" "AiConversationStatus" NOT NULL DEFAULT 'OPEN',
    "language" TEXT NOT NULL DEFAULT 'en',
    "consentAcknowledgedAt" TIMESTAMP(3),
    "consentPolicyVersion" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "kind" "AiMessageKind" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "language" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "capabilities" "AiCapability"[] DEFAULT ARRAY[]::"AiCapability"[],
    "redFlagCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "urgency" "AiUrgencyBand",
    "medicationRefused" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUpload" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "kind" "AiUploadKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "status" "AiUploadStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScan" "AiMalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScanDetail" TEXT,
    "extraction" "AiExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "extractionNotes" TEXT,
    "mediaSummary" TEXT,
    "rejectionReason" TEXT,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAssessment" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "status" "AiAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "language" TEXT NOT NULL DEFAULT 'en',
    "ageRange" TEXT,
    "sexAtBirth" TEXT,
    "symptomDuration" TEXT,
    "symptomOnset" TEXT,
    "historyNotes" TEXT,
    "currentMedications" TEXT,
    "allergies" TEXT,
    "summary" TEXT NOT NULL,
    "possibleCauses" JSONB,
    "warningSigns" JSONB,
    "recommendedSteps" JSONB,
    "clarifyingQuestions" JSONB,
    "selfCareGuidance" TEXT,
    "uncertaintyNotes" TEXT,
    "limitationsNotice" TEXT NOT NULL,
    "urgency" "AiUrgencyBand" NOT NULL,
    "urgencyRationale" TEXT,
    "redFlagCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medicationRefused" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "model" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "promptVersion" TEXT,
    "safetyPolicyVersion" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "escalationReason" TEXT,
    "emergencyIncidentId" TEXT,
    "clinicalReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "consentToStoreAt" TIMESTAMP(3),
    "consentPolicyVersion" TEXT,
    "savedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAssessmentUpload" (
    "assessmentId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAssessmentUpload_pkey" PRIMARY KEY ("assessmentId","uploadId")
);

-- CreateTable
CREATE TABLE "AiClinicalReview" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "status" "AiClinicalReviewStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "reviewerLabel" TEXT,
    "specialty" TEXT,
    "requestNotes" TEXT,
    "reviewNotes" TEXT,
    "decision" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AiClinicalReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAssessmentShare" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "recipientLabel" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" "AiShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "consentRecordedAt" TIMESTAMP(3) NOT NULL,
    "consentPolicyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAssessmentShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProviderCall" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "conversationId" TEXT,
    "capability" "AiCapability" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "outcome" "AiProviderOutcome" NOT NULL,
    "errorKind" TEXT,
    "latencyMs" INTEGER,
    "inputChars" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiProviderCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiConversation_ownerUserId_updatedAt_idx" ON "AiConversation"("ownerUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiConversation_status_retentionUntil_idx" ON "AiConversation"("status", "retentionUntil");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiUpload_storageKey_key" ON "AiUpload"("storageKey");

-- CreateIndex
CREATE INDEX "AiUpload_conversationId_createdAt_idx" ON "AiUpload"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUpload_ownerUserId_createdAt_idx" ON "AiUpload"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUpload_status_retentionUntil_idx" ON "AiUpload"("status", "retentionUntil");

-- CreateIndex
CREATE INDEX "AiAssessment_ownerUserId_createdAt_idx" ON "AiAssessment"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAssessment_status_urgency_idx" ON "AiAssessment"("status", "urgency");

-- CreateIndex
CREATE INDEX "AiAssessment_retentionUntil_idx" ON "AiAssessment"("retentionUntil");

-- CreateIndex
CREATE INDEX "AiAssessmentUpload_uploadId_idx" ON "AiAssessmentUpload"("uploadId");

-- CreateIndex
CREATE INDEX "AiClinicalReview_assessmentId_status_idx" ON "AiClinicalReview"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "AiClinicalReview_status_requestedAt_idx" ON "AiClinicalReview"("status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiAssessmentShare_tokenHash_key" ON "AiAssessmentShare"("tokenHash");

-- CreateIndex
CREATE INDEX "AiAssessmentShare_assessmentId_status_idx" ON "AiAssessmentShare"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "AiAssessmentShare_expiresAt_idx" ON "AiAssessmentShare"("expiresAt");

-- CreateIndex
CREATE INDEX "AiProviderCall_provider_createdAt_idx" ON "AiProviderCall"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "AiProviderCall_outcome_createdAt_idx" ON "AiProviderCall"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "AiProviderCall_capability_createdAt_idx" ON "AiProviderCall"("capability", "createdAt");

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUpload" ADD CONSTRAINT "AiUpload_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUpload" ADD CONSTRAINT "AiUpload_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUpload" ADD CONSTRAINT "AiUpload_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssessment" ADD CONSTRAINT "AiAssessment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssessment" ADD CONSTRAINT "AiAssessment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssessment" ADD CONSTRAINT "AiAssessment_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssessment" ADD CONSTRAINT "AiAssessment_emergencyIncidentId_fkey" FOREIGN KEY ("emergencyIncidentId") REFERENCES "EmergencyIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssessmentUpload" ADD CONSTRAINT "AiAssessmentUpload_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AiAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssessmentUpload" ADD CONSTRAINT "AiAssessmentUpload_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "AiUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiClinicalReview" ADD CONSTRAINT "AiClinicalReview_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AiAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiClinicalReview" ADD CONSTRAINT "AiClinicalReview_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiClinicalReview" ADD CONSTRAINT "AiClinicalReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssessmentShare" ADD CONSTRAINT "AiAssessmentShare_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AiAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssessmentShare" ADD CONSTRAINT "AiAssessmentShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProviderCall" ADD CONSTRAINT "AiProviderCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProviderCall" ADD CONSTRAINT "AiProviderCall_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
