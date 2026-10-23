import { z } from "zod";

import type {
  ClaimDecision,
  ClaimDocumentKind,
  ClaimStatus,
  ClaimType,
  EligibilityCheckStatus,
  InsuranceCoverType,
  InsurerIntegrationMode,
  InsurancePolicyDocumentKind,
  InsuranceProductSource,
  NetworkEntrySource,
  PartnerApplicationStatus,
  PolicyStatus,
  PreAuthStatus,
  SettlementStatus,
  VerificationState,
} from "@prisma/client";

/**
 * Validation for everything that reaches the insurance domain.
 *
 * The enum value lists are declared here as literal tuples and checked against
 * the Prisma enums with `satisfies`, so the compiler fails if the database and
 * the API drift apart — while the `import type` keeps Prisma out of the client
 * bundle that also loads these schemas for inline validation.
 *
 * ## Amounts
 *
 * Every monetary field crossing this boundary is **paise**, a whole number.
 * The database columns are named `...Inr` and hold whole rupees, so the server
 * modules convert at the persistence boundary using `src/lib/insurance/money.ts`.
 * Keeping one unit at the boundary means a schema can never be handed a value
 * whose scale is ambiguous.
 */

// ---------------------------------------------------------------------------
// Enum tuples
// ---------------------------------------------------------------------------

export const CLAIM_TYPES = [
  "CASHLESS_PRE_AUTHORIZATION",
  "CASHLESS",
  "REIMBURSEMENT",
] as const satisfies readonly ClaimType[];

export const CLAIM_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "AWAITING_INFORMATION",
  "UNDER_REVIEW",
  "PRE_AUTH_PENDING",
  "PRE_AUTH_APPROVED",
  "PRE_AUTH_PARTIALLY_APPROVED",
  "PRE_AUTH_REJECTED",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "SETTLED",
  "CLOSED",
  "WITHDRAWN",
] as const satisfies readonly ClaimStatus[];

export const CLAIM_DECISIONS = [
  "PENDING",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "QUERY_RAISED",
  "WITHDRAWN",
] as const satisfies readonly ClaimDecision[];

/** Decisions a reviewer may record. `PENDING` is never recorded as a decision. */
export const RECORDABLE_CLAIM_DECISIONS = [
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "QUERY_RAISED",
  "WITHDRAWN",
] as const satisfies readonly ClaimDecision[];

export const CLAIM_DOCUMENT_KINDS = [
  "POLICY_COPY",
  "INSURED_ID_PROOF",
  "HOSPITAL_ESTIMATE",
  "PRE_AUTH_FORM",
  "DISCHARGE_SUMMARY",
  "INVESTIGATION_REPORT",
  "PRESCRIPTION",
  "HOSPITAL_INVOICE",
  "PAYMENT_PROOF",
  "INSURER_CORRESPONDENCE",
  "OTHER",
] as const satisfies readonly ClaimDocumentKind[];

export const POLICY_DOCUMENT_KINDS = [
  "POLICY_SCHEDULE",
  "CERTIFICATE",
  "PREMIUM_RECEIPT",
  "ENDORSEMENT",
  "ID_PROOF",
  "OTHER",
] as const satisfies readonly InsurancePolicyDocumentKind[];

export const PRE_AUTH_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "QUERY_RAISED",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "EXPIRED",
  "WITHDRAWN",
] as const satisfies readonly PreAuthStatus[];

export const SETTLEMENT_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "SETTLED",
  "PARTIALLY_SETTLED",
  "FAILED",
] as const satisfies readonly SettlementStatus[];

export const ELIGIBILITY_STATUSES = [
  "REQUESTED",
  "ACKNOWLEDGED",
  "RESPONDED",
  "NOT_SUPPORTED",
  "FAILED",
] as const satisfies readonly EligibilityCheckStatus[];

export const POLICY_STATUSES = [
  "ACTIVE",
  "EXPIRED",
  "CANCELLED",
  "SUSPENDED",
  "LAPSED",
  "UNKNOWN",
] as const satisfies readonly PolicyStatus[];

export const INSURANCE_COVER_TYPES = [
  "INDIVIDUAL",
  "FAMILY_FLOATER",
  "GROUP_EMPLOYER",
  "SENIOR_CITIZEN",
  "MATERNITY",
  "CRITICAL_ILLNESS",
  "TOP_UP",
  "SUPER_TOP_UP",
  "PERSONAL_ACCIDENT",
  "OTHER",
] as const satisfies readonly InsuranceCoverType[];

export const INSURER_INTEGRATION_MODES = [
  "API",
  "PARTNER_PORTAL",
  "MANUAL_OFFLINE",
  "NONE",
] as const satisfies readonly InsurerIntegrationMode[];

