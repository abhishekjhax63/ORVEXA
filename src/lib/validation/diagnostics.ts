import { z } from "zod";

import type {
  DiagnosticBookingEventType,
  DiagnosticBookingMode,
  DiagnosticBookingStatus,
  DiagnosticSampleType,
  LabReportAccessAction,
  LabReportDocumentKind,
  LabReportDocumentStatus,
  LabReportStatus,
  LabResultFlag,
} from "@prisma/client";

/**
 * Validation for everything that reaches the diagnostics domain.
 *
 * The enum value lists are declared here as literal tuples and checked against
 * the Prisma enums with `satisfies`, so the compiler fails if the database and
 * the API drift apart — while the `import type` keeps Prisma out of any client
 * bundle that also loads these schemas for inline validation.
 *
 * ## Money
 *
 * A price crossing this boundary is **paise**, a whole number, exactly as in
 * `src/lib/validation/insurance.ts`. A booking is never handed a total: the
 * client names tests and a mode, and the server reads the price from the
 * laboratory's own offer. `DiagnosticBooking.testsSubtotalInr` and
 * `estimatedTotalInr` are therefore computed by `src/lib/diagnostics/bookings.ts`,
 * never accepted from a form.
 *
 * ## Results
 *
 * No schema here lets the platform author a result. A report line carries the
 * laboratory's own analyte, value and reference range; publishing requires an
 * authenticator's name and registration. Nothing in ORVEXA may synthesise one.
 */

// ---------------------------------------------------------------------------
// Literal enum tuples
// ---------------------------------------------------------------------------

export const DIAGNOSTIC_SAMPLE_TYPES = [
  "BLOOD",
  "URINE",
  "STOOL",
  "SALIVA",
  "SWAB",
  "TISSUE",
  "IMAGING",
  "OTHER",
] as const satisfies readonly DiagnosticSampleType[];

export const DIAGNOSTIC_BOOKING_MODES = [
  "WALK_IN",
  "HOME_COLLECTION",
] as const satisfies readonly DiagnosticBookingMode[];

export const DIAGNOSTIC_BOOKING_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "SAMPLE_COLLECTED",
  "PROCESSING",
  "REPORT_READY",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const satisfies readonly DiagnosticBookingStatus[];

export const DIAGNOSTIC_BOOKING_EVENT_TYPES = [
  "REQUESTED",
  "CONFIRMED",
  "REJECTED",
  "RESCHEDULED",
  "CANCELLED",
  "SAMPLE_COLLECTED",
  "PROCESSING_STARTED",
  "REPORT_PUBLISHED",
  "COMPLETED",
  "NO_SHOW",
  "NOTE",
] as const satisfies readonly DiagnosticBookingEventType[];

export const LAB_REPORT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "AMENDED",
  "WITHDRAWN",
] as const satisfies readonly LabReportStatus[];

/** `AMENDED` is written by the amend service, never chosen directly. */
export const SETTABLE_LAB_REPORT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "WITHDRAWN",
] as const satisfies readonly LabReportStatus[];

export const LAB_REPORT_DOCUMENT_KINDS = [
  "REPORT",
  "SCAN",
  "AMENDMENT",
] as const satisfies readonly LabReportDocumentKind[];

export const LAB_REPORT_DOCUMENT_STATUSES = [
  "PENDING",
  "READY",
  "REJECTED",
  "DELETED",
] as const satisfies readonly LabReportDocumentStatus[];

export const LAB_RESULT_FLAGS = [
  "NORMAL",
  "HIGH",
  "LOW",
  "CRITICAL_HIGH",
  "CRITICAL_LOW",
  "ABNORMAL",
  "INCONCLUSIVE",
  "UNKNOWN",
] as const satisfies readonly LabResultFlag[];

export const LAB_REPORT_ACCESS_ACTIONS = [
  "UPLOADED",
  "PUBLISHED",
  "VIEWED",
  "DOWNLOADED",
  "LINK_ISSUED",
  "AMENDED",
  "WITHDRAWN",
  "SHARED",
  "SHARE_REVOKED",
] as const satisfies readonly LabReportAccessAction[];

/**
 * The booking transitions a laboratory may record through the portal. The
 * patient's own actions (`CANCELLED`, `RESCHEDULED`) have their own schemas, and
 * `REPORT_READY`/`COMPLETED` are written by the report service only when a
 * report is actually published — a partner cannot type a status that implies a
 * result exists.
 */
