import { z } from "zod";

import type {
  AbuseReportCategory,
  AbuseReportStatus,
  AccountDeletionStatus,
  ComplaintSeverity,
  ComplaintStatus,
  EmergencyIncidentStatus,
  FeatureFlag,
  IntegrationAlertSeverity,
  PartnerApplicationStatus,
  PlatformSettingCategory,
  PlatformStaffRole,
  RefundStatus,
  ReportExportStatus,
  RetentionPolicy,
  SupportTicketCategory,
  SupportTicketSeverity,
  SupportTicketStatus,
  VerificationRequestStatus,
} from "@prisma/client";

/**
 * Validation for every platform-console mutation.
 *
 * Three rules shape this module, and they are the same three the console's
 * authorization layer is built on.
 *
 * 1. **A role is never accepted from a request.** No schema here has a field
 *    called `role`, `permissions` or `operatorId`. The operator is derived from
 *    the session by `src/lib/platform/console.ts`; a form that could name its own
 *    privileges would make every guard decorative. `platformStaffGrantSchema` is
 *    the sole exception, and it names the role being *granted to somebody else*
 *    — which is a different thing, and is itself gated by `platform.staff_manage`.
 *
 * 2. **A decision must be able to explain itself.** Rejecting a hospital, closing
 *    a grievance, blocking a deletion or refusing a refund all require written
 *    reasons. This is not bureaucracy: these are the decisions a regulator, a
 *    court or a suspended partner will ask about, and an unexplained decision is
 *    indistinguishable from an arbitrary one.
 *
 * 3. **The safe value is the bounded value.** Rollouts are capped at 100, windows
 *    at a sane length, retention at a range that is neither "delete immediately"
 *    nor "keep forever". Where an unbounded number would let a single request
 *    disable a control, the schema bounds it instead.
 *
 * Enum tuples are declared here as literals and checked against the Prisma enums
 * with `satisfies`, so the compiler fails if the database and the API drift
 * apart while `import type` keeps Prisma out of client bundles.
 */

// ---------------------------------------------------------------------------
// Literal enum tuples
// ---------------------------------------------------------------------------

export const PLATFORM_STAFF_ROLES = [
  "PLATFORM_ADMIN",
  "VERIFICATION_HOSPITAL",
  "VERIFICATION_DOCTOR",
  "VERIFICATION_PHARMACY",
  "VERIFICATION_LABORATORY",
  "VERIFICATION_AMBULANCE",
  "VERIFICATION_INSURER",
  "SUPPORT_AGENT",
  "EMERGENCY_OPERATOR",
  "SECURITY_ANALYST",
] as const satisfies readonly PlatformStaffRole[];

export const PLATFORM_SETTING_CATEGORIES = [
  "SERVICE_CATALOGUE",
  "REGIONS",
  "NOTIFICATIONS",
  "SECURITY",
  "OPERATIONS",
] as const satisfies readonly PlatformSettingCategory[];

/** `WITHDRAWN` is written by the applicant, never chosen by a reviewer. */
export const REVIEWABLE_VERIFICATION_STATUSES = [
  "APPROVED",
  "REJECTED",
] as const satisfies readonly VerificationRequestStatus[];

/** Reviewers move an application into `UNDER_REVIEW` before deciding it. */
export const REVIEWABLE_APPLICATION_STATUSES = [
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
] as const satisfies readonly PartnerApplicationStatus[];

export const SUPPORT_TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "AWAITING_PATIENT",
  "RESOLVED",
  "CLOSED",
] as const satisfies readonly SupportTicketStatus[];

export const SUPPORT_TICKET_CATEGORIES = [
  "BOOKING_ISSUE",
  "PAYMENT_ISSUE",
  "PRESCRIPTION_ISSUE",
  "REPORT_ISSUE",
  "ACCOUNT_ACCESS",
  "PRIVACY_REQUEST",
  "CAREGIVER_ACCESS",
  "TECHNICAL",
  "OTHER",
] as const satisfies readonly SupportTicketCategory[];

export const SUPPORT_TICKET_SEVERITIES = [
  "LOW",
  "NORMAL",
  "HIGH",
  "CRITICAL",
] as const satisfies readonly SupportTicketSeverity[];

export const COMPLAINT_STATUSES = [
  "OPEN",
  "INVESTIGATING",
  "RESOLVED",
  "ESCALATED",
  "CLOSED",
] as const satisfies readonly ComplaintStatus[];