export const INSURANCE_PRODUCT_SOURCES = [
  "INSURER_PUBLISHED",
  "INSURER_API",
  "PARTNER_CONFIRMED",
  "PLATFORM_UNVERIFIED",
] as const satisfies readonly InsuranceProductSource[];

export const NETWORK_ENTRY_SOURCES = [
  "INSURER_LIST",
  "INSURER_API",
  "PARTNER_CONFIRMED",
  "HOSPITAL_DECLARED",
  "PLATFORM_UNVERIFIED",
] as const satisfies readonly NetworkEntrySource[];

export const VERIFICATION_STATES = [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "SUSPENDED",
] as const satisfies readonly VerificationState[];

export const PARTNER_APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const satisfies readonly PartnerApplicationStatus[];

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

/** `YYYY-MM-DD`, converted to a UTC midnight `Date` so comparisons are stable. */
const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date as YYYY-MM-DD.")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((value) => !Number.isNaN(value.getTime()), "That is not a valid date.");

const optionalDate = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  dateOnly.optional(),
);

const stringList = z
  .preprocess(
    (value) => (typeof value === "string" ? value.split(",").map((part) => part.trim()).filter(Boolean) : value),
    z.array(z.string().trim().min(1).max(160)).max(40),
  )
  .optional()
  .default([]);

const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => (value === "" ? undefined : value));

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export const policyInputSchema = z
  .object({
    id: optionalId,
    familyMemberId: optionalId,
    insurerId: optionalId,
    insurerName: requiredText(160),
    productId: optionalId,
    productName: optionalText(160),
    policyNumber: requiredText(80, 3),
    memberId: optionalText(80),
    policyHolderName: requiredText(160),
    coveredMemberNames: stringList,
    coverType: z.enum(INSURANCE_COVER_TYPES).optional().default("INDIVIDUAL"),
    sumInsuredPaise: optionalPaise,
    premiumPaise: optionalPaise,
    premiumFrequency: optionalText(40),
    startDate: optionalDate,
    renewalDate: optionalDate,
    roomRentLimitNote: optionalText(300),
    coPaymentNote: optionalText(300),
    deductiblePaise: optionalPaise,
    waitingPeriodNote: optionalText(300),
    exclusions: stringList,
    // A policyholder may describe the standing of their own policy, but this is
    // self-declared information and is displayed as such. Verification source is
    // never accepted from a form: see `src/lib/insurance/policies.ts`.
    status: z.enum(POLICY_STATUSES).optional().default("UNKNOWN"),
    consentAcknowledged: checkboxBoolean.optional().default(false),
  })
  .refine(
    (value) => !(value.startDate && value.renewalDate) || value.renewalDate.getTime() >= value.startDate.getTime(),
    { message: "The renewal date cannot be before the policy started.", path: ["renewalDate"] },
  );

export type PolicyInput = z.infer<typeof policyInputSchema>;

export const policyDocumentMetadataSchema = z.object({
  policyId: requiredText(64, 1),
  kind: z.enum(POLICY_DOCUMENT_KINDS).optional().default("POLICY_SCHEDULE"),
  fileName: requiredText(200, 1),
  mimeType: requiredText(120, 3),
  sizeBytes: z.coerce.number().int().min(1).max(200 * 1024 * 1024),
});

export type PolicyDocumentMetadata = z.infer<typeof policyDocumentMetadataSchema>;

/** A policy can be compared against others in the wallet, and to products. */
export const policyCompareSchema = z.object({
  policyIds: z.array(z.string().trim().min(1).max(64)).min(1).max(4),
  includeProducts: checkboxBoolean.optional().default(false),
});

// ---------------------------------------------------------------------------
// Network search
// ---------------------------------------------------------------------------

export const networkSearchSchema = z
  .object({
    query: optionalText(120),
    city: optionalText(120),
    postalCode: z
      .string()
      .trim()
      .max(10)
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    insurerId: optionalId,
    page: z.coerce.number().int().min(1).max(200).optional().default(1),
  })
  .refine((value) => Boolean(value.query || value.city || value.postalCode), {
    message: "Enter a hospital, a city or a postal code to search.",
    path: ["query"],
  });

