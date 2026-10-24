import { z } from "zod";

import type {
  AllergySeverity,
  CareProgramKind,
  CareProgramStatus,
  CareReminderChannel,
  CareReminderStatus,
  CareServiceCategory,
  CareServiceDeliveryMode,
  CareServiceRequestStatus,
  CaregiverScope,
  EducationResourceCategory,
  FamilyRelationship,
  HealthDeviceProvider,
  HealthDocumentKind,
  HealthRecordSource,
  MedicalHistoryCategory,
  MedicationDoseStatus,
  MedicationScheduleStatus,
  MentalWellnessResourceKind,
  PreventiveCareKind,
  PreventiveCareStatus,
  ReminderKind,
  ReminderScheduleKind,
  ServiceFeedbackSubject,
  SupportedLanguage,
  SupportTicketCategory,
  SupportTicketSeverity,
  SupportTicketStatus,
  WellnessCategory,
  WellnessGoalCadence,
  WellnessUnit,
} from "@prisma/client";

/**
 * Validation for everything that reaches the patient care domain.
 *
 * The enum value lists are literal tuples checked against the Prisma enums with
 * `satisfies`, so the compiler fails if the database and the API drift apart,
 * while the `import type` keeps Prisma out of any client bundle that loads these
 * schemas for inline validation. This mirrors `src/lib/validation/pharmacy.ts`.
 *
 * Three things are deliberately absent from every schema here:
 *
 * - **No provenance field.** `source`, `verifiedById` and `verifiedAt` are never
 *   accepted from a request. A client that could choose its own provenance could
 *   label a self-typed number as clinician-verified, so those columns are set by
 *   the service layer alone.
 * - **No computed wellness figure.** A schema accepts a value and a unit; there
 *   is nowhere to post a score, because the platform does not produce one.
 * - **No device credential.** A connection names a provider and nothing more; no
 *   schema has a field for a token, and none ever will.
 */

// ---------------------------------------------------------------------------
// Literal enum tuples
// ---------------------------------------------------------------------------

export const FAMILY_RELATIONSHIPS = [
  "SPOUSE",
  "CHILD",
  "PARENT",
  "SIBLING",
  "GUARDIAN",
  "OTHER",
] as const satisfies readonly FamilyRelationship[];

export const CAREGIVER_SCOPES = [
  "VIEW_PROFILE",
  "BOOK_APPOINTMENTS",
  "VIEW_RECORDS",
  "MANAGE_MEDICATIONS",
  "MANAGE_REMINDERS",
  "UPLOAD_DOCUMENTS",
  "MANAGE_WELLNESS",
] as const satisfies readonly CaregiverScope[];

export const HEALTH_DOCUMENT_KINDS = [
  "LAB_REPORT",
  "IMAGING_REPORT",
  "PRESCRIPTION",
  "DISCHARGE_SUMMARY",
  "CONSULTATION_NOTE",
  "VACCINATION_CERTIFICATE",
  "INSURANCE_POLICY",
  "INSURANCE_CLAIM",
  "INVOICE",
  "REFERRAL",
  "OTHER",
] as const satisfies readonly HealthDocumentKind[];

export const ALLERGY_SEVERITIES = [
  "MILD",
  "MODERATE",
  "SEVERE",
  "LIFE_THREATENING",
  "UNKNOWN",
] as const satisfies readonly AllergySeverity[];

export const MEDICAL_HISTORY_CATEGORIES = [
  "CONDITION",
  "SURGERY",
  "HOSPITALISATION",
  "FAMILY_HISTORY",
  "LIFESTYLE",
  "OTHER",
] as const satisfies readonly MedicalHistoryCategory[];

export const REMINDER_KINDS = [
  "MEDICATION",
  "VACCINATION",
  "SCREENING",
  "APPOINTMENT",
  "PREVENTIVE_CHECKUP",
  "FOLLOW_UP",
  "WELLNESS",
  "MATERNAL",
  "CHILD",
  "SENIOR_CARE",
  "CUSTOM",
] as const satisfies readonly ReminderKind[];

