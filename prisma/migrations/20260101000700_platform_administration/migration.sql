-- ORVEXA Phase 11 — platform administration, analytics and security hardening.
--
-- Additive migration: it adds the platform-operation tables and nothing else.
-- No existing column, index or row is dropped, and no existing table is altered.
--
-- Four rules shape this schema:
--
-- 1. Configuration is a row with an author. "Which regions are supported", "is
--    online pharmacy live" and "how long is an audit row kept" are editable by a
--    named administrator, and "PlatformSetting"."updatedById" records who last
--    changed each one. Nothing here is read from a request.
--
-- 2. The safe state is the default state. A "FeatureFlag" defaults to
--    "enabled = false" with a 0% rollout, so creating the table cannot switch a
--    half-built feature on for everybody.
--
-- 3. Alerts deduplicate. "IntegrationAlert" carries a "fingerprint", and the
--    service reuses the open row rather than inserting a row per failure, so a
--    flapping provider produces one alert with an occurrence count instead of a
--    thousand unread pages.
--
-- 4. Retention and deletion are recorded facts. "RetentionPolicy" carries when a
--    data class was last pruned and how many rows went, and
--    "AccountDeletionRequest" carries the schedule, the actor and the outcome,
--    because "we deleted their account" is a claim the platform may have to
--    evidence.