export type NetworkSearch = z.infer<typeof networkSearchSchema>;

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export const claimCreateSchema = z
  .object({
    claimType: z.enum(CLAIM_TYPES),
    policyId: requiredText(64, 1),
    familyMemberId: optionalId,
    hospitalId: optionalId,
    hospitalName: optionalText(200),
    treatmentSummary: optionalText(2000),
    admissionDate: optionalDate,
    dischargeDate: optionalDate,
    diagnosisSummary: optionalText(1000),
    treatingDoctorName: optionalText(160),
    estimatedCostPaise: optionalPaise,
    claimedAmountPaise: optionalPaise,
    consentAcknowledged: checkboxBoolean.optional().default(false),
    consentPolicyVersion: optionalText(60),
  })
  .refine((value) => !(value.admissionDate && value.dischargeDate) || value.dischargeDate.getTime() >= value.admissionDate.getTime(), {
    message: "The discharge date cannot be before the admission date.",
    path: ["dischargeDate"],
  })
  .refine((value) => Boolean(value.hospitalId || value.hospitalName), {
    message: "Name the hospital the treatment took place at.",
    path: ["hospitalName"],
  })
  .refine((value) => value.consentAcknowledged === true, {
    message: "Confirm that your policy details may be shared with the insurer before filing a claim.",
    path: ["consentAcknowledged"],
  });

export type ClaimCreateInput = z.infer<typeof claimCreateSchema>;

export const claimUpdateSchema = z
  .object({
    claimId: requiredText(64, 1),
    treatmentSummary: optionalText(2000),
    hospitalId: optionalId,
    hospitalName: optionalText(200),
    admissionDate: optionalDate,
    dischargeDate: optionalDate,
    diagnosisSummary: optionalText(1000),
    treatingDoctorName: optionalText(160),
    estimatedCostPaise: optionalPaise,
    claimedAmountPaise: optionalPaise,
  })
  .refine((value) => !(value.admissionDate && value.dischargeDate) || value.dischargeDate.getTime() >= value.admissionDate.getTime(), {
    message: "The discharge date cannot be before the admission date.",
    path: ["dischargeDate"],
  });

export type ClaimUpdateInput = z.infer<typeof claimUpdateSchema>;

export const claimWithdrawSchema = z.object({
  claimId: requiredText(64, 1),
  reason: optionalText(300),
});

export const claimQueryAnswerSchema = z.object({
  claimId: requiredText(64, 1),
  queryId: requiredText(64, 1),
  answer: requiredText(2000, 2),
});

export const claimQueryRaiseSchema = z.object({
  claimId: requiredText(64, 1),
  question: requiredText(1000, 2),
  dueDate: optionalDate,
});

export const claimStatusChangeSchema = z.object({
  claimId: requiredText(64, 1),
  next: z.enum(CLAIM_STATUSES),
  note: optionalText(500),
});

export const claimDocumentMetadataSchema = z.object({
  claimId: requiredText(64, 1),
  kind: z.enum(CLAIM_DOCUMENT_KINDS).optional().default("OTHER"),
  fileName: requiredText(200, 1),
  mimeType: requiredText(120, 3),
  sizeBytes: z.coerce.number().int().min(1).max(200 * 1024 * 1024),
  queryId: optionalId,
});

export type ClaimDocumentMetadata = z.infer<typeof claimDocumentMetadataSchema>;

/**
 * A decision the insurer communicated.
 *
 * `attributedTo` is required and cannot be ORVEXA: the whole point of this
 * schema is that a decision without a named source is refused.
 */
export const insurerDecisionSchema = z
  .object({
    claimId: requiredText(64, 1),
    decision: z.enum(RECORDABLE_CLAIM_DECISIONS),
    attributedTo: requiredText(200, 2),
    decidedAt: optionalDate,
    approvedAmountPaise: optionalPaise,
    reason: optionalText(1000),
    referenceNumber: optionalText(120),
  })
  .refine(
    (value) => !["APPROVED", "PARTIALLY_APPROVED"].includes(value.decision) || (value.approvedAmountPaise ?? 0) > 0,
    { message: "Record the amount the insurer approved.", path: ["approvedAmountPaise"] },
  )
  .refine((value) => !["REJECTED", "PARTIALLY_APPROVED"].includes(value.decision) || Boolean(value.reason), {
    message: "Record the reason the insurer gave.",
    path: ["reason"],
  });

export type InsurerDecisionInput = z.infer<typeof insurerDecisionSchema>;

export const settlementRecordSchema = z.object({
  claimId: requiredText(64, 1),
  amountPaise: positivePaise,
  status: z.enum(SETTLEMENT_STATUSES),
  referenceNumber: optionalText(120),
  utrNumber: optionalText(80),
  note: optionalText(500),
});

export type SettlementRecordInput = z.infer<typeof settlementRecordSchema>;

// ---------------------------------------------------------------------------
// Pre-authorisation and eligibility
// ---------------------------------------------------------------------------