export const REMINDER_SCHEDULE_KINDS = [
  "ONE_OFF",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "INTERVAL",
] as const satisfies readonly ReminderScheduleKind[];

export const CARE_REMINDER_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly CareReminderStatus[];

export const CARE_REMINDER_CHANNELS = [
  "IN_APP",
  "EMAIL",
  "SMS",
  "WHATSAPP",
  "PUSH",
] as const satisfies readonly CareReminderChannel[];

export const PREVENTIVE_CARE_KINDS = [
  "VACCINATION",
  "SCREENING",
  "PREVENTIVE_CHECKUP",
  "DENTAL",
  "VISION",
  "MENTAL_WELLNESS",
] as const satisfies readonly PreventiveCareKind[];

export const PREVENTIVE_CARE_STATUSES = [
  "PLANNED",
  "DUE",
  "COMPLETED",
  "OVERDUE",
  "DECLINED",
] as const satisfies readonly PreventiveCareStatus[];

export const CARE_PROGRAM_KINDS = [
  "MATERNAL",
  "CHILD",
  "SENIOR",
  "CHRONIC_CONDITION",
  "REHABILITATION",
] as const satisfies readonly CareProgramKind[];

export const CARE_PROGRAM_STATUSES = [
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "WITHDRAWN",
] as const satisfies readonly CareProgramStatus[];

export const MEDICATION_SCHEDULE_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "STOPPED",
] as const satisfies readonly MedicationScheduleStatus[];

export const MEDICATION_DOSE_STATUSES = [
  "SCHEDULED",
  "TAKEN",
  "TAKEN_LATE",
  "SKIPPED",
  "MISSED",
] as const satisfies readonly MedicationDoseStatus[];

export const WELLNESS_CATEGORIES = [
  "NUTRITION",
  "ACTIVITY",
  "SLEEP",
  "MOOD",
  "WEIGHT",
  "BLOOD_PRESSURE",
  "BLOOD_GLUCOSE",
  "HYDRATION",
  "PAIN",
  "OTHER",
] as const satisfies readonly WellnessCategory[];

export const WELLNESS_UNITS = [
  "KCAL",
  "GRAM",
  "MILLILITRE",
  "MINUTE",
  "HOUR",
  "STEP",
  "COUNT",
  "KILOGRAM",
  "CENTIMETRE",
  "MMHG",
  "MG_DL",
  "SELF_REPORT_SCALE",
  "NONE",
] as const satisfies readonly WellnessUnit[];

export const WELLNESS_GOAL_CADENCES = ["DAILY", "WEEKLY", "MONTHLY"] as const satisfies readonly WellnessGoalCadence[];

export const HEALTH_DEVICE_PROVIDERS = [
  "MANUAL_UPLOAD",
  "APPLE_HEALTH",
  "GOOGLE_FIT",
  "FITBIT",
  "GARMIN",
  "SAMSUNG_HEALTH",
  "WITHINGS",
  "OMROM",
  "OTHER",
] as const satisfies readonly HealthDeviceProvider[];

export const CARE_SERVICE_CATEGORIES = [
  "PHYSIOTHERAPY",
  "REHABILITATION",
  "HOME_NURSING",
  "HOME_HEALTHCARE",
  "HOME_SAMPLE_COLLECTION",
  "MENTAL_WELLNESS",
  "NUTRITION_COUNSELLING",
  "ELDER_CARE",
  "POST_SURGICAL_CARE",
  "OTHER",
] as const satisfies readonly CareServiceCategory[];

export const CARE_SERVICE_DELIVERY_MODES = [
  "AT_FACILITY",
  "AT_HOME",
  "ONLINE",
] as const satisfies readonly CareServiceDeliveryMode[];