-- CreateEnum
CREATE TYPE "PlatformSettingCategory" AS ENUM ('SERVICE_CATALOGUE', 'REGIONS', 'NOTIFICATIONS', 'SECURITY', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "PlatformStaffRole" AS ENUM ('PLATFORM_ADMIN', 'VERIFICATION_HOSPITAL', 'VERIFICATION_DOCTOR', 'VERIFICATION_PHARMACY', 'VERIFICATION_LABORATORY', 'VERIFICATION_AMBULANCE', 'VERIFICATION_INSURER', 'SUPPORT_AGENT', 'EMERGENCY_OPERATOR', 'SECURITY_ANALYST');

-- CreateEnum
CREATE TYPE "PlatformStaffStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "IntegrationAlertKind" AS ENUM ('SECURITY', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "IntegrationAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IntegrationAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AccountDeletionStatus" AS ENUM ('REQUESTED', 'CANCELLED', 'COMPLETED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ReportExportStatus" AS ENUM ('QUEUED', 'READY', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "PlatformStaffMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PlatformStaffRole" NOT NULL,
    "status" "PlatformStaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformStaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" "PlatformSettingCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
    "environments" TEXT[] DEFAULT ARRAY['development']::TEXT[],
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationAlert" (
    "id" TEXT NOT NULL,
    "kind" "IntegrationAlertKind" NOT NULL,
    "severity" "IntegrationAlertSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "IntegrationAlertStatus" NOT NULL DEFAULT 'OPEN',
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "IntegrationAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "dataClass" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "description" TEXT,
    "lastPurgedAt" TIMESTAMP(3),
    "lastPurgedCount" INTEGER,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "processedById" TEXT,
    "retentionHoldUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportExport" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedByLabel" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'csv',
    "filters" JSONB,
    "containsPersonalData" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReportExportStatus" NOT NULL DEFAULT 'QUEUED',
    "rowCount" INTEGER,
    "fileKey" TEXT,
    "checksum" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ReportExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalMetric" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformStaffMember_role_status_idx" ON "PlatformStaffMember"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformStaffMember_userId_role_key" ON "PlatformStaffMember"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");

-- CreateIndex
CREATE INDEX "PlatformSetting_category_idx" ON "PlatformSetting"("category");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE INDEX "FeatureFlag_enabled_idx" ON "FeatureFlag"("enabled");

-- CreateIndex
CREATE INDEX "IntegrationAlert_status_severity_lastSeenAt_idx" ON "IntegrationAlert"("status", "severity", "lastSeenAt");

-- CreateIndex
CREATE INDEX "IntegrationAlert_fingerprint_status_idx" ON "IntegrationAlert"("fingerprint", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_dataClass_key" ON "RetentionPolicy"("dataClass");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_status_scheduledFor_idx" ON "AccountDeletionRequest"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_userId_idx" ON "AccountDeletionRequest"("userId");

-- CreateIndex
CREATE INDEX "ReportExport_requestedById_createdAt_idx" ON "ReportExport"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "ReportExport_status_expiresAt_idx" ON "ReportExport"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "OperationalMetric_metricKey_recordedAt_idx" ON "OperationalMetric"("metricKey", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalMetric_metricKey_windowFrom_windowTo_key" ON "OperationalMetric"("metricKey", "windowFrom", "windowTo");

-- AddForeignKey
ALTER TABLE "PlatformStaffMember" ADD CONSTRAINT "PlatformStaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformStaffMember" ADD CONSTRAINT "PlatformStaffMember_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSetting" ADD CONSTRAINT "PlatformSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationAlert" ADD CONSTRAINT "IntegrationAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

-- A rollout is a percentage. A value outside 0..100 would make the bucketing
-- comparison meaningless rather than merely wrong, so it is refused at the
-- table rather than trusted from a form.
ALTER TABLE "FeatureFlag"
  ADD CONSTRAINT "FeatureFlag_rollout_percent_range"
  CHECK ("rolloutPercent" >= 0 AND "rolloutPercent" <= 100);

-- A flag with no environment applies nowhere, which is indistinguishable from a
-- flag that is switched off. Refusing the empty list keeps "why is my flag not
-- live?" answerable from the row.
ALTER TABLE "FeatureFlag"
  ADD CONSTRAINT "FeatureFlag_environments_present"
  CHECK (cardinality("environments") >= 1);

-- A retention window of zero days would delete a record in the same instant it
-- was written, including the audit row that proves the deletion happened.
ALTER TABLE "RetentionPolicy"
  ADD CONSTRAINT "RetentionPolicy_days_positive"
  CHECK ("retentionDays" >= 1);

-- An occurrence count is a count. A negative value would break every rollup
-- that sums them.
ALTER TABLE "IntegrationAlert"
  ADD CONSTRAINT "IntegrationAlert_occurrences_positive"
  CHECK ("occurrences" >= 1);

-- A fingerprint is what deduplicates alerts, so it must not be blank.
ALTER TABLE "IntegrationAlert"
  ADD CONSTRAINT "IntegrationAlert_fingerprint_present"
  CHECK (length(btrim("fingerprint")) > 0);

-- A metric window must run forwards. An inverted window would silently produce a
-- negative duration and a division by a negative interval.
ALTER TABLE "OperationalMetric"
  ADD CONSTRAINT "OperationalMetric_window_ordered"
  CHECK ("windowTo" > "windowFrom");

-- ---------------------------------------------------------------------------
-- Reference data
--
-- The retention windows the platform ships with. They are inserted here rather
-- than seeded by code so a fresh database can answer "what do you keep?" before
-- anybody has signed in, and so changing one is an ordinary, auditable update.
-- ---------------------------------------------------------------------------

INSERT INTO "RetentionPolicy" ("id", "dataClass", "label", "retentionDays", "description", "createdAt", "updatedAt")
VALUES
  ('retention_audit_event', 'audit_event', 'Audit trail', 730, 'Privileged-operation audit rows are kept for 24 months, then purged. The deletion of the trail is itself recorded in the trail.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('retention_expired_session', 'expired_session', 'Expired sessions', 1, 'Sessions that expired or were revoked are removed daily.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('retention_rate_limit_counter', 'rate_limit_counter', 'Rate-limit counters', 1, 'Fixed-window counters are removed once their window has closed.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('retention_integration_alert', 'integration_alert', 'Resolved alerts', 180, 'Resolved integration and security alerts are kept for 6 months so a recurrence can be compared with its predecessor.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('retention_report_export', 'report_export', 'Export artefacts', 30, 'Generated report files and their rows are removed 30 days after they were produced, or at their stated expiry if sooner.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("dataClass") DO NOTHING;

-- The settings the operations console needs before it can render anything. Each
-- one is a conservative default: no region is claimed as supported until an
-- administrator says so, and no notification template is enabled until it has
-- been written.
INSERT INTO "PlatformSetting" ("id", "key", "category", "label", "description", "value", "createdAt", "updatedAt")
VALUES
  ('setting_supported_regions', 'platform.supported_regions', 'REGIONS', 'Supported regions', 'The states and union territories the platform is licensed to operate in. An empty list means none are claimed.', '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('setting_service_categories', 'platform.service_categories', 'SERVICE_CATALOGUE', 'Enabled service categories', 'The platform service lines that are open for booking. A category absent from this list is shown as unavailable rather than hidden.', '["HOSPITALS","APPOINTMENTS","EMERGENCY","AI_ASSISTANT"]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('setting_notification_templates', 'platform.notification_templates', 'NOTIFICATIONS', 'Notification templates', 'Message templates keyed by event. A template that is not listed is not sent.', '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('setting_emergency_operating_model', 'platform.emergency_operating_model', 'OPERATIONS', 'Emergency operating model', 'How emergency requests are handled. "manual" means the platform never claims an automated dispatch.', '{"mode":"manual","approved":false,"notes":""}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('setting_data_export_retention_days', 'platform.export_retention_days', 'SECURITY', 'Export retention (days)', 'How long a generated report export remains downloadable.', '30'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- The flags the operations console can toggle. All of them ship off: a freshly
-- migrated environment must not have an unfinished flow reachable.
INSERT INTO "FeatureFlag" ("id", "key", "description", "enabled", "rolloutPercent", "environments", "createdAt", "updatedAt")
VALUES
  ('flag_online_pharmacy', 'online_pharmacy_checkout', 'Enable live checkout and fulfilment for medicine orders.', false, 0, ARRAY['development'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('flag_telemedicine_video', 'telemedicine_video_consults', 'Enable video consultations when a video provider is configured.', false, 0, ARRAY['development'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('flag_hospital_workspaces', 'hospital_workspaces', 'Enable the multi-hospital operational workspace.', false, 0, ARRAY['development'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('flag_care_workspace', 'patient_care_workspace', 'Enable the personal health, family and wellness workspace.', false, 0, ARRAY['development'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('flag_lab_report_release', 'lab_report_release', 'Allow verified laboratories to publish authenticated reports.', false, 0, ARRAY['development'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Abuse reports
--
-- The operations console needs an abuse queue that is distinct from the support
-- queue: a support ticket is a request for help, an abuse report is an
-- allegation against an account or a partner and ends in an enforcement
-- decision. Appended here rather than to an earlier migration because the
-- console is what introduced the workflow.
-- ---------------------------------------------------------------------------

CREATE TYPE "AbuseReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'ACTIONED', 'DISMISSED', 'ESCALATED');

CREATE TYPE "AbuseReportCategory" AS ENUM ('HARASSMENT', 'FRAUD', 'IMPERSONATION', 'UNSAFE_PROVIDER', 'SPAM', 'INAPPROPRIATE_CONTENT', 'PRIVACY_VIOLATION', 'OTHER');

CREATE TABLE "AbuseReport" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reporterLabel" TEXT,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT,
    "subjectLabel" TEXT,
    "category" "AbuseReportCategory" NOT NULL DEFAULT 'OTHER',
    "severity" "ComplaintSeverity" NOT NULL DEFAULT 'LOW',
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "evidenceKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AbuseReportStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToLabel" TEXT,
    "resolutionNotes" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbuseReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AbuseReport_reference_key" ON "AbuseReport"("reference");

CREATE INDEX "AbuseReport_status_severity_createdAt_idx" ON "AbuseReport"("status", "severity", "createdAt");

CREATE INDEX "AbuseReport_subjectKind_subjectId_idx" ON "AbuseReport"("subjectKind", "subjectId");

ALTER TABLE "AbuseReport" ADD CONSTRAINT "AbuseReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AbuseReport" ADD CONSTRAINT "AbuseReport_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A report nobody can read is not a report. The summary and the subject kind are
-- the two fields the queue sorts and routes on, so neither may be blank.
ALTER TABLE "AbuseReport"
  ADD CONSTRAINT "AbuseReport_summary_present"
  CHECK (length(btrim("summary")) > 0);

ALTER TABLE "AbuseReport"
  ADD CONSTRAINT "AbuseReport_subject_kind_present"
  CHECK (length(btrim("subjectKind")) > 0);