export const COMPLAINT_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const satisfies readonly ComplaintSeverity[];

export const ABUSE_REPORT_CATEGORIES = [
  "HARASSMENT",
  "FRAUD",
  "IMPERSONATION",
  "UNSAFE_PROVIDER",
  "SPAM",
  "INAPPROPRIATE_CONTENT",
  "PRIVACY_VIOLATION",
  "OTHER",
] as const satisfies readonly AbuseReportCategory[];

/** `OPEN` is the creation state; only the workflow states are settable. */
export const ABUSE_REPORT_DECISIONS = [
  "UNDER_REVIEW",
  "ACTIONED",
  "DISMISSED",
  "ESCALATED",
] as const satisfies readonly AbuseReportStatus[];

/**
 * The subject kinds an abuse report may name. Free text would let a report point
 * at a table that does not exist and make the queue unqueryable, so the set is
 * closed — and string-valued rather than a foreign key, so removing the subject
 * never erases the complaint about it.
 */
export const ABUSE_SUBJECT_KINDS = [
  "USER",
  "DOCTOR",
  "HOSPITAL",
  "PHARMACY",
  "LABORATORY",
  "AMBULANCE",
  "INSURER",
  "LISTING",
  "OTHER",
] as const;

export const REFUND_STATUSES = [
  "REQUESTED",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly RefundStatus[];

/**
 * What an operator may set directly. `PROCESSED` and `FAILED` are written by the
 * settlement service when a provider actually answers, so a person cannot type a
 * status that claims money moved.
 */
export const OPERATOR_SETTABLE_REFUND_STATUSES = [
  "PROCESSING",
  "CANCELLED",
] as const satisfies readonly RefundStatus[];

export const ALERT_SEVERITIES = [
  "INFO",
  "WARNING",
  "CRITICAL",
] as const satisfies readonly IntegrationAlertSeverity[];

export const EXPORT_FORMATS = ["csv", "json"] as const;

export const REPORT_EXPORT_STATUSES = [
  "QUEUED",
  "READY",
  "FAILED",
  "EXPIRED",
] as const satisfies readonly ReportExportStatus[];

export const ACCOUNT_DELETION_STATUSES = [
  "REQUESTED",
  "CANCELLED",
  "COMPLETED",
  "BLOCKED",
] as const satisfies readonly AccountDeletionStatus[];

export const RETENTION_DATA_CLASSES = [
  "audit_event",
  "expired_session",
  "rate_limit_counter",
  "integration_alert",
  "operational_metric",
  "report_export",
] as const;

export const ANALYTICS_GRANULARITIES = ["day", "week", "month"] as const;
export type AnalyticsGranularity = (typeof ANALYTICS_GRANULARITIES)[number];

export const PLATFORM_VERTICALS = [
  "appointments",
  "pharmacy",
  "diagnostics",
  "telemedicine",
  "emergency",
  "insurance",
  "hospitals",
  "support",
] as const;
export type PlatformVertical = (typeof PLATFORM_VERTICALS)[number];

export const NOTIFICATION_CHANNELS = ["EMAIL", "SMS", "PUSH", "WHATSAPP"] as const;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const checkboxBoolean = z.preprocess(
  (value) => value === true || value === "true" || value === "on" || value === "1",
  z.boolean(),
);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value));

const requiredText = (max: number, min = 2) => z.string().trim().min(min).max(max);

const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const requiredId = z.string().trim().min(1).max(64);

const isoInstant = z
  .string()
  .trim()
  .min(10)
  .max(40)
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "Enter a valid date and time.");

const optionalIsoInstant = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  isoInstant.optional(),
);

const stringList = z
  .preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        : value,
    z.array(z.string().trim().min(1).max(160)).max(60),
  )
  .optional()
  .default([]);

/** A bounded pagination pair. `page` is 1-based; the service clamps the size. */
const pagination = {
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
};

const emailSchema = z.string().trim().toLowerCase().email().max(200);

/** A stable machine key: lowercase, dotted or hyphenated, never free prose. */
const slugKey = (max: number) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(max)
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, "Use lowercase letters, numbers, dots, dashes or underscores.");

// ---------------------------------------------------------------------------
// Provider verification and partner applications
// ---------------------------------------------------------------------------

/**
 * A verification decision. `requestId` names the row; the decision is derived
 * from what the reviewer chose, and the reviewer's own identity comes from the
 * session — there is deliberately no `reviewedById` field.
 */
