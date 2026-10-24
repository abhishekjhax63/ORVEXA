-- ORVEXA Phase 8 — diagnostic testing, laboratory reports and telemedicine.
--
-- Applied after 0001 (schema), 0002 (appointment guards), 0003 (AI health
-- intelligence) and 0004 (pharmacy and insurance). This migration is additive:
-- no existing column, index or row is altered or dropped, so it is safe to run
-- against a database already serving traffic.
--
-- Three things this migration deliberately does NOT do:
--
--   1. It seeds no laboratory, no test, no price and no report. A laboratory
--      becomes bookable only after a platform administrator verifies it, and a
--      report only exists once a laboratory wrote one.
--   2. It adds no column that lets the platform author a clinical result.
--      `LabReport.authenticatedByName`/`authenticatedByRegistration`, entered by
--      the laboratory, are required before a report can be published, and the
--      writer refuses to publish without them.
--   3. It creates no video room. `TeleconsultationSession` starts SCHEDULED with
--      `providerConfirmed = false`; only a response from the configured video
--      provider may set that flag, and `isSandbox` records a rehearsal session
--      so it can never be mistaken for a real consultation.
--
-- Three consent types are appended to "ConsentType" so that collecting a sample,
-- handing a report to a clinician and opening a video consultation are separate
-- revocable decisions rather than side effects of booking something.

-- CreateEnum
CREATE TYPE "DiagnosticSampleType" AS ENUM ('BLOOD', 'URINE', 'STOOL', 'SALIVA', 'SWAB', 'TISSUE', 'IMAGING', 'OTHER');

-- CreateEnum
CREATE TYPE "DiagnosticBookingMode" AS ENUM ('WALK_IN', 'HOME_COLLECTION');

-- CreateEnum
CREATE TYPE "DiagnosticBookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'SAMPLE_COLLECTED', 'PROCESSING', 'REPORT_READY', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "DiagnosticBookingEventType" AS ENUM ('REQUESTED', 'CONFIRMED', 'REJECTED', 'RESCHEDULED', 'CANCELLED', 'SAMPLE_COLLECTED', 'PROCESSING_STARTED', 'REPORT_PUBLISHED', 'COMPLETED', 'NO_SHOW', 'NOTE');

-- CreateEnum
CREATE TYPE "LabReportStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'AMENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LabReportDocumentKind" AS ENUM ('REPORT', 'SCAN', 'AMENDMENT');