export const LAB_RECORDABLE_BOOKING_STATUSES = [
  "CONFIRMED",
  "SAMPLE_COLLECTED",
  "PROCESSING",
  "NO_SHOW",
] as const satisfies readonly DiagnosticBookingStatus[];

export const DIAGNOSTIC_SORT_OPTIONS = ["relevance", "price-asc", "price-desc", "name"] as const;
export type DiagnosticSortOption = (typeof DIAGNOSTIC_SORT_OPTIONS)[number];

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

/** A whole number of paise. Zero is allowed only where a zero is meaningful. */
const paise = z.coerce.number().int().min(0).max(10_000_000_000);

const positivePaise = paise.refine((value) => value > 0, "Enter an amount greater than zero.");

const optionalPaise = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(0).max(10_000_000_000).optional(),
);

const optionalPositiveInt = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(0).max(1_000_000).optional(),
);

/**
 * An ISO-8601 instant. A booking time is an instant and not a calendar date, so
 * this is deliberately stricter than the insurance `dateOnly` helper.
 */
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
    (value) => (typeof value === "string" ? value.split(",").map((part) => part.trim()).filter(Boolean) : value),
    z.array(z.string().trim().min(1).max(160)).max(60),
  )
  .optional()
  .default([]);

const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const indianPhoneSchema = z
  .string()
  .trim()
  .min(10)
  .max(20)
  .refine((value) => {
    const digits = value.replace(/[\s-()]/g, "");
    return /^(?:\+91|0091|91|0)?[6-9]\d{9}$/.test(digits);
  }, "Enter a valid Indian mobile number, for example +91 98450 12093.");

const indianPostalCodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit postal (PIN) code, for example 560038.");

/** A booking reference, e.g. ORX-DX-4M9K2P. */
export const diagnosticReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^ORX-DX-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, "That is not a valid diagnostic booking reference.");

/** A report reference, e.g. ORX-RP-4M9K2P. */
export const labReportReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^ORX-RP-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, "That is not a valid report reference.");

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export const diagnosticSearchSchema = z.object({
  query: optionalText(120),
  categorySlug: optionalText(80),
  city: optionalText(120),
  postalCode: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      indianPostalCodeSchema.optional(),
    ),
  mode: z.enum(DIAGNOSTIC_BOOKING_MODES).optional(),
  sort: z.enum(DIAGNOSTIC_SORT_OPTIONS).optional().default("relevance"),
  page: z.coerce.number().int().min(1).max(50).optional().default(1),
});

export type DiagnosticSearchInput = z.infer<typeof diagnosticSearchSchema>;

// ---------------------------------------------------------------------------
// Laboratory profile (partner)
// ---------------------------------------------------------------------------

export const labProfileSchema = z.object({
  legalName: requiredText(200, 3),
  tradeName: optionalText(200),
  accreditationNumber: optionalText(80),
  accreditationBody: optionalText(120),
  registrationNumber: optionalText(80),
  gstin: optionalText(20),
  pathologistName: optionalText(160),
  pathologistRegistrationNumber: optionalText(80),
  pathologistCouncil: optionalText(120),
  acceptsHomeCollection: checkboxBoolean.optional().default(false),
  homeCollectionRadiusKm: optionalPositiveInt,
  coverageCities: stringList,
  coveragePostalCodes: stringList,
  sampleCollectionFeePaise: optionalPaise,
  standardTurnaroundHours: optionalPositiveInt,
  /** Explicit acknowledgement of the diagnostic-regulation statement. */
  complianceAcknowledged: checkboxBoolean.optional().default(false),
  compliancePolicyVersion: optionalText(80),
});

export type LabProfileInput = z.infer<typeof labProfileSchema>;

// ---------------------------------------------------------------------------
// Laboratory offers (partner)
// ---------------------------------------------------------------------------

/**
 * A partner writes its own price for one catalogue test. The price is the
 * partner's; the platform stores it and displays it, and the booking service
 * copies it into the booking as a snapshot. Nothing here lets a partner touch
 * the catalogue test itself.
 */
export const labOfferSchema = z.object({
  offerId: optionalId,
  testId: requiredText(64, 1),
  pricePaise: positivePaise,
  homeCollectionFeePaise: optionalPaise,
  turnaroundHours: optionalPositiveInt,
  homeCollectionAvailable: checkboxBoolean.optional().default(false),
  isActive: checkboxBoolean.optional().default(true),
  notes: optionalText(400),
});

export type LabOfferInput = z.infer<typeof labOfferSchema>;

// ---------------------------------------------------------------------------
// Booking (patient)
// ---------------------------------------------------------------------------