export const verificationDecisionSchema = z
  .object({
    requestId: requiredId,
    decision: z.enum(REVIEWABLE_VERIFICATION_STATUSES),
    reviewNotes: optionalText(2000),
  })
  .refine((value) => value.decision !== "REJECTED" || Boolean(value.reviewNotes && value.reviewNotes.length >= 10), {
    message: "A rejection needs a written reason of at least 10 characters.",
    path: ["reviewNotes"],
  });

export type VerificationDecisionInput = z.infer<typeof verificationDecisionSchema>;

/**
 * Asking for further information. This does not change the row's status — the
 * request stays `PENDING` — it records what is missing so the applicant can
 * answer without resubmitting everything.
 */
export const verificationInfoRequestSchema = z.object({
  requestId: requiredId,
  message: requiredText(2000, 10),
});

export type VerificationInfoRequestInput = z.infer<typeof verificationInfoRequestSchema>;

export const partnerApplicationDecisionSchema = z
  .object({
    applicationId: requiredId,
    decision: z.enum(REVIEWABLE_APPLICATION_STATUSES),
    reviewNotes: optionalText(2000),
  })
  .refine((value) => value.decision !== "REJECTED" || Boolean(value.reviewNotes && value.reviewNotes.length >= 10), {
    message: "A rejection needs a written reason of at least 10 characters.",
    path: ["reviewNotes"],
  });

export type PartnerApplicationDecisionInput = z.infer<typeof partnerApplicationDecisionSchema>;

/**
 * Suspending a verified partner, or lifting a suspension.
 *
 * Suspension is the strongest unilateral act the console offers: it takes a
 * hospital, pharmacy, laboratory or ambulance service off the platform. It is
 * therefore reversible only by an explicit reason, and the target is named by
 * both kind and id so an id from one table cannot be applied to another.
 */
export const partnerSuspensionSchema = z.object({
  partnerKind: z.enum(["HOSPITAL", "DOCTOR", "PHARMACY", "LABORATORY", "AMBULANCE", "INSURER"]),
  partnerId: requiredId,
  suspended: checkboxBoolean,
  reason: requiredText(1000, 10),
});

export type PartnerSuspensionInput = z.infer<typeof partnerSuspensionSchema>;

// ---------------------------------------------------------------------------
// Support, grievances, abuse and refunds
// ---------------------------------------------------------------------------

export const supportTicketFilterSchema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
  category: z.enum(SUPPORT_TICKET_CATEGORIES).optional(),
  severity: z.enum(SUPPORT_TICKET_SEVERITIES).optional(),
  assignedTo: optionalText(160),
  query: optionalText(160),
  ...pagination,
});

export type SupportTicketFilterInput = z.infer<typeof supportTicketFilterSchema>;

export const supportTicketUpdateSchema = z
  .object({
    ticketId: requiredId,
    status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
    severity: z.enum(SUPPORT_TICKET_SEVERITIES).optional(),
    assignedToLabel: optionalText(160),
    resolutionNote: optionalText(2000),
  })
  .refine((value) => value.status !== undefined || value.severity !== undefined || value.assignedToLabel !== undefined, {
    message: "Choose at least one thing to change.",
  })
  .refine(
    (value) => value.status !== "RESOLVED" && value.status !== "CLOSED" ? true : Boolean(value.resolutionNote && value.resolutionNote.length >= 10),
    { message: "Resolving or closing a ticket needs a resolution note of at least 10 characters.", path: ["resolutionNote"] },
  );

export type SupportTicketUpdateInput = z.infer<typeof supportTicketUpdateSchema>;

/**
 * A reply on a ticket. `isInternal` marks a staff-only note, which is why the
 * flag exists on the schema at all: the two are stored as one thread but must
 * never be shown to the same reader.
 */
export const supportTicketReplySchema = z.object({
  ticketId: requiredId,
  body: requiredText(4000, 1),
  isInternal: checkboxBoolean.optional().default(false),
});

export type SupportTicketReplyInput = z.infer<typeof supportTicketReplySchema>;

export const complaintFilterSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  severity: z.enum(COMPLAINT_SEVERITIES).optional(),
  hospitalId: optionalId,
  query: optionalText(160),
  ...pagination,
});

export type ComplaintFilterInput = z.infer<typeof complaintFilterSchema>;

