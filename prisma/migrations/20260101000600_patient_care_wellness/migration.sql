-- ORVEXA Phase 10 — advanced patient care and wellness ecosystem.
--
-- Additive migration: it adds the patient/family, preventive-health, wellness,
-- device and additional-service tables and nothing else. No existing column,
-- index or row is dropped, and no existing table other than "User" is altered
-- (only to add back-relations, which are not columns).
--
-- Three rules shape this schema:
--
-- 1. Provenance is a column, not a guess. Every health value carries a "source"
--    of type "HealthRecordSource", so user-entered, device-imported,
--    partner-reported and clinician-recorded values are distinguishable in the
--    database rather than in the UI. "WellnessEntry"."verifiedById" stays null
--    until a named clinician confirms a reading.
--
-- 2. There is no wellness score column anywhere. "WellnessEntry" stores a value
--    and a unit and nothing derived from them, because a rolled-up wellness
--    number would be read as a clinical finding.
--
-- 3. Family access is a record, not a flag. "CaregiverAccess" is a reviewable,
--    revocable row owned by the person whose record it is, and its "scopes"
--    array is the only thing that grants a caregiver anything.
--
-- Note on naming: the care reminders in this migration use "CareReminderStatus"
-- and "CareReminderChannel" because the earlier appointment reminder queue
-- ("AppointmentReminder") already owns "ReminderStatus" and "ReminderChannel"
-- with a different lifecycle.

-- ---------------------------------------------------------------------------
-- Existing enums extended with two further consent types.
--
-- Both are held by the person whose record it is. Family access and an imported
-- measurement are the two things in this phase that write about somebody with
-- data they did not type themselves, so each needs its own consent rather than
-- riding on a general one. Appended at the end of the enum, so the ordinal
-- values already stored in "ConsentRecord" are untouched.
-- ---------------------------------------------------------------------------
ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'CAREGIVER_HEALTH_ACCESS';
ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'HEALTH_DEVICE_DATA_IMPORT';

-- CreateEnum
CREATE TYPE "HealthRecordSource" AS ENUM ('USER_ENTERED', 'DEVICE_IMPORTED', 'CLINICIAN_RECORDED', 'PARTNER_REPORTED', 'DOCUMENT_UPLOADED');

-- CreateEnum
CREATE TYPE "CaregiverAccessStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CaregiverScope" AS ENUM ('VIEW_PROFILE', 'BOOK_APPOINTMENTS', 'VIEW_RECORDS', 'MANAGE_MEDICATIONS', 'MANAGE_REMINDERS', 'UPLOAD_DOCUMENTS', 'MANAGE_WELLNESS');