export const diagnosticBookingSchema = z
  .object({
    labProfileId: requiredText(64, 1),
    /** At least one test. The server prices each from the laboratory's offer. */
    testIds: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
    mode: z.enum(DIAGNOSTIC_BOOKING_MODES),
    scheduledAt: isoInstant,
    facilityId: optionalId,
    familyMemberId: optionalId,
    patientNotes: optionalText(1000),
    // Home-collection fields. Required when mode is HOME_COLLECTION, ignored
    // otherwise; the refinement below enforces exactly that.
    collectionContactName: optionalText(120),
    collectionPhone: z
      .preprocess(
        (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
        indianPhoneSchema.optional(),
      ),
    collectionAddressId: optionalId,
    collectionAddressText: optionalText(400),
    collectionCity: optionalText(120),
    collectionPostalCode: z
      .preprocess(
        (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
        indianPostalCodeSchema.optional(),
      ),
    /** Explicit, per-booking consent to collect a sample and store the report. */
    consentAcknowledged: checkboxBoolean,
    consentPolicyVersion: requiredText(80, 1),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .refine(
    (value) =>
      value.mode !== "HOME_COLLECTION" ||
      Boolean(value.collectionAddressId) ||
      Boolean(value.collectionAddressText && value.collectionCity && value.collectionPostalCode),
    {
      message:
        "A home collection needs either a saved address or a full address with city and postal code.",
      path: ["collectionAddressText"],
    },
  )
  .refine(
    (value) => value.mode !== "HOME_COLLECTION" || Boolean(value.collectionContactName && value.collectionPhone),
    { message: "A home collection needs a contact name and phone number.", path: ["collectionPhone"] },
  );

export type DiagnosticBookingInput = z.infer<typeof diagnosticBookingSchema>;

export const diagnosticBookingRescheduleSchema = z.object({
  bookingId: requiredText(64, 1),
  scheduledAt: isoInstant,
  reason: optionalText(500),
});

export type DiagnosticBookingRescheduleInput = z.infer<typeof diagnosticBookingRescheduleSchema>;

export const diagnosticBookingCancelSchema = z.object({
  bookingId: requiredText(64, 1),
  /** Required: a cancellation the patient cannot explain is not actionable. */
  reason: requiredText(500, 4),
});

export type DiagnosticBookingCancelInput = z.infer<typeof diagnosticBookingCancelSchema>;

export const diagnosticBookingStatusSchema = z.object({
  bookingId: requiredText(64, 1),
  status: z.enum(LAB_RECORDABLE_BOOKING_STATUSES),
  note: optionalText(500),
});

export type DiagnosticBookingStatusInput = z.infer<typeof diagnosticBookingStatusSchema>;

// ---------------------------------------------------------------------------
// Reports (partner writes, patient reads)
// ---------------------------------------------------------------------------

export const labReportCreateSchema = z.object({
  bookingId: requiredText(64, 1),
  interpretation: optionalText(4000),
});

export type LabReportCreateInput = z.infer<typeof labReportCreateSchema>;

/** One analyte line, as the laboratory entered it. */
export const labReportResultSchema = z.object({
  testId: optionalId,
  analyteName: requiredText(160, 1),
  value: optionalText(120),
  unit: optionalText(60),
  referenceRange: optionalText(160),
  flag: z.enum(LAB_RESULT_FLAGS).optional().default("UNKNOWN"),
  method: optionalText(160),
  comment: optionalText(1000),
});

export type LabReportResultInput = z.infer<typeof labReportResultSchema>;

export const labReportResultsSchema = z.object({
  reportId: requiredText(64, 1),
  results: z.array(labReportResultSchema).min(1).max(200),
});

export type LabReportResultsInput = z.infer<typeof labReportResultsSchema>;

/**
 * Publishing is the clinical act. It requires the authenticator's own name and
 * registration number — a report cannot become visible to a patient without
 * both, and the timestamp is stamped by the server, not supplied by the client.
 */
export const labReportPublishSchema = z.object({
  reportId: requiredText(64, 1),
  authenticatedByName: requiredText(160, 3),
  authenticatedByRegistration: requiredText(80, 3),
  reportedAt: optionalIsoInstant,
  sampleCollectedAt: optionalIsoInstant,
  interpretation: optionalText(4000),
});

export type LabReportPublishInput = z.infer<typeof labReportPublishSchema>;

export const labReportAmendSchema = z.object({
  reportId: requiredText(64, 1),
  /** Required: a correction the laboratory cannot explain is not a correction. */
  reason: requiredText(500, 4),
});

export type LabReportAmendInput = z.infer<typeof labReportAmendSchema>;

export const labReportWithdrawSchema = z.object({
  reportId: requiredText(64, 1),
  reason: requiredText(500, 4),
});

export type LabReportWithdrawInput = z.infer<typeof labReportWithdrawSchema>;

export const labReportDocumentMetadataSchema = z.object({
  reportId: requiredText(64, 1),
  kind: z.enum(LAB_REPORT_DOCUMENT_KINDS).optional().default("REPORT"),
  fileName: requiredText(200, 1),
  mimeType: requiredText(120, 3),
  sizeBytes: z.coerce.number().int().min(1).max(50 * 1024 * 1024),
  checksumSha256: optionalText(64),
});

export type LabReportDocumentMetadataInput = z.infer<typeof labReportDocumentMetadataSchema>;

// ---------------------------------------------------------------------------
// Report sharing
// ---------------------------------------------------------------------------

export const labReportShareSchema = z.object({
  reportId: requiredText(64, 1),
  sharedWithEmail: z.string().trim().email().max(200).optional(),
  sharedWithLabel: optionalText(160),
  canDownload: checkboxBoolean.optional().default(false),
  /** 1–168 hours. A share link that never expires is not a share link. */
  expiresInHours: z.coerce.number().int().min(1).max(168).optional().default(72),
});

export type LabReportShareInput = z.infer<typeof labReportShareSchema>;

export const labReportShareRevokeSchema = z.object({
  shareId: requiredText(64, 1),
});

/** Handing a report's file to the patient's own account, or downloading it. */
export const labReportDocumentLinkSchema = z.object({
  download: checkboxBoolean.optional().default(false),
});

/**
 * Exchanging an authenticated report with a recipient's system.
 *
 * The recipient is named by the patient, and the strongest claim the platform
 * makes is that the recipient's endpoint accepted the transport. Nothing here
 * lets a client assert that a clinician has read anything.
 */
export const labReportExchangeSchema = z.object({
  reportId: requiredText(64, 1),
  recipientName: requiredText(160, 2),
  recipientReference: requiredText(160, 2),
  recipientKind: z.enum(["CLINICIAN", "FACILITY", "SYSTEM"]).optional().default("CLINICIAN"),
});

export type LabReportExchangeInput = z.infer<typeof labReportExchangeSchema>;

// ---------------------------------------------------------------------------
// Catalogue administration (platform admin)
// ---------------------------------------------------------------------------

export const diagnosticCategorySchema = z.object({
  id: optionalId,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens."),
  name: requiredText(120, 2),
  description: optionalText(600),
  iconKey: optionalText(60),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional().default(0),
  isActive: checkboxBoolean.optional().default(true),
});

export type DiagnosticCategoryInput = z.infer<typeof diagnosticCategorySchema>;

export const diagnosticTestSchema = z.object({
  id: optionalId,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens."),
  name: requiredText(200, 3),
  shortName: optionalText(80),
  categorySlug: requiredText(80, 2),
  description: optionalText(4000),
  purposeSummary: optionalText(1000),
  preparationInstructions: optionalText(2000),
  preparationRequired: checkboxBoolean.optional().default(false),
  fastingRequired: checkboxBoolean.optional().default(false),
  fastingHours: optionalPositiveInt,
  sampleTypes: z.array(z.enum(DIAGNOSTIC_SAMPLE_TYPES)).min(1).max(8),
  method: optionalText(200),
  standardTurnaroundHours: optionalPositiveInt,
  homeCollectionSupported: checkboxBoolean.optional().default(false),
  pediatricSafe: checkboxBoolean.optional(),
  riskNotes: optionalText(1000),
  isPanel: checkboxBoolean.optional().default(false),
  panelComponents: stringList,
  listable: checkboxBoolean.optional().default(true),
  nonListableReason: optionalText(400),
});

export type DiagnosticTestInput = z.infer<typeof diagnosticTestSchema>;

export const labVerificationSchema = z.object({
  labProfileId: requiredText(64, 1),
  verificationStatus: z.enum(["VERIFIED", "REJECTED", "SUSPENDED", "PENDING"]),
  /** Whether the laboratory may publish reports. Set by a reviewer only. */
  canPublishReports: checkboxBoolean.optional().default(false),
  verificationNotes: optionalText(2000),
});

export type LabVerificationInput = z.infer<typeof labVerificationSchema>;