export const CARE_SERVICE_REQUEST_STATUSES = [
  "REQUESTED",
  "ACKNOWLEDGED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "DECLINED",
] as const satisfies readonly CareServiceRequestStatus[];

export const MENTAL_WELLNESS_RESOURCE_KINDS = [
  "ARTICLE",
  "GUIDE",
  "HELPLINE",
  "SELF_ASSESSMENT",
  "GUIDED_EXERCISE",
  "VIDEO",
] as const satisfies readonly MentalWellnessResourceKind[];

export const EDUCATION_RESOURCE_CATEGORIES = [
  "GENERAL_HEALTH",
  "MATERNAL_HEALTH",
  "CHILD_HEALTH",
  "SENIOR_HEALTH",
  "NUTRITION",
  "MENTAL_HEALTH",
  "CHRONIC_CONDITION",
  "MEDICATION_SAFETY",
  "EMERGENCY_AWARENESS",
] as const satisfies readonly EducationResourceCategory[];

export const SUPPORTED_LANGUAGES = [
  "ENGLISH",
  "HINDI",
  "KANNADA",
  "TAMIL",
  "TELUGU",
  "MALAYALAM",
  "MARATHI",
  "BENGALI",
  "GUJARATI",
  "ODIA",
  "PUNJABI",
  "ASSAMESE",
  "URDU",
] as const satisfies readonly SupportedLanguage[];

export const SERVICE_FEEDBACK_SUBJECTS = [
  "APPOINTMENT",
  "TELECONSULTATION",
  "LAB_BOOKING",
  "PHARMACY_ORDER",
  "CARE_SERVICE",
  "HOSPITAL_VISIT",
  "PLATFORM",
] as const satisfies readonly ServiceFeedbackSubject[];

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

export const SUPPORT_TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "AWAITING_PATIENT",
  "RESOLVED",
  "CLOSED",
] as const satisfies readonly SupportTicketStatus[];

/**
 * The sources a *person* is allowed to claim.
 *
 * Module H of the schema has five sources, but two of them are not a client's to
 * send: `CLINICIAN_RECORDED` comes from a clinician's console and
 * `PARTNER_REPORTED` from a partner. A request may only ever say "I typed this"
 * or "this came from my device", which is why this list is narrower than the
 * enum even though it is checked against the same type.
 */
export const PATIENT_SETTABLE_SOURCES = ["USER_ENTERED", "DEVICE_IMPORTED"] as const satisfies readonly HealthRecordSource[];

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** `"09:30"`. Minutes past midnight are parsed by the service, not stored here. */
export const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time, for example 09:30.");

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1, "Choose a time zone.")
  .max(64, "That is not a time zone ORVEXA recognises.")
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a recognised time zone, for example Asia/Kolkata.");

export const idSchema = z.string().trim().min(1).max(64);

/**
 * Which record an operation is about.
 *
 * `ownerUserId` is only ever accepted for a person who has granted caregiver
 * access; passing it is a request to act *as* a caregiver and every service
 * re-checks the grant. Omitting it means "my own record".
 */
export const careTargetSchema = z.object({
  ownerUserId: idSchema.optional(),
  familyMemberId: idSchema.optional(),
});

export const weekdaySchema = z.number().int().min(0).max(6);

const shortText = (max: number) => z.string().trim().min(1).max(max);
const longText = (max: number) => z.string().trim().min(1).max(max);

// ---------------------------------------------------------------------------
// Family and caregiver access
// ---------------------------------------------------------------------------

export const familyMemberCreateSchema = z.object({
  fullName: shortText(120),
  relationship: z.enum(FAMILY_RELATIONSHIPS),
  dateOfBirth: z.coerce.date().optional(),
  bloodGroup: z
    .enum(["A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE", "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE", "UNKNOWN"])
    .optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]).optional(),
});

export const familyMemberUpdateSchema = familyMemberCreateSchema.partial();