-- CreateEnum
CREATE TYPE "LabReportDocumentStatus" AS ENUM ('PENDING', 'READY', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "LabResultFlag" AS ENUM ('NORMAL', 'HIGH', 'LOW', 'CRITICAL_HIGH', 'CRITICAL_LOW', 'ABNORMAL', 'INCONCLUSIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LabReportAccessAction" AS ENUM ('UPLOADED', 'PUBLISHED', 'VIEWED', 'DOWNLOADED', 'LINK_ISSUED', 'AMENDED', 'WITHDRAWN', 'SHARED', 'SHARE_REVOKED');

-- CreateEnum
CREATE TYPE "VideoProviderKind" AS ENUM ('DAILY', 'SANDBOX');

-- CreateEnum
CREATE TYPE "TeleconsultationStatus" AS ENUM ('SCHEDULED', 'READY', 'ACTIVE', 'ENDED', 'EXPIRED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TeleconsultationEventType" AS ENUM ('CREATED', 'ROOM_CONFIRMED', 'ROOM_FAILED', 'JOIN_LINK_ISSUED', 'WAITING_ROOM_ENTERED', 'PATIENT_JOINED', 'CLINICIAN_JOINED', 'RECONNECTED', 'DISCONNECTED', 'ENDED', 'EXPIRED', 'CANCELLED', 'NOTE');

-- CreateEnum
CREATE TYPE "ConsultationNoteStatus" AS ENUM ('DRAFT', 'FINALIZED', 'AMENDED');

-- CreateEnum
CREATE TYPE "ConsultationMessageKind" AS ENUM ('TEXT', 'SYSTEM', 'INSTRUCTION', 'ATTACHMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'DIAGNOSTIC_SAMPLE_COLLECTION';
ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'DIAGNOSTIC_REPORT_SHARING';
ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'TELEMEDICINE_CONSULTATION_CONSENT';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "followUpOfAppointmentId" TEXT;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "appointmentId" TEXT;

-- CreateTable
CREATE TABLE "LabPartnerProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "facilityId" TEXT,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "accreditationNumber" TEXT,
    "accreditationBody" TEXT,
    "accreditationExpiresAt" TIMESTAMP(3),
    "registrationNumber" TEXT,
    "gstin" TEXT,
    "pathologistName" TEXT,
    "pathologistRegistrationNumber" TEXT,
    "pathologistCouncil" TEXT,
    "canPublishReports" BOOLEAN NOT NULL DEFAULT false,
    "acceptsHomeCollection" BOOLEAN NOT NULL DEFAULT false,
    "homeCollectionRadiusKm" INTEGER,
    "coverageCities" TEXT[],
    "coveragePostalCodes" TEXT[],
    "sampleCollectionFeeInr" INTEGER,
    "standardTurnaroundHours" INTEGER,
    "complianceAcknowledgedAt" TIMESTAMP(3),
    "compliancePolicyVersion" TEXT,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabPartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticTest" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "categoryId" TEXT,
    "categorySlug" TEXT NOT NULL,
    "description" TEXT,
    "purposeSummary" TEXT,
    "preparationInstructions" TEXT,
    "preparationRequired" BOOLEAN NOT NULL DEFAULT false,
    "fastingRequired" BOOLEAN NOT NULL DEFAULT false,
    "fastingHours" INTEGER,
    "sampleTypes" "DiagnosticSampleType"[],
    "method" TEXT,
    "standardTurnaroundHours" INTEGER,
    "homeCollectionSupported" BOOLEAN NOT NULL DEFAULT false,
    "pediatricSafe" BOOLEAN,
    "riskNotes" TEXT,
    "isPanel" BOOLEAN NOT NULL DEFAULT false,
    "panelComponents" TEXT[],
    "listable" BOOLEAN NOT NULL DEFAULT true,
    "nonListableReason" TEXT,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DiagnosticTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticTestOffer" (
    "id" TEXT NOT NULL,
    "labProfileId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "priceInr" INTEGER NOT NULL,
    "homeCollectionFeeInr" INTEGER,
    "turnaroundHours" INTEGER,
    "homeCollectionAvailable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticTestOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticBooking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "labProfileId" TEXT NOT NULL,
    "facilityId" TEXT,
    "mode" "DiagnosticBookingMode" NOT NULL,
    "status" "DiagnosticBookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3),
    "collectionContactName" TEXT,
    "collectionPhone" TEXT,
    "collectionAddressId" TEXT,
    "collectionAddressText" TEXT,
    "collectionCity" TEXT,
    "collectionPostalCode" TEXT,
    "testsSubtotalInr" INTEGER NOT NULL DEFAULT 0,
    "homeCollectionFeeInr" INTEGER NOT NULL DEFAULT 0,
    "estimatedTotalInr" INTEGER NOT NULL DEFAULT 0,
    "patientNotes" TEXT,
    "cancellationReason" TEXT,
    "cancelledById" TEXT,
    "cancelledByRole" "CancelledBy",
    "cancelledAt" TIMESTAMP(3),
    "rescheduledFromId" TEXT,
    "consentAcknowledgedAt" TIMESTAMP(3),
    "consentPolicyVersion" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "sampleCollectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticBookingItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "testId" TEXT,
    "offerId" TEXT,
    "testNameSnapshot" TEXT NOT NULL,
    "priceInr" INTEGER NOT NULL,
    "homeCollectionFeeInr" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticBookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticBookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "DiagnosticBookingEventType" NOT NULL,
    "fromStatus" "DiagnosticBookingStatus",
    "toStatus" "DiagnosticBookingStatus",
    "actorUserId" TEXT,
    "actorRole" "Role",
    "actorLabel" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticBookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReport" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "labProfileId" TEXT NOT NULL,
    "status" "LabReportStatus" NOT NULL DEFAULT 'DRAFT',
    "authenticatedByName" TEXT,
    "authenticatedByRegistration" TEXT,
    "authenticatedById" TEXT,
    "authenticatedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "publishedByLabel" TEXT,
    "publishedAt" TIMESTAMP(3),
    "sampleCollectedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "interpretation" TEXT,
    "amendedFromId" TEXT,
    "amendmentReason" TEXT,
    "withdrawnReason" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReportDocument" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "kind" "LabReportDocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "status" "LabReportDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScan" "AiMalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScanDetail" TEXT,
    "rejectionReason" TEXT,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabReportDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReportResult" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "testId" TEXT,
    "analyteName" TEXT NOT NULL,
    "value" TEXT,
    "unit" TEXT,
    "referenceRange" TEXT,
    "flag" "LabResultFlag" NOT NULL DEFAULT 'UNKNOWN',
    "method" TEXT,
    "comment" TEXT,
    "enteredById" TEXT,
    "enteredByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabReportResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReportAccessLog" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "action" "LabReportAccessAction" NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "Role",
    "actorLabel" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabReportAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReportShare" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sharedByUserId" TEXT NOT NULL,
    "sharedWithUserId" TEXT,
    "sharedWithEmail" TEXT,
    "sharedWithLabel" TEXT,
    "canDownload" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabReportShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeleconsultationSession" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "provider" "VideoProviderKind" NOT NULL,
    "providerRoomId" TEXT,
    "roomUrl" TEXT,
    "status" "TeleconsultationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "patientTokenHash" TEXT NOT NULL,
    "clinicianTokenHash" TEXT NOT NULL,
    "patientTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "clinicianTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "roomExpiresAt" TIMESTAMP(3) NOT NULL,
    "patientJoinedAt" TIMESTAMP(3),
    "clinicianJoinedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastProviderEventAt" TIMESTAMP(3),
    "reconnectionCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "providerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeleconsultationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeleconsultationEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "TeleconsultationEventType" NOT NULL,
    "fromStatus" "TeleconsultationStatus",
    "toStatus" "TeleconsultationStatus",
    "actorUserId" TEXT,
    "actorRole" "Role",
    "actorLabel" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeleconsultationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoProviderEvent" (
    "provider" "VideoProviderKind" NOT NULL,
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationNote" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorLabel" TEXT,
    "authorRole" "Role",
    "status" "ConsultationNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "diagnosisSummary" TEXT,
    "followUpInstructions" TEXT,
    "followUpAfterDays" INTEGER,
    "postConsultationInstructions" TEXT,
    "finalizedById" TEXT,
    "finalizedByLabel" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "amendedFromId" TEXT,
    "amendmentReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationMessage" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "senderUserId" TEXT,
    "senderRole" "Role",
    "senderLabel" TEXT,
    "kind" "ConsultationMessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL,
    "attachmentKey" TEXT,
    "attachmentName" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabPartnerProfile_ownerUserId_key" ON "LabPartnerProfile"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LabPartnerProfile_facilityId_key" ON "LabPartnerProfile"("facilityId");

-- CreateIndex
CREATE INDEX "LabPartnerProfile_verificationStatus_status_idx" ON "LabPartnerProfile"("verificationStatus", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticCategory_slug_key" ON "DiagnosticCategory"("slug");

-- CreateIndex
CREATE INDEX "DiagnosticCategory_isActive_sortOrder_idx" ON "DiagnosticCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticTest_slug_key" ON "DiagnosticTest"("slug");

-- CreateIndex
CREATE INDEX "DiagnosticTest_categorySlug_listable_idx" ON "DiagnosticTest"("categorySlug", "listable");

-- CreateIndex
CREATE INDEX "DiagnosticTest_name_idx" ON "DiagnosticTest"("name");

-- CreateIndex
CREATE INDEX "DiagnosticTestOffer_testId_isActive_idx" ON "DiagnosticTestOffer"("testId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticTestOffer_labProfileId_testId_key" ON "DiagnosticTestOffer"("labProfileId", "testId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticBooking_reference_key" ON "DiagnosticBooking"("reference");

-- CreateIndex
CREATE INDEX "DiagnosticBooking_patientUserId_scheduledAt_idx" ON "DiagnosticBooking"("patientUserId", "scheduledAt");

-- CreateIndex
CREATE INDEX "DiagnosticBooking_labProfileId_scheduledAt_idx" ON "DiagnosticBooking"("labProfileId", "scheduledAt");

-- CreateIndex
CREATE INDEX "DiagnosticBooking_status_scheduledAt_idx" ON "DiagnosticBooking"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticBooking_createdById_idempotencyKey_key" ON "DiagnosticBooking"("createdById", "idempotencyKey");

-- CreateIndex
CREATE INDEX "DiagnosticBookingItem_bookingId_idx" ON "DiagnosticBookingItem"("bookingId");

-- CreateIndex
CREATE INDEX "DiagnosticBookingItem_testId_idx" ON "DiagnosticBookingItem"("testId");

-- CreateIndex
CREATE INDEX "DiagnosticBookingEvent_bookingId_createdAt_idx" ON "DiagnosticBookingEvent"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LabReport_reference_key" ON "LabReport"("reference");

-- CreateIndex
CREATE INDEX "LabReport_labProfileId_status_idx" ON "LabReport"("labProfileId", "status");

-- CreateIndex
CREATE INDEX "LabReport_bookingId_status_idx" ON "LabReport"("bookingId", "status");

-- CreateIndex
CREATE INDEX "LabReport_status_publishedAt_idx" ON "LabReport"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LabReportDocument_storageKey_key" ON "LabReportDocument"("storageKey");

-- CreateIndex
CREATE INDEX "LabReportDocument_reportId_createdAt_idx" ON "LabReportDocument"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "LabReportDocument_status_retentionUntil_idx" ON "LabReportDocument"("status", "retentionUntil");

-- CreateIndex
CREATE INDEX "LabReportResult_reportId_idx" ON "LabReportResult"("reportId");

-- CreateIndex
CREATE INDEX "LabReportAccessLog_reportId_createdAt_idx" ON "LabReportAccessLog"("reportId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LabReportShare_tokenHash_key" ON "LabReportShare"("tokenHash");

-- CreateIndex
CREATE INDEX "LabReportShare_reportId_createdAt_idx" ON "LabReportShare"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "LabReportShare_sharedWithUserId_idx" ON "LabReportShare"("sharedWithUserId");

-- CreateIndex
CREATE INDEX "LabReportShare_expiresAt_idx" ON "LabReportShare"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeleconsultationSession_appointmentId_key" ON "TeleconsultationSession"("appointmentId");

-- CreateIndex
CREATE INDEX "TeleconsultationSession_status_roomExpiresAt_idx" ON "TeleconsultationSession"("status", "roomExpiresAt");

-- CreateIndex
CREATE INDEX "TeleconsultationEvent_sessionId_createdAt_idx" ON "TeleconsultationEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoProviderEvent_providerEventId_key" ON "VideoProviderEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "VideoProviderEvent_sessionId_createdAt_idx" ON "VideoProviderEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoProviderEvent_type_createdAt_idx" ON "VideoProviderEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ConsultationNote_appointmentId_status_idx" ON "ConsultationNote"("appointmentId", "status");

-- CreateIndex
CREATE INDEX "ConsultationNote_doctorProfileId_status_idx" ON "ConsultationNote"("doctorProfileId", "status");

-- CreateIndex
CREATE INDEX "ConsultationNote_status_createdAt_idx" ON "ConsultationNote"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ConsultationMessage_appointmentId_createdAt_idx" ON "ConsultationMessage"("appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "Appointment_followUpOfAppointmentId_idx" ON "Appointment"("followUpOfAppointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_createdById_idempotencyKey_key" ON "Appointment"("createdById", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Prescription_appointmentId_idx" ON "Prescription"("appointmentId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_followUpOfAppointmentId_fkey" FOREIGN KEY ("followUpOfAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabPartnerProfile" ADD CONSTRAINT "LabPartnerProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabPartnerProfile" ADD CONSTRAINT "LabPartnerProfile_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "PartnerFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticTest" ADD CONSTRAINT "DiagnosticTest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DiagnosticCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticTestOffer" ADD CONSTRAINT "DiagnosticTestOffer_labProfileId_fkey" FOREIGN KEY ("labProfileId") REFERENCES "LabPartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticTestOffer" ADD CONSTRAINT "DiagnosticTestOffer_testId_fkey" FOREIGN KEY ("testId") REFERENCES "DiagnosticTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticBooking" ADD CONSTRAINT "DiagnosticBooking_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticBooking" ADD CONSTRAINT "DiagnosticBooking_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticBooking" ADD CONSTRAINT "DiagnosticBooking_labProfileId_fkey" FOREIGN KEY ("labProfileId") REFERENCES "LabPartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticBooking" ADD CONSTRAINT "DiagnosticBooking_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "PartnerFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticBooking" ADD CONSTRAINT "DiagnosticBooking_collectionAddressId_fkey" FOREIGN KEY ("collectionAddressId") REFERENCES "PatientAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticBookingItem" ADD CONSTRAINT "DiagnosticBookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "DiagnosticBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticBookingItem" ADD CONSTRAINT "DiagnosticBookingItem_testId_fkey" FOREIGN KEY ("testId") REFERENCES "DiagnosticTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticBookingItem" ADD CONSTRAINT "DiagnosticBookingItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "DiagnosticTestOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticBookingEvent" ADD CONSTRAINT "DiagnosticBookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "DiagnosticBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "DiagnosticBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_labProfileId_fkey" FOREIGN KEY ("labProfileId") REFERENCES "LabPartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportDocument" ADD CONSTRAINT "LabReportDocument_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "LabReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportResult" ADD CONSTRAINT "LabReportResult_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "LabReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportResult" ADD CONSTRAINT "LabReportResult_testId_fkey" FOREIGN KEY ("testId") REFERENCES "DiagnosticTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportAccessLog" ADD CONSTRAINT "LabReportAccessLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "LabReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportShare" ADD CONSTRAINT "LabReportShare_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "LabReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportShare" ADD CONSTRAINT "LabReportShare_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportShare" ADD CONSTRAINT "LabReportShare_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeleconsultationSession" ADD CONSTRAINT "TeleconsultationSession_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeleconsultationEvent" ADD CONSTRAINT "TeleconsultationEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TeleconsultationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationMessage" ADD CONSTRAINT "ConsultationMessage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