export const complaintUpdateSchema = z
  .object({
    complaintId: requiredId,
    status: z.enum(COMPLAINT_STATUSES).optional(),
    severity: z.enum(COMPLAINT_SEVERITIES).optional(),
    assignedToLabel: optionalText(160),
    resolutionNotes: optionalText(2000),
    note: optionalText(2000),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.severity !== undefined ||
      value.assignedToLabel !== undefined ||
      value.note !== undefined,
    { message: "Choose at least one thing to change." },
  )
  .refine(
    (value) =>
      value.status !== "RESOLVED" && value.status !== "CLOSED"
        ? true
        : Boolean(value.resolutionNotes && value.resolutionNotes.length >= 10),
    {
      message: "Resolving or closing a grievance needs a resolution note of at least 10 characters.",
      path: ["resolutionNotes"],
    },
  );

export type ComplaintUpdateInput = z.infer<typeof complaintUpdateSchema>;

/**
 * Raising an abuse report. Available to an operator on behalf of a person who
 * reported abuse through another channel, and to the person themselves through
 * the support flow — the reporter is taken from the session when present and the
 * label is only a display fallback.
 */
export const abuseReportCreateSchema = z.object({
  reporterLabel: optionalText(160),
  subjectKind: z.enum(ABUSE_SUBJECT_KINDS),
  subjectId: optionalId,
  subjectLabel: optionalText(200),
  category: z.enum(ABUSE_REPORT_CATEGORIES).default("OTHER"),
  severity: z.enum(COMPLAINT_SEVERITIES).default("LOW"),
  summary: requiredText(300, 10),
  detail: optionalText(5000),
  evidenceKeys: z.array(z.string().trim().min(1).max(300)).max(20).optional().default([]),
});

export type AbuseReportCreateInput = z.infer<typeof abuseReportCreateSchema>;

/**
 * The enforcement decision on an abuse report. `ACTIONED` and `DISMISSED` are
 * the two that end an allegation, so both require written reasoning and the
 * deciding operator's name is stamped from the session.
 */
export const abuseReportDecisionSchema = z
  .object({
    reportId: requiredId,
    decision: z.enum(ABUSE_REPORT_DECISIONS),
    assignedToLabel: optionalText(160),
    resolutionNotes: optionalText(3000),
  })
  .refine(
    (value) =>
      value.decision !== "ACTIONED" && value.decision !== "DISMISSED"
        ? true
        : Boolean(value.resolutionNotes && value.resolutionNotes.length >= 10),
    {
      message: "Closing a report needs a written decision of at least 10 characters.",
      path: ["resolutionNotes"],
    },
  );

export type AbuseReportDecisionInput = z.infer<typeof abuseReportDecisionSchema>;

/**
 * Refund oversight.
 *
 * Deliberately narrow. A console operator may move a refund into `PROCESSING`
 * (so the settlement worker picks it up) or `CANCELLED`; they may not write
 * `PROCESSED`, because that asserts money left the provider and only the
 * provider's acknowledgement may assert it. `amountPaise` is never accepted —
 * the amount is the one already recorded against the order.
 */
export const refundDecisionSchema = z.object({
  refundId: requiredId,
  status: z.enum(OPERATOR_SETTABLE_REFUND_STATUSES),
  notes: requiredText(1000, 10),
});

export type RefundDecisionInput = z.infer<typeof refundDecisionSchema>;

// ---------------------------------------------------------------------------
// Emergency operations and integration monitoring
// ---------------------------------------------------------------------------

/**
 * An operator note on an incident. This adds context for the next operator; it
 * cannot change an incident's status, dispatch state or any clinical fact. The
 * emergency workflow is owned by the response service, not by the console.
 */
export const emergencyOperatorNoteSchema = z.object({
  incidentId: requiredId,
  note: requiredText(2000, 3),
});

export type EmergencyOperatorNoteInput = z.infer<typeof emergencyOperatorNoteSchema>;

export const integrationProbeSchema = z.object({
  provider: z.enum(["PAYMENT", "VIDEO", "GEOCODING", "LIS", "SMS", "EMAIL", "DISPATCH"]),
});

export type IntegrationProbeInput = z.infer<typeof integrationProbeSchema>;

export const alertAcknowledgeSchema = z.object({
  alertId: requiredId,
  note: optionalText(1000),
});

export type AlertAcknowledgeInput = z.infer<typeof alertAcknowledgeSchema>;

export const alertResolveSchema = z.object({
  alertId: requiredId,
  note: requiredText(1000, 10),
});

export type AlertResolveInput = z.infer<typeof alertResolveSchema>;

// ---------------------------------------------------------------------------
// Configuration — feature flags
// ---------------------------------------------------------------------------

/**
 * A feature flag. `key` is immutable once created (the service rejects a rename
 * rather than silently orphaning the old key), and the rollout is a whole
 * percentage so there is no fractional bucket to reason about.
 */
export const featureFlagSchema = z.object({
  key: slugKey(120),
  description: requiredText(400, 3),
  enabled: checkboxBoolean.optional().default(false),
  rolloutPercent: z.coerce.number().int().min(0).max(100).optional().default(0),
  environments: z
    .array(z.enum(["development", "staging", "production"]))
    .min(1)
    .max(3)
    .optional()
    .default(["development"]),
});

export type FeatureFlagInput = z.infer<typeof featureFlagSchema>;

// ---------------------------------------------------------------------------
// Configuration — settings values
// ---------------------------------------------------------------------------

/**
 * The known platform settings, by key.
 *
 * A closed set rather than free text: a setting is read by code that expects a
 * particular shape, so an unrecognised key can only ever be a typo that silently
 * does nothing. Adding a setting is a code change, which is the point — every
 * knob the console can turn is one the platform actually reads.
 */
export const PLATFORM_SETTING_KEYS = [
  "service_catalogue.categories",
  "regions.supported",
  "notifications.templates",
  "security.session_policy",
  "operations.maintenance_window",
] as const;

export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[number];

export const PLATFORM_SETTING_CATEGORY_BY_KEY: Record<PlatformSettingKey, PlatformSettingCategory> = {
  "service_catalogue.categories": "SERVICE_CATALOGUE",
  "regions.supported": "REGIONS",
  "notifications.templates": "NOTIFICATIONS",
  "security.session_policy": "SECURITY",
  "operations.maintenance_window": "OPERATIONS",
};

/** One bookable service category, as configured by an administrator. */
export const serviceCategorySchema = z.object({
  key: slugKey(80),
  name: requiredText(120, 2),
  vertical: z.enum(PLATFORM_VERTICALS),
  description: optionalText(600),
  isActive: checkboxBoolean.optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional().default(0),
});

export type ServiceCategoryInput = z.infer<typeof serviceCategorySchema>;

const serviceCatalogueValueSchema = z.object({
  categories: z.array(serviceCategorySchema).max(200),
});

/**
 * A supported region. `code` is an ISO 3166-1 alpha-2 country code plus an
 * optional subdivision, so "which regions are supported" is answerable by a
 * machine and not only by reading a label.
 */
export const regionEntrySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}(?:-[A-Z0-9]{1,3})?$/, "Use an ISO 3166 code such as IN or IN-KA."),
  name: requiredText(120, 2),
  isActive: checkboxBoolean.optional().default(true),
  notes: optionalText(400),
});