/**
 * Inviting a caregiver.
 *
 * `scopes` must not be empty: an invitation that grants nothing is a mistake
 * rather than a cautious default, and it would produce an `ACTIVE` row whose
 * holder can do nothing but still appears in the switcher.
 */
export const caregiverInviteSchema = z.object({
  caregiverEmail: z.string().trim().toLowerCase().email("Enter the email address of the person you are inviting."),
  relationship: z.enum(FAMILY_RELATIONSHIPS),
  scopes: z.array(z.enum(CAREGIVER_SCOPES)).min(1, "Choose at least one thing this person may do."),
  expiresAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
});

export const caregiverScopeUpdateSchema = z.object({
  scopes: z.array(z.enum(CAREGIVER_SCOPES)),
});

export const caregiverRevokeSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/** The owner's own consent, which is what every grant hangs off. */
export const caregiverConsentSchema = z.object({
  granted: z.boolean(),
});

export const deviceImportConsentSchema = z.object({
  granted: z.boolean(),
});

// ---------------------------------------------------------------------------
// Medical history, allergies, immunisations and the vault
// ---------------------------------------------------------------------------

export const allergyCreateSchema = careTargetSchema.extend({
  substance: shortText(160),
  reaction: z.string().trim().max(300).optional(),
  severity: z.enum(ALLERGY_SEVERITIES).default("UNKNOWN"),
  notes: z.string().trim().max(500).optional(),
});