export const preAuthRequestSchema = z
  .object({
    policyId: requiredText(64, 1),
    familyMemberId: optionalId,
    claimId: optionalId,
    insurerId: optionalId,
    hospitalId: optionalId,
    hospitalName: requiredText(200),
    plannedAdmissionDate: optionalDate,
    plannedProcedure: requiredText(300, 2),
    treatingDoctorName: optionalText(160),
    treatingDoctorRegistration: optionalText(80),
    requestedAmountPaise: optionalPaise,
    supportingDocumentIds: z.array(z.string().trim().min(1).max(64)).max(20).optional().default([]),
    consentAcknowledged: checkboxBoolean.optional().default(false),
    consentPolicyVersion: optionalText(60),
  })
  .refine((value) => value.consentAcknowledged === true, {
    message: "Confirm that your policy details may be shared with the insurer before filing a pre-authorisation.",
    path: ["consentAcknowledged"],
  });

export type PreAuthRequestInput = z.infer<typeof preAuthRequestSchema>;

/** Statuses a reviewer may move a pre-authorisation into directly. */
export const RECORDABLE_PRE_AUTH_STATUSES = [
  "ACKNOWLEDGED",
  "QUERY_RAISED",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "EXPIRED",
] as const satisfies readonly PreAuthStatus[];