export type RegionEntryInput = z.infer<typeof regionEntrySchema>;

const regionsValueSchema = z.object({
  regions: z.array(regionEntrySchema).max(300),
});

/**
 * A notification template. `body` is text with `{{placeholders}}` resolved at
 * send time; it is stored as plain text and never rendered as HTML, so a
 * template cannot become a script injection vector.
 */
export const notificationTemplateSchema = z.object({
  key: slugKey(120),
  channel: z.enum(NOTIFICATION_CHANNELS),
  locale: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/, "Use a locale such as en or en-IN.")
    .optional()
    .default("en-IN"),
  subject: optionalText(200),
  body: requiredText(4000, 3),
  isActive: checkboxBoolean.optional().default(true),
});

export type NotificationTemplateInput = z.infer<typeof notificationTemplateSchema>;

const notificationsValueSchema = z.object({
  templates: z.array(notificationTemplateSchema).max(200),
});

/**
 * Session policy. Bounded on purpose: a maximum session of zero minutes would
 * sign everybody out continuously, and one of a year would make the expiry
 * meaningless. The service reads these and the auth layer honours them.
 */
const sessionPolicyValueSchema = z.object({
  defaultSessionMinutes: z.coerce.number().int().min(15).max(24 * 60),
  rememberSessionDays: z.coerce.number().int().min(1).max(90),
  idleTimeoutMinutes: z.coerce.number().int().min(5).max(24 * 60),
});

/**
 * A maintenance window. Informational — it is shown to operators and used to
 * suppress non-critical alerts during planned work, so its bounds are the only
 * thing that matters.
 */