-- CreateEnum
CREATE TYPE "HealthDocumentKind" AS ENUM ('LAB_REPORT', 'IMAGING_REPORT', 'PRESCRIPTION', 'DISCHARGE_SUMMARY', 'CONSULTATION_NOTE', 'VACCINATION_CERTIFICATE', 'INSURANCE_POLICY', 'INSURANCE_CLAIM', 'INVOICE', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "HealthDocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'REMOVED');

-- CreateEnum
CREATE TYPE "HealthTimelineEventKind" AS ENUM ('APPOINTMENT', 'TELECONSULTATION', 'ADMISSION', 'DISCHARGE', 'LAB_REPORT', 'IMAGING', 'PRESCRIPTION_ISSUED', 'MEDICATION_STARTED', 'MEDICATION_STOPPED', 'VACCINATION', 'SCREENING', 'ALLERGY_RECORDED', 'DIAGNOSIS_RECORDED', 'DOCUMENT_ADDED', 'DEVICE_IMPORT', 'CARE_PROGRAM_ENROLLED', 'WELLNESS_GOAL_SET', 'SUPPORT_TICKET', 'OTHER');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MedicalHistoryCategory" AS ENUM ('CONDITION', 'SURGERY', 'HOSPITALISATION', 'FAMILY_HISTORY', 'LIFESTYLE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('MEDICATION', 'VACCINATION', 'SCREENING', 'APPOINTMENT', 'PREVENTIVE_CHECKUP', 'FOLLOW_UP', 'WELLNESS', 'MATERNAL', 'CHILD', 'SENIOR_CARE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReminderScheduleKind" AS ENUM ('ONE_OFF', 'DAILY', 'WEEKLY', 'MONTHLY', 'INTERVAL');

-- CreateEnum
CREATE TYPE "CareReminderStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CareReminderChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH');

-- CreateEnum
CREATE TYPE "ReminderDispatchOutcome" AS ENUM ('QUEUED', 'SENT', 'SUPPRESSED_DUPLICATE', 'SUPPRESSED_QUIET_HOURS', 'SUPPRESSED_CHANNEL_DISABLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PreventiveCareKind" AS ENUM ('VACCINATION', 'SCREENING', 'PREVENTIVE_CHECKUP', 'DENTAL', 'VISION', 'MENTAL_WELLNESS');

-- CreateEnum
CREATE TYPE "PreventiveCareStatus" AS ENUM ('PLANNED', 'DUE', 'COMPLETED', 'OVERDUE', 'DECLINED');

-- CreateEnum
CREATE TYPE "CareProgramKind" AS ENUM ('MATERNAL', 'CHILD', 'SENIOR', 'CHRONIC_CONDITION', 'REHABILITATION');

-- CreateEnum
CREATE TYPE "CareProgramStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MedicationScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'STOPPED');

-- CreateEnum
CREATE TYPE "MedicationDoseStatus" AS ENUM ('SCHEDULED', 'TAKEN', 'TAKEN_LATE', 'SKIPPED', 'MISSED');

-- CreateEnum
CREATE TYPE "WellnessCategory" AS ENUM ('NUTRITION', 'ACTIVITY', 'SLEEP', 'MOOD', 'WEIGHT', 'BLOOD_PRESSURE', 'BLOOD_GLUCOSE', 'HYDRATION', 'PAIN', 'OTHER');

-- CreateEnum
CREATE TYPE "WellnessUnit" AS ENUM ('KCAL', 'GRAM', 'MILLILITRE', 'MINUTE', 'HOUR', 'STEP', 'COUNT', 'KILOGRAM', 'CENTIMETRE', 'MMHG', 'MG_DL', 'SELF_REPORT_SCALE', 'NONE');

-- CreateEnum
CREATE TYPE "WellnessGoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WellnessGoalCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "HealthDeviceProvider" AS ENUM ('MANUAL_UPLOAD', 'APPLE_HEALTH', 'GOOGLE_FIT', 'FITBIT', 'GARMIN', 'SAMSUNG_HEALTH', 'WITHINGS', 'OMROM', 'OTHER');

-- CreateEnum
CREATE TYPE "HealthDeviceIntegrationMode" AS ENUM ('NOT_CONFIGURED', 'FILE_IMPORT', 'PARTNER_API');

-- CreateEnum
CREATE TYPE "HealthDeviceConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR', 'REVOKED');

-- CreateEnum
CREATE TYPE "HealthDeviceSyncStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "CareServiceCategory" AS ENUM ('PHYSIOTHERAPY', 'REHABILITATION', 'HOME_NURSING', 'HOME_HEALTHCARE', 'HOME_SAMPLE_COLLECTION', 'MENTAL_WELLNESS', 'NUTRITION_COUNSELLING', 'ELDER_CARE', 'POST_SURGICAL_CARE', 'OTHER');

-- CreateEnum
CREATE TYPE "CareServiceDeliveryMode" AS ENUM ('AT_FACILITY', 'AT_HOME', 'ONLINE');

-- CreateEnum
CREATE TYPE "CareServiceRequestStatus" AS ENUM ('REQUESTED', 'ACKNOWLEDGED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DECLINED');

-- CreateEnum
CREATE TYPE "MentalWellnessResourceKind" AS ENUM ('ARTICLE', 'GUIDE', 'HELPLINE', 'SELF_ASSESSMENT', 'GUIDED_EXERCISE', 'VIDEO');

-- CreateEnum
CREATE TYPE "EducationResourceCategory" AS ENUM ('GENERAL_HEALTH', 'MATERNAL_HEALTH', 'CHILD_HEALTH', 'SENIOR_HEALTH', 'NUTRITION', 'MENTAL_HEALTH', 'CHRONIC_CONDITION', 'MEDICATION_SAFETY', 'EMERGENCY_AWARENESS');

-- CreateEnum
CREATE TYPE "SupportedLanguage" AS ENUM ('ENGLISH', 'HINDI', 'KANNADA', 'TAMIL', 'TELUGU', 'MALAYALAM', 'MARATHI', 'BENGALI', 'GUJARATI', 'ODIA', 'PUNJABI', 'ASSAMESE', 'URDU');

-- CreateEnum
CREATE TYPE "ServiceFeedbackSubject" AS ENUM ('APPOINTMENT', 'TELECONSULTATION', 'LAB_BOOKING', 'PHARMACY_ORDER', 'CARE_SERVICE', 'HOSPITAL_VISIT', 'PLATFORM');

-- CreateEnum
CREATE TYPE "ServiceFeedbackStatus" AS ENUM ('SUBMITTED', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SupportTicketCategory" AS ENUM ('BOOKING_ISSUE', 'PAYMENT_ISSUE', 'PRESCRIPTION_ISSUE', 'REPORT_ISSUE', 'ACCOUNT_ACCESS', 'PRIVACY_REQUEST', 'CAREGIVER_ACCESS', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportTicketSeverity" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_PATIENT', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "CaregiverAccess" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "caregiverUserId" TEXT,
    "invitedEmail" TEXT,
    "relationship" "FamilyRelationship" NOT NULL,
    "status" "CaregiverAccessStatus" NOT NULL DEFAULT 'INVITED',
    "scopes" "CaregiverScope"[],
    "consentRecordId" TEXT,
    "note" TEXT,
    "invitedById" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaregiverAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthDocument" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "kind" "HealthDocumentKind" NOT NULL,
    "status" "HealthDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "source" "HealthRecordSource" NOT NULL DEFAULT 'DOCUMENT_UPLOADED',
    "issuedByLabel" TEXT,
    "issuedOn" TIMESTAMP(3),
    "isSensitive" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTimelineEvent" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "kind" "HealthTimelineEventKind" NOT NULL,
    "source" "HealthRecordSource" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "documentId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllergyRecord" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" "AllergySeverity" NOT NULL DEFAULT 'UNKNOWN',
    "source" "HealthRecordSource" NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "recordedById" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllergyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImmunizationRecord" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "vaccineName" TEXT NOT NULL,
    "doseLabel" TEXT,
    "administeredOn" TIMESTAMP(3) NOT NULL,
    "administeredByLabel" TEXT,
    "facilityLabel" TEXT,
    "batchNumber" TEXT,
    "source" "HealthRecordSource" NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "documentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImmunizationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalHistoryItem" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "category" "MedicalHistoryCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "details" TEXT,
    "onsetOn" TIMESTAMP(3),
    "resolvedOn" TIMESTAMP(3),
    "source" "HealthRecordSource" NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalHistoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "channels" "CareReminderChannel"[] DEFAULT ARRAY['IN_APP']::"CareReminderChannel"[],
    "quietHoursStartMinute" INTEGER,
    "quietHoursEndMinute" INTEGER,
    "defaultLeadMinutes" INTEGER NOT NULL DEFAULT 15,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "kind" "ReminderKind" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "scheduleKind" "ReminderScheduleKind" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "localMinuteOfDay" INTEGER,
    "daysOfWeek" INTEGER[],
    "intervalMinutes" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "lastFiredAt" TIMESTAMP(3),
    "status" "CareReminderStatus" NOT NULL DEFAULT 'ACTIVE',
    "channel" "CareReminderChannel" NOT NULL DEFAULT 'IN_APP',
    "dedupeKey" TEXT,
    "preventiveCarePlanId" TEXT,
    "medicationScheduleId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDispatch" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "channel" "CareReminderChannel" NOT NULL,
    "outcome" "ReminderDispatchOutcome" NOT NULL DEFAULT 'QUEUED',
    "localTimeLabel" TEXT,
    "detail" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventiveCarePlan" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "kind" "PreventiveCareKind" NOT NULL,
    "status" "PreventiveCareStatus" NOT NULL DEFAULT 'PLANNED',
    "title" TEXT NOT NULL,
    "guidanceSourceLabel" TEXT NOT NULL,
    "guidanceNote" TEXT,
    "dueOn" TIMESTAMP(3),
    "completedOn" TIMESTAMP(3),
    "completedRefType" TEXT,
    "completedRefId" TEXT,
    "reminderId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventiveCarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareProgramEnrollment" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "kind" "CareProgramKind" NOT NULL,
    "status" "CareProgramStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "coordinatorLabel" TEXT,
    "enrolledOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedOn" TIMESTAMP(3),
    "details" JSONB,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareProgramEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationSchedule" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "prescriptionId" TEXT,
    "hospitalPrescriptionId" TEXT,
    "medicineName" TEXT NOT NULL,
    "strengthLabel" TEXT,
    "dosageForm" TEXT,
    "doseLabel" TEXT NOT NULL,
    "frequencyLabel" TEXT NOT NULL,
    "localTimesOfDay" INTEGER[],
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "startOn" TIMESTAMP(3) NOT NULL,
    "endOn" TIMESTAMP(3),
    "instructions" TEXT,
    "prescriberLabel" TEXT,
    "source" "HealthRecordSource" NOT NULL,
    "status" "MedicationScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "stoppedReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationDoseLog" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "MedicationDoseStatus" NOT NULL DEFAULT 'SCHEDULED',
    "takenAt" TIMESTAMP(3),
    "actualDoseLabel" TEXT,
    "recordedById" TEXT,
    "source" "HealthRecordSource" NOT NULL DEFAULT 'USER_ENTERED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationDoseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessEntry" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "category" "WellnessCategory" NOT NULL,
    "unit" "WellnessUnit" NOT NULL DEFAULT 'NONE',
    "valueNumeric" DECIMAL(12,3),
    "valueText" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "source" "HealthRecordSource" NOT NULL,
    "deviceConnectionId" TEXT,
    "deviceSyncRecordId" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellnessEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessGoal" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "category" "WellnessCategory" NOT NULL,
    "unit" "WellnessUnit" NOT NULL,
    "targetValue" DECIMAL(12,3) NOT NULL,
    "cadence" "WellnessGoalCadence" NOT NULL DEFAULT 'DAILY',
    "title" TEXT NOT NULL,
    "status" "WellnessGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "startOn" TIMESTAMP(3) NOT NULL,
    "endOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthDeviceConnection" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "provider" "HealthDeviceProvider" NOT NULL,
    "integrationMode" "HealthDeviceIntegrationMode" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "status" "HealthDeviceConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "externalAccountLabel" TEXT,
    "scopes" TEXT[],
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthDeviceConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthDeviceSyncRecord" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" "HealthDeviceSyncStatus" NOT NULL DEFAULT 'STARTED',
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "measurementsImported" INTEGER NOT NULL DEFAULT 0,
    "measurementsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "categories" "WellnessCategory"[],

    CONSTRAINT "HealthDeviceSyncRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareServiceListing" (
    "id" TEXT NOT NULL,
    "category" "CareServiceCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "deliveryMode" "CareServiceDeliveryMode" NOT NULL,
    "priceFromPaise" INTEGER,
    "city" TEXT,
    "serviceAreas" TEXT[],
    "providerLabel" TEXT NOT NULL,
    "partnerProfileId" TEXT,
    "languagesOffered" "SupportedLanguage"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareServiceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareServiceRequest" (
    "id" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "listingId" TEXT NOT NULL,
    "status" "CareServiceRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "preferredAt" TIMESTAMP(3),
    "addressLine" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "providerResponse" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentalWellnessResource" (
    "id" TEXT NOT NULL,
    "kind" "MentalWellnessResourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "bodyMarkdown" TEXT,
    "language" "SupportedLanguage" NOT NULL DEFAULT 'ENGLISH',
    "helplineNumber" TEXT,
    "helplineHours" TEXT,
    "externalUrl" TEXT,
    "isCrisisResource" BOOLEAN NOT NULL DEFAULT false,
    "reviewedByLabel" TEXT,
    "publishedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentalWellnessResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthEducationResource" (
    "id" TEXT NOT NULL,
    "category" "EducationResourceCategory" NOT NULL,
    "language" "SupportedLanguage" NOT NULL DEFAULT 'ENGLISH',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "readingMinutes" INTEGER,
    "reviewedByLabel" TEXT NOT NULL,
    "reviewedOn" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthEducationResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceFeedback" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "subject" "ServiceFeedbackSubject" NOT NULL,
    "subjectRefId" TEXT,
    "rating" INTEGER,
    "comment" TEXT,
    "status" "ServiceFeedbackStatus" NOT NULL DEFAULT 'SUBMITTED',
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "raisedByUserId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "category" "SupportTicketCategory" NOT NULL,
    "severity" "SupportTicketSeverity" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedToLabel" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorLabel" TEXT,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaregiverAccess_caregiverUserId_status_idx" ON "CaregiverAccess"("caregiverUserId", "status");

-- CreateIndex
CREATE INDEX "CaregiverAccess_ownerUserId_status_idx" ON "CaregiverAccess"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "CaregiverAccess_expiresAt_idx" ON "CaregiverAccess"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaregiverAccess_ownerUserId_caregiverUserId_key" ON "CaregiverAccess"("ownerUserId", "caregiverUserId");

-- CreateIndex
CREATE INDEX "HealthDocument_ownerUserId_status_createdAt_idx" ON "HealthDocument"("ownerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "HealthDocument_ownerUserId_kind_idx" ON "HealthDocument"("ownerUserId", "kind");

-- CreateIndex
CREATE INDEX "HealthDocument_familyMemberId_idx" ON "HealthDocument"("familyMemberId");

-- CreateIndex
CREATE INDEX "HealthTimelineEvent_ownerUserId_occurredAt_idx" ON "HealthTimelineEvent"("ownerUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "HealthTimelineEvent_ownerUserId_kind_occurredAt_idx" ON "HealthTimelineEvent"("ownerUserId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "HealthTimelineEvent_refType_refId_idx" ON "HealthTimelineEvent"("refType", "refId");

-- CreateIndex
CREATE INDEX "AllergyRecord_ownerUserId_isActive_idx" ON "AllergyRecord"("ownerUserId", "isActive");

-- CreateIndex
CREATE INDEX "AllergyRecord_familyMemberId_idx" ON "AllergyRecord"("familyMemberId");

-- CreateIndex
CREATE INDEX "ImmunizationRecord_ownerUserId_administeredOn_idx" ON "ImmunizationRecord"("ownerUserId", "administeredOn");

-- CreateIndex
CREATE INDEX "ImmunizationRecord_familyMemberId_idx" ON "ImmunizationRecord"("familyMemberId");

-- CreateIndex
CREATE INDEX "MedicalHistoryItem_ownerUserId_category_idx" ON "MedicalHistoryItem"("ownerUserId", "category");

-- CreateIndex
CREATE INDEX "MedicalHistoryItem_familyMemberId_idx" ON "MedicalHistoryItem"("familyMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderPreference_userId_key" ON "ReminderPreference"("userId");

-- CreateIndex
CREATE INDEX "Reminder_status_nextDueAt_idx" ON "Reminder"("status", "nextDueAt");

-- CreateIndex
CREATE INDEX "Reminder_ownerUserId_status_idx" ON "Reminder"("ownerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_ownerUserId_dedupeKey_key" ON "Reminder"("ownerUserId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ReminderDispatch_reminderId_attemptedAt_idx" ON "ReminderDispatch"("reminderId", "attemptedAt");

-- CreateIndex
CREATE INDEX "ReminderDispatch_outcome_attemptedAt_idx" ON "ReminderDispatch"("outcome", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDispatch_reminderId_scheduledFor_key" ON "ReminderDispatch"("reminderId", "scheduledFor");

-- CreateIndex
CREATE INDEX "PreventiveCarePlan_ownerUserId_status_dueOn_idx" ON "PreventiveCarePlan"("ownerUserId", "status", "dueOn");

-- CreateIndex
CREATE INDEX "PreventiveCarePlan_familyMemberId_idx" ON "PreventiveCarePlan"("familyMemberId");

-- CreateIndex
CREATE INDEX "CareProgramEnrollment_ownerUserId_status_idx" ON "CareProgramEnrollment"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "CareProgramEnrollment_familyMemberId_idx" ON "CareProgramEnrollment"("familyMemberId");

-- CreateIndex
CREATE INDEX "MedicationSchedule_ownerUserId_status_idx" ON "MedicationSchedule"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "MedicationSchedule_familyMemberId_idx" ON "MedicationSchedule"("familyMemberId");

-- CreateIndex
CREATE INDEX "MedicationDoseLog_scheduleId_status_idx" ON "MedicationDoseLog"("scheduleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationDoseLog_scheduleId_scheduledFor_key" ON "MedicationDoseLog"("scheduleId", "scheduledFor");

-- CreateIndex
CREATE INDEX "WellnessEntry_ownerUserId_category_recordedAt_idx" ON "WellnessEntry"("ownerUserId", "category", "recordedAt");

-- CreateIndex
CREATE INDEX "WellnessEntry_ownerUserId_recordedAt_idx" ON "WellnessEntry"("ownerUserId", "recordedAt");

-- CreateIndex
CREATE INDEX "WellnessEntry_deviceSyncRecordId_idx" ON "WellnessEntry"("deviceSyncRecordId");

-- CreateIndex
CREATE INDEX "WellnessEntry_familyMemberId_idx" ON "WellnessEntry"("familyMemberId");

-- CreateIndex
CREATE INDEX "WellnessGoal_ownerUserId_status_idx" ON "WellnessGoal"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "HealthDeviceConnection_ownerUserId_status_idx" ON "HealthDeviceConnection"("ownerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthDeviceConnection_ownerUserId_provider_key" ON "HealthDeviceConnection"("ownerUserId", "provider");

-- CreateIndex
CREATE INDEX "HealthDeviceSyncRecord_connectionId_startedAt_idx" ON "HealthDeviceSyncRecord"("connectionId", "startedAt");

-- CreateIndex
CREATE INDEX "HealthDeviceSyncRecord_status_startedAt_idx" ON "HealthDeviceSyncRecord"("status", "startedAt");

-- CreateIndex
CREATE INDEX "CareServiceListing_category_isActive_idx" ON "CareServiceListing"("category", "isActive");

-- CreateIndex
CREATE INDEX "CareServiceListing_city_category_idx" ON "CareServiceListing"("city", "category");

-- CreateIndex
CREATE INDEX "CareServiceRequest_requesterUserId_status_createdAt_idx" ON "CareServiceRequest"("requesterUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CareServiceRequest_listingId_status_idx" ON "CareServiceRequest"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CareServiceRequest_requesterUserId_idempotencyKey_key" ON "CareServiceRequest"("requesterUserId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MentalWellnessResource_kind_language_isActive_idx" ON "MentalWellnessResource"("kind", "language", "isActive");

-- CreateIndex
CREATE INDEX "MentalWellnessResource_isCrisisResource_isActive_idx" ON "MentalWellnessResource"("isCrisisResource", "isActive");

-- CreateIndex
CREATE INDEX "HealthEducationResource_category_language_isActive_idx" ON "HealthEducationResource"("category", "language", "isActive");

-- CreateIndex
CREATE INDEX "ServiceFeedback_authorUserId_createdAt_idx" ON "ServiceFeedback"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceFeedback_subject_status_idx" ON "ServiceFeedback"("subject", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_reference_key" ON "SupportTicket"("reference");

-- CreateIndex
CREATE INDEX "SupportTicket_raisedByUserId_status_createdAt_idx" ON "SupportTicket"("raisedByUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_severity_createdAt_idx" ON "SupportTicket"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaregiverAccess" ADD CONSTRAINT "CaregiverAccess_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAccess" ADD CONSTRAINT "CaregiverAccess_caregiverUserId_fkey" FOREIGN KEY ("caregiverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthDocument" ADD CONSTRAINT "HealthDocument_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTimelineEvent" ADD CONSTRAINT "HealthTimelineEvent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllergyRecord" ADD CONSTRAINT "AllergyRecord_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImmunizationRecord" ADD CONSTRAINT "ImmunizationRecord_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistoryItem" ADD CONSTRAINT "MedicalHistoryItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderPreference" ADD CONSTRAINT "ReminderPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDispatch" ADD CONSTRAINT "ReminderDispatch_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveCarePlan" ADD CONSTRAINT "PreventiveCarePlan_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgramEnrollment" ADD CONSTRAINT "CareProgramEnrollment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDoseLog" ADD CONSTRAINT "MedicationDoseLog_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MedicationSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDoseLog" ADD CONSTRAINT "MedicationDoseLog_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessEntry" ADD CONSTRAINT "WellnessEntry_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessGoal" ADD CONSTRAINT "WellnessGoal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthDeviceConnection" ADD CONSTRAINT "HealthDeviceConnection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthDeviceSyncRecord" ADD CONSTRAINT "HealthDeviceSyncRecord_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "HealthDeviceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareServiceRequest" ADD CONSTRAINT "CareServiceRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFeedback" ADD CONSTRAINT "ServiceFeedback_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- Guard constraints. Prisma's schema language cannot express these, so they are
-- written by hand. Each one encodes a rule the service layer also enforces; the
-- constraint exists so that a bug or a manual UPDATE cannot produce a row the
-- application would then have to defend against.
-- ===========================================================================

-- A revoked caregiver grant must say when it was revoked. Without this, a row
-- could sit in REVOKED with no revocation timestamp and the "reviewed and
-- revoked" trail the person is shown would be unprovable.
ALTER TABLE "CaregiverAccess"
  ADD CONSTRAINT "CaregiverAccess_revoked_stamp"
  CHECK ("status" <> 'REVOKED' OR "revokedAt" IS NOT NULL);

-- An active grant must name a caregiver account. An ACTIVE row with no
-- caregiver would be access granted to nobody in particular, and the scope check
-- has nothing to check against.
ALTER TABLE "CaregiverAccess"
  ADD CONSTRAINT "CaregiverAccess_active_has_caregiver"
  CHECK ("status" <> 'ACTIVE' OR "caregiverUserId" IS NOT NULL);

-- Document vault metadata must describe a real object. A zero or negative byte
-- count means the upload never landed, and a blank mime type means the vault
-- cannot decide how to serve it.
ALTER TABLE "HealthDocument"
  ADD CONSTRAINT "HealthDocument_size_positive" CHECK ("sizeBytes" > 0);

-- Wellness values are measurements, so a negative count of steps, minutes or
-- millilitres is a data-entry fault rather than a finding. Zero stays legal.
ALTER TABLE "WellnessEntry"
  ADD CONSTRAINT "WellnessEntry_value_nonnegative"
  CHECK ("valueNumeric" IS NULL OR "valueNumeric" >= 0);

-- An entry with neither a number nor a label records nothing and is not worth
-- storing; the service rejects it and this makes the rejection structural.
ALTER TABLE "WellnessEntry"
  ADD CONSTRAINT "WellnessEntry_has_value"
  CHECK ("valueNumeric" IS NOT NULL OR "valueText" IS NOT NULL);

-- A clinician verification is a paired fact: who and when, or neither. A
-- verifiedAt with no verifiedById is an anonymous clinical opinion, which this
-- platform does not produce.
ALTER TABLE "WellnessEntry"
  ADD CONSTRAINT "WellnessEntry_verification_paired"
  CHECK (("verifiedById" IS NULL) = ("verifiedAt" IS NULL));

-- A target of zero or less is not a goal.
ALTER TABLE "WellnessGoal"
  ADD CONSTRAINT "WellnessGoal_target_positive" CHECK ("targetValue" > 0);

-- Reminder timing. Minutes past local midnight is the unit everywhere, so it
-- has to be inside a single day; an interval must be a positive number of
-- minutes; and days-of-week must only ever contain Sunday(0) to Saturday(6).
ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_local_minute_in_day"
  CHECK ("localMinuteOfDay" IS NULL OR ("localMinuteOfDay" >= 0 AND "localMinuteOfDay" < 1440));

ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_interval_positive"
  CHECK ("intervalMinutes" IS NULL OR "intervalMinutes" > 0);

ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_days_of_week_valid"
  CHECK ("daysOfWeek" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]);

-- Quiet hours are the same unit and the same single-day bound, and must be set
-- as a pair: a window with only one end is not a window. The paired `=` test is
-- used rather than two separate `IS NULL` checks because a CHECK only fails on
-- an outright FALSE, so a NULL result would silently let the bad row through.
-- Equal start and end is allowed and means "no quiet window" rather than a
-- 24-hour silence.
ALTER TABLE "ReminderPreference"
  ADD CONSTRAINT "ReminderPreference_quiet_hours_valid"
  CHECK (
    ("quietHoursStartMinute" IS NULL) = ("quietHoursEndMinute" IS NULL)
    AND (
      "quietHoursStartMinute" IS NULL
      OR (
        "quietHoursStartMinute" BETWEEN 0 AND 1439
        AND "quietHoursEndMinute" BETWEEN 0 AND 1439
      )
    )
  );

-- A dose schedule records the times of day it is taken. Every entry is minutes
-- past local midnight, and an empty list would mean a schedule that never fires.
-- `cardinality` is used rather than `array_length` because `array_length` returns
-- NULL for an empty array, and a CHECK that evaluates to NULL passes.
ALTER TABLE "MedicationSchedule"
  ADD CONSTRAINT "MedicationSchedule_times_of_day_valid"
  CHECK (cardinality("localTimesOfDay") >= 1);

ALTER TABLE "MedicationSchedule"
  ADD CONSTRAINT "MedicationSchedule_end_after_start"
  CHECK ("endOn" IS NULL OR "endOn" >= "startOn");

-- Device sync counters are counts of readings. A negative figure would break
-- every "imported N, skipped M" summary the vault shows.
ALTER TABLE "HealthDeviceSyncRecord"
  ADD CONSTRAINT "HealthDeviceSyncRecord_counts_sane"
  CHECK ("measurementsImported" >= 0 AND "measurementsSkipped" >= 0);

-- A support ticket reference is how a person quotes their case on a phone call,
-- so it must not be blank.
ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_reference_present" CHECK (length(btrim("reference")) > 0);