export const allergyUpdateSchema = allergyCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const immunizationCreateSchema = careTargetSchema.extend({
  vaccineName: shortText(160),
  doseLabel: z.string().trim().max(60).optional(),
  administeredOn: z.coerce.date(),
  administeredByLabel: z.string().trim().max(160).optional(),
  facilityLabel: z.string().trim().max(160).optional(),
  batchNumber: z.string().trim().max(60).optional(),
  documentId: idSchema.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const immunizationUpdateSchema = immunizationCreateSchema.partial();

export const medicalHistoryCreateSchema = careTargetSchema.extend({
  category: z.enum(MEDICAL_HISTORY_CATEGORIES),
  label: shortText(160),
  details: z.string().trim().max(2000).optional(),
  onsetOn: z.coerce.date().optional(),
  resolvedOn: z.coerce.date().optional(),
});

export const medicalHistoryUpdateSchema = medicalHistoryCreateSchema.partial();

export const healthDocumentCreateSchema = careTargetSchema.extend({
  kind: z.enum(HEALTH_DOCUMENT_KINDS),
  title: shortText(200),
  description: z.string().trim().max(1000).optional(),
  /** The private object key returned by the upload endpoint. */
  storageKey: shortText(400),
  fileName: z.string().trim().max(200).optional(),
  mimeType: shortText(120),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  issuedByLabel: z.string().trim().max(160).optional(),
  issuedOn: z.coerce.date().optional(),
  /**
   * Defaults to true. A document is assumed to be clinical until the person
   * says otherwise, so the read path records an audit row rather than the other
   * way round.
   */
  isSensitive: z.boolean().default(true),
});

export const healthDocumentUpdateSchema = z.object({
  title: shortText(200).optional(),
  description: z.string().trim().max(1000).optional(),
  kind: z.enum(HEALTH_DOCUMENT_KINDS).optional(),
  issuedByLabel: z.string().trim().max(160).optional(),
  issuedOn: z.coerce.date().optional(),
});

export const timelineQuerySchema = careTargetSchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  kinds: z.array(z.enum(["APPOINTMENT", "TELECONSULTATION", "ADMISSION", "DISCHARGE", "LAB_REPORT", "IMAGING", "PRESCRIPTION_ISSUED", "MEDICATION_STARTED", "MEDICATION_STOPPED", "VACCINATION", "SCREENING", "ALLERGY_RECORDED", "DIAGNOSIS_RECORDED", "DOCUMENT_ADDED", "DEVICE_IMPORT", "CARE_PROGRAM_ENROLLED", "WELLNESS_GOAL_SET", "SUPPORT_TICKET", "OTHER"])).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export const reminderPreferenceUpdateSchema = z
  .object({
    timezone: timeZoneSchema.optional(),
    channels: z.array(z.enum(CARE_REMINDER_CHANNELS)).optional(),
    quietHoursStart: timeOfDaySchema.nullable().optional(),
    quietHoursEnd: timeOfDaySchema.nullable().optional(),
    defaultLeadMinutes: z.number().int().min(0).max(1440).optional(),
    remindersEnabled: z.boolean().optional(),
  })
  .refine(
    (value) => (value.quietHoursStart === undefined) === (value.quietHoursEnd === undefined) || (value.quietHoursStart === null) === (value.quietHoursEnd === null),
    "Set both ends of the quiet window, or neither.",
  );

/**
 * Creating a reminder.
 *
 * `localTime` is required for every repeating schedule except `INTERVAL`, and
 * `intervalMinutes` for `INTERVAL`. That is checked here so the service never
 * has to decide what a DAILY reminder without a time would mean.
 */
export const reminderCreateSchema = careTargetSchema
  .extend({
    kind: z.enum(REMINDER_KINDS),
    title: shortText(200),
    notes: z.string().trim().max(1000).optional(),
    scheduleKind: z.enum(REMINDER_SCHEDULE_KINDS),
    startAt: z.coerce.date(),
    localTime: timeOfDaySchema.optional(),
    daysOfWeek: z.array(weekdaySchema).max(7).optional(),
    intervalMinutes: z.number().int().positive().max(60 * 24 * 30).optional(),
    timezone: timeZoneSchema.optional(),
    channel: z.enum(CARE_REMINDER_CHANNELS).optional(),
    /**
     * A stable key the client may send so a retried submit does not create a
     * second reminder. Optional because a hand-made reminder has no natural key.
     */
    dedupeKey: z.string().trim().max(200).optional(),
  })
  .refine(
    (value) => value.scheduleKind === "INTERVAL" || value.scheduleKind === "ONE_OFF" || Boolean(value.localTime),
    "Choose a time of day for this reminder.",
  )
  .refine(
    (value) => value.scheduleKind !== "WEEKLY" || (value.daysOfWeek?.length ?? 0) > 0,
    "Choose at least one day of the week.",
  )
  .refine(
    (value) => value.scheduleKind !== "INTERVAL" || Boolean(value.intervalMinutes),
    "Enter how many minutes apart this reminder should repeat.",
  );

export const reminderUpdateSchema = z.object({
  title: shortText(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  localTime: timeOfDaySchema.optional(),
  daysOfWeek: z.array(weekdaySchema).max(7).optional(),
  intervalMinutes: z.number().int().positive().max(60 * 24 * 30).optional(),
  timezone: timeZoneSchema.optional(),
  channel: z.enum(CARE_REMINDER_CHANNELS).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
});

// ---------------------------------------------------------------------------
// Preventive health and care programmes
// ---------------------------------------------------------------------------

export const preventivePlanCreateSchema = careTargetSchema.extend({
  kind: z.enum(PREVENTIVE_CARE_KINDS),
  title: shortText(200),
  /**
   * Required, and deliberately not defaulted. A plan with no attributable
   * source would be ORVEXA issuing screening advice, which it does not do.
   */
  guidanceSourceLabel: shortText(200),
  guidanceNote: z.string().trim().max(1000).optional(),
  dueOn: z.coerce.date().optional(),
});

export const preventivePlanUpdateSchema = z.object({
  kind: z.enum(PREVENTIVE_CARE_KINDS).optional(),
  title: shortText(200).optional(),
  guidanceSourceLabel: shortText(200).optional(),
  guidanceNote: z.string().trim().max(1000).optional(),
  dueOn: z.coerce.date().optional(),
  status: z.enum(PREVENTIVE_CARE_STATUSES).optional(),
  /** Set when a status change is discharged by a record, e.g. an immunisation. */
  completedRefType: z.string().trim().max(80).optional(),
  completedRefId: idSchema.optional(),
});

export const careProgramEnrollSchema = careTargetSchema.extend({
  kind: z.enum(CARE_PROGRAM_KINDS),
  title: shortText(200),
  coordinatorLabel: z.string().trim().max(200).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const careProgramUpdateSchema = z.object({
  title: shortText(200).optional(),
  coordinatorLabel: z.string().trim().max(200).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().trim().max(2000).optional(),
  status: z.enum(CARE_PROGRAM_STATUSES).optional(),
});

// ---------------------------------------------------------------------------
// Medicines
// ---------------------------------------------------------------------------

export const medicationScheduleCreateSchema = careTargetSchema.extend({
  medicineName: shortText(200),
  strengthLabel: z.string().trim().max(80).optional(),
  dosageForm: z.string().trim().max(80).optional(),
  doseLabel: shortText(80),
  frequencyLabel: shortText(80),
  localTimes: z.array(timeOfDaySchema).min(1, "Add at least one time of day."),
  timezone: timeZoneSchema.optional(),
  startOn: z.coerce.date(),
  endOn: z.coerce.date().optional(),
  instructions: z.string().trim().max(1000).optional(),
  prescriberLabel: z.string().trim().max(160).optional(),
});

export const medicationScheduleUpdateSchema = z.object({
  medicineName: shortText(200).optional(),
  strengthLabel: z.string().trim().max(80).optional(),
  dosageForm: z.string().trim().max(80).optional(),
  doseLabel: shortText(80).optional(),
  frequencyLabel: shortText(80).optional(),
  localTimes: z.array(timeOfDaySchema).min(1).optional(),
  timezone: timeZoneSchema.optional(),
  startOn: z.coerce.date().optional(),
  endOn: z.coerce.date().optional(),
  instructions: z.string().trim().max(1000).optional(),
  prescriberLabel: z.string().trim().max(160).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(),
});

/** Stopping a prescribed medicine: the person records a stop, the app does not rewrite it. */
export const medicationScheduleStopSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const medicationDoseLogSchema = z.object({
  scheduledFor: z.coerce.date(),
  status: z.enum(MEDICATION_DOSE_STATUSES),
  takenAt: z.coerce.date().optional(),
  actualDoseLabel: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Wellness
// ---------------------------------------------------------------------------

/**
 * A wellness observation.
 *
 * A value or a note is required, never both empty: a row with neither would
 * render as a blank reading. `valueNumeric` is a number here and a `Decimal` in
 * the database; the service converts, so a client can never post a string that
 * Prisma would coerce into something surprising.
 */
export const wellnessEntryCreateSchema = careTargetSchema
  .extend({
    category: z.enum(WELLNESS_CATEGORIES),
    unit: z.enum(WELLNESS_UNITS).default("NONE"),
    valueNumeric: z.number().finite().nonnegative().max(1_000_000).optional(),
    valueText: z.string().trim().max(500).optional(),
    recordedAt: z.coerce.date(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) => value.valueNumeric !== undefined || Boolean(value.valueText),
    "Enter a measurement or a note.",
  );

export const wellnessEntryUpdateSchema = z.object({
  valueNumeric: z.number().finite().nonnegative().max(1_000_000).optional(),
  valueText: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const wellnessGoalCreateSchema = careTargetSchema.extend({
  category: z.enum(WELLNESS_CATEGORIES),
  unit: z.enum(WELLNESS_UNITS),
  targetValue: z.number().finite().positive().max(1_000_000),
  cadence: z.enum(WELLNESS_GOAL_CADENCES).default("DAILY"),
  title: shortText(200),
  startOn: z.coerce.date(),
  endOn: z.coerce.date().optional(),
});

export const wellnessGoalUpdateSchema = z.object({
  targetValue: z.number().finite().positive().max(1_000_000).optional(),
  cadence: z.enum(WELLNESS_GOAL_CADENCES).optional(),
  title: shortText(200).optional(),
  status: z.enum(["ACTIVE", "ACHIEVED", "ARCHIVED"]).optional(),
  endOn: z.coerce.date().optional(),
});

// ---------------------------------------------------------------------------
// Health devices
// ---------------------------------------------------------------------------

/**
 * Starting a connection.
 *
 * There is no field for a token, a refresh secret or an authorisation code.
 * ORVEXA stores a label for the external account and nothing that could be used
 * to act as the person somewhere else.
 */
export const deviceConnectionCreateSchema = z.object({
  provider: z.enum(HEALTH_DEVICE_PROVIDERS),
  externalAccountLabel: z.string().trim().max(200).optional(),
  scopes: z.array(z.string().trim().max(80)).max(20).default([]),
});

/**
 * One manual import, already parsed by the caller.
 *
 * The measurements arrive as plain readings with their own timestamps, which is
 * what an export file contains. The service stamps them `DEVICE_IMPORTED` and
 * links each one to the sync row, so an imported value can always be traced.
 */
export const deviceImportSchema = z.object({
  connectionId: idSchema,
  windowStart: z.coerce.date().optional(),
  windowEnd: z.coerce.date().optional(),
  measurements: z
    .array(
      z.object({
        category: z.enum(WELLNESS_CATEGORIES),
        unit: z.enum(WELLNESS_UNITS).default("NONE"),
        valueNumeric: z.number().finite().nonnegative().max(1_000_000).optional(),
        valueText: z.string().trim().max(500).optional(),
        recordedAt: z.coerce.date(),
      }),
    )
    .max(5000)
    .default([]),
});

// ---------------------------------------------------------------------------
// Care services
// ---------------------------------------------------------------------------

export const careServiceListingCreateSchema = z.object({
  category: z.enum(CARE_SERVICE_CATEGORIES),
  title: shortText(200),
  summary: z.string().trim().max(400).optional(),
  description: z.string().trim().max(4000).optional(),
  deliveryMode: z.enum(CARE_SERVICE_DELIVERY_MODES),
  priceFromPaise: z.number().int().nonnegative().max(100_000_000).optional(),
  city: z.string().trim().max(120).optional(),
  serviceAreas: z.array(z.string().trim().max(120)).max(50).default([]),
  providerLabel: shortText(200),
  languagesOffered: z.array(z.enum(SUPPORTED_LANGUAGES)).default([]),
});

export const careServiceListingUpdateSchema = careServiceListingCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const careServiceSearchSchema = z.object({
  category: z.enum(CARE_SERVICE_CATEGORIES).optional(),
  deliveryMode: z.enum(CARE_SERVICE_DELIVERY_MODES).optional(),
  city: z.string().trim().max(120).optional(),
  language: z.enum(SUPPORTED_LANGUAGES).optional(),
  query: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

/**
 * Requesting a service.
 *
 * `idempotencyKey` is required and unique per requester, so a double submit
 * cannot raise two requests — which matters more here than usual, because the
 * provider acts on it.
 */
export const careServiceRequestCreateSchema = careTargetSchema.extend({
  listingId: idSchema,
  preferredAt: z.coerce.date().optional(),
  addressLine: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: shortText(80),
});

export const careServiceRequestStatusSchema = z.object({
  status: z.enum(CARE_SERVICE_REQUEST_STATUSES),
  providerResponse: z.string().trim().max(1000).optional(),
  scheduledFor: z.coerce.date().optional(),
});

// ---------------------------------------------------------------------------
// Mental wellness, education and platform content
// ---------------------------------------------------------------------------

export const mentalWellnessResourceCreateSchema = z.object({
  kind: z.enum(MENTAL_WELLNESS_RESOURCE_KINDS),
  title: shortText(200),
  summary: shortText(600),
  bodyMarkdown: z.string().max(40_000).optional(),
  language: z.enum(SUPPORTED_LANGUAGES).default("ENGLISH"),
  helplineNumber: z.string().trim().max(40).optional(),
  helplineHours: z.string().trim().max(120).optional(),
  externalUrl: z.string().url().max(400).optional(),
  isCrisisResource: z.boolean().default(false),
  reviewedByLabel: z.string().trim().max(200).optional(),
});

export const mentalWellnessResourceUpdateSchema = mentalWellnessResourceCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const educationResourceCreateSchema = z.object({
  category: z.enum(EDUCATION_RESOURCE_CATEGORIES),
  language: z.enum(SUPPORTED_LANGUAGES).default("ENGLISH"),
  title: shortText(200),
  summary: shortText(600),
  bodyMarkdown: z.string().min(1).max(80_000),
  readingMinutes: z.number().int().min(1).max(120).optional(),
  /** Required: ORVEXA does not publish unattributed clinical text. */
  reviewedByLabel: shortText(200),
  reviewedOn: z.coerce.date().optional(),
});

export const educationResourceUpdateSchema = educationResourceCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Feedback and support
// ---------------------------------------------------------------------------

export const feedbackSubmitSchema = z
  .object({
    subject: z.enum(SERVICE_FEEDBACK_SUBJECTS),
    subjectRefId: idSchema.optional(),
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.rating !== undefined || Boolean(value.comment), "Add a rating, a comment, or both.");

export const feedbackStatusSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED", "DISMISSED"]),
  resolutionNote: z.string().trim().max(2000).optional(),
});

export const supportTicketCreateSchema = z.object({
  category: z.enum(SUPPORT_TICKET_CATEGORIES),
  severity: z.enum(SUPPORT_TICKET_SEVERITIES).default("NORMAL"),
  subject: shortText(200),
  description: longText(6000),
});

export const supportTicketMessageSchema = z.object({
  body: longText(6000),
  isInternal: z.boolean().default(false),
});

export const supportTicketStatusSchema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES),
  resolutionNote: z.string().trim().max(2000).optional(),
  assignedToLabel: z.string().trim().max(200).optional(),
});

// ---------------------------------------------------------------------------
// Inferred types, so callers do not restate the shapes
// ---------------------------------------------------------------------------

export type FamilyMemberCreateInput = z.infer<typeof familyMemberCreateSchema>;
export type CaregiverInviteInput = z.infer<typeof caregiverInviteSchema>;
export type AllergyCreateInput = z.infer<typeof allergyCreateSchema>;
export type ImmunizationCreateInput = z.infer<typeof immunizationCreateSchema>;
export type MedicalHistoryCreateInput = z.infer<typeof medicalHistoryCreateSchema>;
export type HealthDocumentCreateInput = z.infer<typeof healthDocumentCreateSchema>;
export type ReminderCreateInput = z.infer<typeof reminderCreateSchema>;
export type ReminderPreferenceUpdateInput = z.infer<typeof reminderPreferenceUpdateSchema>;
export type PreventivePlanCreateInput = z.infer<typeof preventivePlanCreateSchema>;
export type CareProgramEnrollInput = z.infer<typeof careProgramEnrollSchema>;
export type MedicationScheduleCreateInput = z.infer<typeof medicationScheduleCreateSchema>;
export type MedicationDoseLogInput = z.infer<typeof medicationDoseLogSchema>;
export type WellnessEntryCreateInput = z.infer<typeof wellnessEntryCreateSchema>;
export type WellnessGoalCreateInput = z.infer<typeof wellnessGoalCreateSchema>;
export type DeviceImportInput = z.infer<typeof deviceImportSchema>;
export type CareServiceRequestCreateInput = z.infer<typeof careServiceRequestCreateSchema>;
export type SupportTicketCreateInput = z.infer<typeof supportTicketCreateSchema>;