const maintenanceWindowValueSchema = z.object({
  isActive: checkboxBoolean.optional().default(false),
  startsAt: optionalIsoInstant,
  endsAt: optionalIsoInstant,
  summary: optionalText(400),
  suppressNonCriticalAlerts: checkboxBoolean.optional().default(false),
});

const PLATFORM_SETTING_VALUE_SCHEMAS = {
  "service_catalogue.categories": serviceCatalogueValueSchema,
  "regions.supported": regionsValueSchema,
  "notifications.templates": notificationsValueSchema,
  "security.session_policy": sessionPolicyValueSchema,
  "operations.maintenance_window": maintenanceWindowValueSchema,
} as const satisfies Record<PlatformSettingKey, z.ZodType>;

/**
 * Validate a setting's value against the schema its key promises.
 *
 * Returns a result rather than throwing so a service can turn a bad value into a
 * field-level form error instead of a 500, and so the console can validate a
 * value it is about to display without a try/catch.
 */
export function parsePlatformSettingValue(
  key: string,
  raw: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (!isPlatformSettingKey(key)) {
    return { ok: false, message: "That is not a setting this platform reads." };
  }
  const result = PLATFORM_SETTING_VALUE_SCHEMAS[key].safeParse(raw);
  if (!result.success) {
    const [issue] = result.error.issues;
    return { ok: false, message: issue?.message ?? "That value is not valid for this setting." };
  }
  return { ok: true, value: result.data };
}

export function isPlatformSettingKey(value: string): value is PlatformSettingKey {
  return (PLATFORM_SETTING_KEYS as readonly string[]).includes(value);
}

/**
 * Write a setting. The label and description are editable metadata; the key and
 * its category are fixed by `PLATFORM_SETTING_CATEGORY_BY_KEY`, so a client
 * cannot move a security setting into a category an operator is allowed to see.
 */
export const platformSettingWriteSchema = z
  .object({
    key: z.enum(PLATFORM_SETTING_KEYS),
    value: z.unknown(),
    label: optionalText(160),
    description: optionalText(600),
  })
  .superRefine((input, ctx) => {
    const parsed = parsePlatformSettingValue(input.key, input.value);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", path: ["value"], message: parsed.message });
    }
  });

export type PlatformSettingWriteInput = z.infer<typeof platformSettingWriteSchema>;

// ---------------------------------------------------------------------------
// Analytics and exports
// ---------------------------------------------------------------------------

/** A closed window, at most 366 days, and never in the future. */
export const analyticsRangeSchema = z
  .object({
    from: isoInstant,
    to: isoInstant,
    granularity: z.enum(ANALYTICS_GRANULARITIES).optional().default("day"),
    vertical: z.enum(PLATFORM_VERTICALS).optional(),
  })
  .refine((value) => value.to.getTime() > value.from.getTime(), {
    message: "The end of the range must be after its start.",
    path: ["to"],
  })
  .refine((value) => value.to.getTime() - value.from.getTime() <= 366 * 24 * 60 * 60 * 1000, {
    message: "Choose a range of at most 366 days.",
    path: ["from"],
  })
  .refine((value) => value.to.getTime() <= Date.now() + 24 * 60 * 60 * 1000, {
    message: "A range cannot end in the future; there is no data for it yet.",
    path: ["to"],
  });

export type AnalyticsRangeInput = z.infer<typeof analyticsRangeSchema>;

export const exportRequestSchema = z.object({
  reportKey: z.enum([
    "appointments",
    "pharmacy_orders",
    "diagnostic_bookings",
    "insurance_claims",
    "support_tickets",
    "provider_performance",
    "service_reliability",
    "audit_activity",
  ]),
  format: z.enum(EXPORT_FORMATS).optional().default("csv"),
  containsPersonalData: checkboxBoolean.optional().default(false),
  /** A note of why the export was needed, shown to whoever reviews the log. */
  purpose: requiredText(300, 10),
  range: analyticsRangeSchema,
});

export type ExportRequestInput = z.infer<typeof exportRequestSchema>;

// ---------------------------------------------------------------------------
// Retention and account deletion
// ---------------------------------------------------------------------------

/**
 * A retention policy.
 *
 * The lower bound is deliberate: a policy of zero days would mean a purge run
 * deletes every audit row, which is both an operational and an evidential
 * disaster. Thirty days is the shortest window this platform will accept.
 */