export const preAuthDecisionSchema = z
  .object({
    preAuthId: requiredText(64, 1),
    decision: z.enum(["ACKNOWLEDGED", "QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "EXPIRED"]),
    attributedTo: requiredText(200, 2),
    approvedAmountPaise: optionalPaise,
    reason: optionalText(1000),
    insurerReferenceNumber: optionalText(120),
    validUntil: optionalDate,
  })
  .refine(
    (value) => !["APPROVED", "PARTIALLY_APPROVED"].includes(value.decision) || (value.approvedAmountPaise ?? 0) > 0,
    { message: "Record the amount the insurer approved.", path: ["approvedAmountPaise"] },
  )
  .refine((value) => !["REJECTED", "PARTIALLY_APPROVED"].includes(value.decision) || Boolean(value.reason), {
    message: "Record the reason the insurer gave.",
    path: ["reason"],
  });

export type PreAuthDecisionInput = z.infer<typeof preAuthDecisionSchema>;

export const eligibilityRequestSchema = z.object({
  policyId: requiredText(64, 1),
  familyMemberId: optionalId,
  hospitalId: optionalId,
  hospitalName: optionalText(200),
  plannedProcedure: optionalText(300),
  note: optionalText(500),
});

export type EligibilityRequestInput = z.infer<typeof eligibilityRequestSchema>;

// ---------------------------------------------------------------------------
// Hospital desk
// ---------------------------------------------------------------------------

export const hospitalAccessGrantSchema = z.object({
  claimId: requiredText(64, 1),
  hospitalId: requiredText(64, 1),
  note: optionalText(300),
});

export const hospitalAccessRevokeSchema = z.object({
  claimId: requiredText(64, 1),
  hospitalId: requiredText(64, 1),
  reason: optionalText(300),
});

export const hospitalQueryResponseSchema = z.object({
  claimId: requiredText(64, 1),
  queryId: optionalId,
  responseText: requiredText(2000, 2),
});

// ---------------------------------------------------------------------------
// Insurer desk — products, network, verification
// ---------------------------------------------------------------------------

export const insurerProductSchema = z
  .object({
    id: optionalId,
    insurerId: optionalId,
    productName: requiredText(200),
    slug: optionalText(160),
    coverType: z.enum(INSURANCE_COVER_TYPES).optional().default("INDIVIDUAL"),
    sumInsuredMinPaise: optionalPaise,
    sumInsuredMaxPaise: optionalPaise,
    premiumFromPaise: optionalPaise,
    roomRentLimitNote: optionalText(300),
    coPaymentNote: optionalText(300),
    deductiblePaise: optionalPaise,
    waitingPeriodNote: optionalText(300),
    preExistingWaitingMonths: optionalPositiveInt,
    maternityWaitingMonths: optionalPositiveInt,
    exclusions: stringList,
    inclusions: stringList,
    networkHospitalCount: optionalPositiveInt,
    sourceOfTruth: z.enum(INSURANCE_PRODUCT_SOURCES).optional().default("PLATFORM_UNVERIFIED"),
    sourceReference: optionalText(200),
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
  })
  .refine(
    (value) =>
      !(value.sumInsuredMinPaise !== undefined && value.sumInsuredMaxPaise !== undefined) ||
      value.sumInsuredMaxPaise >= value.sumInsuredMinPaise,
    { message: "The maximum sum insured cannot be below the minimum.", path: ["sumInsuredMaxPaise"] },
  )
  .refine(
    (value) =>
      !(value.effectiveFrom && value.effectiveTo) || value.effectiveTo.getTime() >= value.effectiveFrom.getTime(),
    { message: "The end date cannot be before the start date.", path: ["effectiveTo"] },
  );

export type InsurerProductInput = z.infer<typeof insurerProductSchema>;

export const insurerProductPublishSchema = z.object({
  productId: requiredText(64, 1),
  published: checkboxBoolean.optional().default(false),
});

export const networkEntrySchema = z
  .object({
    id: optionalId,
    insurerId: optionalId,
    hospitalId: optionalId,
    hospitalName: requiredText(200),
    addressLine1: optionalText(200),
    city: requiredText(120),
    state: requiredText(120),
    postalCode: optionalText(10),
    cashlessAvailable: checkboxBoolean.optional().default(false),
    productSlugs: stringList,
    source: z.enum(NETWORK_ENTRY_SOURCES).optional().default("PLATFORM_UNVERIFIED"),
    sourceReference: optionalText(200),
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
  })
  .refine(
    (value) => !(value.effectiveFrom && value.effectiveTo) || value.effectiveTo.getTime() >= value.effectiveFrom.getTime(),
    { message: "The end date cannot be before the start date.", path: ["effectiveTo"] },
  );

export type NetworkEntryInput = z.infer<typeof networkEntrySchema>;

export const networkEntryRemoveSchema = z.object({
  entryId: requiredText(64, 1),
  reason: optionalText(300),
});

export const verificationResultSchema = z.object({
  entityKind: z.enum(["PRODUCT", "NETWORK_ENTRY", "PARTNER_PROFILE"]),
  entityId: requiredText(64, 1),
  status: z.enum(VERIFICATION_STATES),
  notes: optionalText(500),
});

export type VerificationResultInput = z.infer<typeof verificationResultSchema>;

// ---------------------------------------------------------------------------
// Platform administrator — insurers and insurer-partner accounts
// ---------------------------------------------------------------------------

export const insurerDetailSchema = z
  .object({
    id: optionalId,
    name: requiredText(200),
    slug: optionalText(160),
    legalName: optionalText(200),
    irdaiRegistrationNumber: optionalText(80),
    regulatorRegisterUrl: optionalText(300),
    supportPhone: optionalText(40),
    supportEmail: z.union([z.email(), z.literal("")]).optional(),
    website: optionalText(300),
    networkListUrl: optionalText(300),
    integrationMode: z.enum(INSURER_INTEGRATION_MODES).optional().default("MANUAL_OFFLINE"),
    integrationBaseUrl: optionalText(300),
    integrationNotes: optionalText(1000),
    integrationCredentialRef: optionalText(160),
    verificationStatus: z.enum(VERIFICATION_STATES).optional().default("UNVERIFIED"),
    isActive: checkboxBoolean.optional().default(true),
  })
  .refine(
    (value) => value.integrationMode !== "API" || Boolean(value.integrationBaseUrl),
    { message: "An API integration needs the insurer's base URL.", path: ["integrationBaseUrl"] },
  );

export type InsurerDetailInput = z.infer<typeof insurerDetailSchema>;

export const insurerPartnerProfileSchema = z.object({
  userId: requiredText(64, 1),
  insurerId: requiredText(64, 1),
  organisationName: requiredText(200),
  irdaiRegistrationNumber: optionalText(80),
  tpaCode: optionalText(80),
  reviewerName: optionalText(160),
  reviewerEmail: z.union([z.email(), z.literal("")]).optional(),
  reviewerPhone: optionalText(40),
  canRecordDecisions: checkboxBoolean.optional().default(false),
  canManageNetwork: checkboxBoolean.optional().default(false),
  canManageProducts: checkboxBoolean.optional().default(false),
  status: z.enum(PARTNER_APPLICATION_STATUSES).optional().default("DRAFT"),
});

export type InsurerPartnerProfileInput = z.infer<typeof insurerPartnerProfileSchema>;

// ---------------------------------------------------------------------------
// Integration callback
// ---------------------------------------------------------------------------

export const insurerCallbackSchema = z.object({
  eventId: requiredText(200, 1),
  eventType: z.enum(["ELIGIBILITY_RESULT", "PRE_AUTH_DECISION", "CLAIM_STATUS", "CLAIM_DECISION", "SETTLEMENT"]),
  reference: requiredText(120, 1),
  occurredAt: optionalText(40),
});

export type InsurerCallbackInput = z.infer<typeof insurerCallbackSchema>;