export const retentionPolicySchema = z.object({
  dataClass: z.enum(RETENTION_DATA_CLASSES),
  retentionDays: z.coerce.number().int().min(30).max(3650),
  label: optionalText(160),
  description: optionalText(600),
});

export type RetentionPolicyInput = z.infer<typeof retentionPolicySchema>;

/**
 * A purge run. `dryRun` defaults to **true**: the first press reports what would
 * be removed and touches nothing. A destructive run must be an explicit choice.
 */
export const retentionPurgeSchema = z.object({
  dataClass: z.enum(RETENTION_DATA_CLASSES).optional(),
  dryRun: checkboxBoolean.optional().default(true),
});

export type RetentionPurgeInput = z.infer<typeof retentionPurgeSchema>;

/**
 * The decision on a deletion request.
 *
 * `COMPLETE` may only be written after the anonymisation actually ran, so it
 * carries the confirmation of that; `BLOCK` must name the obligation that
 * prevents erasure, because "we refused" without a reason is not answerable.
 */
export const accountDeletionDecisionSchema = z
  .object({
    requestId: requiredId,
    decision: z.enum(["COMPLETE", "BLOCK", "CANCEL"]),
    blockedReason: optionalText(1000),
    retentionHoldUntil: optionalIsoInstant,
  })
  .refine(
    (value) =>
      value.decision !== "BLOCK" ? true : Boolean(value.blockedReason && value.blockedReason.length >= 10),
    {
      message: "Blocking a deletion needs the retention obligation that prevents it, in at least 10 characters.",
      path: ["blockedReason"],
    },
  )
  .refine(
    (value) =>
      value.decision !== "CANCEL" ? true : Boolean(value.blockedReason && value.blockedReason.length >= 4),
    { message: "Cancelling a request needs a short reason.", path: ["blockedReason"] },
  );

export type AccountDeletionDecisionInput = z.infer<typeof accountDeletionDecisionSchema>;

/**
 * A person's own request to be forgotten, raised from their account settings.
 * It takes the reason only; the schedule and the actor are set server-side.
 */
export const accountDeletionRequestSchema = z.object({
  reason: optionalText(1000),
  acknowledged: checkboxBoolean.refine(
    (value) => value === true,
    "Confirm that you understand the request will be reviewed before anything is deleted.",
  ),
});

export type AccountDeletionRequestInput = z.infer<typeof accountDeletionRequestSchema>;

// ---------------------------------------------------------------------------
// Platform staff administration
// ---------------------------------------------------------------------------

/**
 * Granting a platform operations role.
 *
 * The target is named by email rather than by an id from the form, so an
 * operator cannot grant a queue by pasting an arbitrary identifier, and the
 * service resolves the account itself. `reason` is required: a grant of
 * privileged access is exactly the kind of event an audit reader will ask about.
 */
export const platformStaffGrantSchema = z.object({
  email: emailSchema,
  role: z.enum(PLATFORM_STAFF_ROLES),
  reason: requiredText(600, 10),
});

export type PlatformStaffGrantInput = z.infer<typeof platformStaffGrantSchema>;

export const platformStaffUpdateSchema = z.object({
  memberId: requiredId,
  role: z.enum(PLATFORM_STAFF_ROLES),
  reason: requiredText(600, 10),
});

export type PlatformStaffUpdateInput = z.infer<typeof platformStaffUpdateSchema>;

export const platformStaffRevokeSchema = z.object({
  memberId: requiredId,
  reason: requiredText(600, 10),
});

export type PlatformStaffRevokeInput = z.infer<typeof platformStaffRevokeSchema>;

// ---------------------------------------------------------------------------
// Console list filters (shared shape)
// ---------------------------------------------------------------------------

export const verificationQueueFilterSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]).optional(),
  subjectType: z.enum(["HOSPITAL", "DOCTOR", "PARTNER_APPLICATION"]).optional(),
  query: optionalText(160),
  ...pagination,
});

export type VerificationQueueFilterInput = z.infer<typeof verificationQueueFilterSchema>;

export const partnerApplicationFilterSchema = z.object({
  status: z.enum(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "WITHDRAWN"]).optional(),
  partnerType: z.enum(["PHARMACY", "LABORATORY", "AMBULANCE", "INSURANCE", "DIAGNOSTIC_CENTER"]).optional(),
  city: optionalText(120),
  query: optionalText(160),
  ...pagination,
});

export type PartnerApplicationFilterInput = z.infer<typeof partnerApplicationFilterSchema>;

export const abuseReportFilterSchema = z.object({
  status: z.enum(["OPEN", "UNDER_REVIEW", "ACTIONED", "DISMISSED", "ESCALATED"]).optional(),
  category: z.enum(ABUSE_REPORT_CATEGORIES).optional(),
  severity: z.enum(COMPLAINT_SEVERITIES).optional(),
  query: optionalText(160),
  ...pagination,
});

export type AbuseReportFilterInput = z.infer<typeof abuseReportFilterSchema>;

export const refundFilterSchema = z.object({
  status: z.enum(REFUND_STATUSES).optional(),
  query: optionalText(160),
  ...pagination,
});

export type RefundFilterInput = z.infer<typeof refundFilterSchema>;

export const alertFilterSchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  kind: z.enum(["SECURITY", "INTEGRATION"]).optional(),
  ...pagination,
});

export type AlertFilterInput = z.infer<typeof alertFilterSchema>;

export const auditLogFilterSchema = z.object({
  action: optionalText(120),
  entityType: optionalText(80),
  actorUserId: optionalId,
  hospitalId: optionalId,
  from: optionalIsoInstant,
  to: optionalIsoInstant,
  ...pagination,
});

export type AuditLogFilterInput = z.infer<typeof auditLogFilterSchema>;

export const exportQueueFilterSchema = z.object({
  status: z.enum(REPORT_EXPORT_STATUSES).optional(),
  reportKey: optionalText(80),
  ...pagination,
});

export type ExportQueueFilterInput = z.infer<typeof exportQueueFilterSchema>;

export const platformStaffFilterSchema = z.object({
  role: z.enum(PLATFORM_STAFF_ROLES).optional(),
  status: z.enum(["INVITED", "ACTIVE", "REVOKED"]).optional(),
  query: optionalText(160),
  ...pagination,
});

export type PlatformStaffFilterInput = z.infer<typeof platformStaffFilterSchema>;

/**
 * The SOS queue filter.
 *
 * Real incidents are the default and a rehearsal must be asked for explicitly:
 * a seeded demo row counted among live incidents would misstate how many people
 * the platform is actually trying to help.
 */
export const emergencyIncidentFilterSchema = z.object({
  status: z
    .enum([
      "SEEKING_RESPONDERS",
      "ACKNOWLEDGED",
      "RESPONDER_ACCEPTED",
      "EN_ROUTE",
      "ON_SCENE",
      "TRANSPORTING",
      "RESOLVED",
      "CANCELLED",
      "EXPIRED",
      "UNANSWERED",
    ] satisfies readonly EmergencyIncidentStatus[])
    .optional(),
  includeDemo: checkboxBoolean.optional().default(false),
  from: optionalIsoInstant,
  to: optionalIsoInstant,
  ...pagination,
});

export type EmergencyIncidentFilterInput = z.infer<typeof emergencyIncidentFilterSchema>;

/**
 * The failed and stalled dispatch queue. Paginated only: it is short by design,
 * because a long one means something is badly wrong rather than busy.
 */
export const dispatchTroubleFilterSchema = z.object({ ...pagination });

export type DispatchTroubleFilterInput = z.infer<typeof dispatchTroubleFilterSchema>;

export const accountDeletionFilterSchema = z.object({
  status: z.enum(ACCOUNT_DELETION_STATUSES).optional(),
});

export type AccountDeletionFilterInput = z.infer<typeof accountDeletionFilterSchema>;

/**
 * Stored metric samples. `limit` is the row ceiling, not a page size: the series
 * is read as a whole for a chart, so there is no offset to page through.
 */
export const operationalMetricFilterSchema = z.object({
  metricKey: optionalText(120),
  from: optionalIsoInstant,
  to: optionalIsoInstant,
  limit: z.coerce.number().int().min(1).max(2_000).optional().default(500),
});

export type OperationalMetricFilterInput = z.infer<typeof operationalMetricFilterSchema>;

/** Retained for the retention console's list view; matches `RetentionPolicy`. */
export type RetentionPolicyRecord = Pick<RetentionPolicy, "dataClass" | "label" | "retentionDays">;

/** Exported so the console can type a flag row without importing Prisma. */
export type FeatureFlagRecord = Pick<FeatureFlag, "key" | "description" | "enabled" | "rolloutPercent" | "environments">;

export type { AccountDeletionStatus };
