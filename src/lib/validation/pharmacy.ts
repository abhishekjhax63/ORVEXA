import { z } from "zod";

import type {
  MedicineDosageForm,
  MedicineEquivalentRelationship,
  MedicineScheduleClass,
  MedicineStockStatus,
  PharmacyInventoryReason,
  PharmacyOrderStatus,
  PaymentStatus,
  PrescriptionStatus,
  RefundStatus,
} from "@prisma/client";

/**
 * Validation for everything that reaches the pharmacy domain.
 *
 * The enum value lists are declared as literal tuples and checked against the
 * Prisma enums with `satisfies`, so the compiler fails if the database and the
 * API drift apart — while the `import type` keeps Prisma out of any client
 * bundle that also loads these schemas for inline validation. This mirrors
 * `src/lib/validation/emergency.ts`.
 *
 * No schema here accepts a price, a total, a discount or a tax figure. Money is
 * always computed on the server; the client only ever names an offer and a
 * quantity.
 */

// ---------------------------------------------------------------------------
// Literal enum tuples
// ---------------------------------------------------------------------------

export const MEDICINE_STOCK_STATUSES = [
  "IN_STOCK",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "DISCONTINUED",
  "UNKNOWN",
] as const satisfies readonly MedicineStockStatus[];

export const MEDICINE_SCHEDULE_CLASSES = [
  "OTC",
  "GENERAL_SCHEDULE_H",
  "SCHEDULE_H",
  "SCHEDULE_H1",
  "SCHEDULE_X",
  "NARCOTIC",
  "AYURVEDIC_PROPRIETARY",
  "RESTRICTED_OTHER",
] as const satisfies readonly MedicineScheduleClass[];

export const MEDICINE_DOSAGE_FORMS = [
  "TABLET",
  "CAPSULE",
  "SYRUP",
  "SUSPENSION",
  "SOLUTION",
  "INJECTION",
  "INFUSION",
  "CREAM",
  "OINTMENT",
  "GEL",
  "LOTION",
  "DROPS",
  "INHALER",
  "SPRAY",
  "POWDER",
  "GRANULES",
  "PATCH",
  "SUPPOSITORY",
  "DEVICE",
  "OTHER",
] as const satisfies readonly MedicineDosageForm[];

export const MEDICINE_EQUIVALENT_RELATIONSHIPS = [
  "GENERIC_EQUIVALENT",
  "SAME_MOLECULE",
  "THERAPEUTIC_ALTERNATIVE",
] as const satisfies readonly MedicineEquivalentRelationship[];

export const PHARMACY_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PRESCRIPTION_REVIEW",
  "ACCEPTED",
  "PACKED",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const satisfies readonly PharmacyOrderStatus[];

export const PAYMENT_STATUSES = [
  "CREATED",
  "PENDING",
  "REQUIRES_ACTION",
  "AUTHORISED",
  "CAPTURED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const satisfies readonly PaymentStatus[];

export const REFUND_STATUSES = [
  "REQUESTED",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly RefundStatus[];

export const PRESCRIPTION_STATUSES = [
  "UPLOADED",
  "UNDER_REVIEW",
  "CLARIFICATION_REQUESTED",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "EXPIRED",
  "WITHDRAWN",
] as const satisfies readonly PrescriptionStatus[];

export const PRESCRIPTION_REVIEW_DECISIONS = [
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "CLARIFICATION_REQUESTED",
] as const satisfies readonly PrescriptionStatus[];

export const INVENTORY_REASONS = [
  "RESTOCK",
  "SALE",
  "ORDER_CANCELLED",
  "CORRECTION",
  "EXPIRY",
  "DAMAGE",
  "RETURN",
  "RECONCILIATION",
] as const satisfies readonly PharmacyInventoryReason[];

/** Only a partner may choose these: `SALE` is written by the checkout service. */
export const PARTNER_INVENTORY_REASONS = [
  "RESTOCK",
  "CORRECTION",
  "EXPIRY",
  "DAMAGE",
  "RETURN",
  "RECONCILIATION",
] as const satisfies readonly PharmacyInventoryReason[];

export const ORDER_DECISIONS = ["ACCEPT", "REJECT"] as const;
export type OrderDecision = (typeof ORDER_DECISIONS)[number];

/**
 * The sandbox outcomes, duplicated from `src/lib/payments/sandbox.ts` as a
 * literal tuple so this client-safe module never imports a `server-only` file.
 * The provider itself uses `SANDBOX_OUTCOMES`; these two lists must stay in
 * step, and the sandbox rehearsal page is verified against both.
 */
export const SANDBOX_PAYMENT_OUTCOMES = ["captured", "authorised", "failed", "cancelled", "expired"] as const;
export type SandboxPaymentOutcome = (typeof SANDBOX_PAYMENT_OUTCOMES)[number];

export const CART_SORT_OPTIONS = ["relevance", "price-asc", "price-desc", "name"] as const;
export type CartSortOption = (typeof CART_SORT_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Checkbox values arrive from FormData as strings; "off" must not read as true. */
export const checkboxBoolean = z.preprocess(
  (value) => value === true || value === "true" || value === "on" || value === "1",
  z.boolean(),
);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

/**
 * Accepts the shapes Indian users actually type: +91XXXXXXXXXX, 0XXXXXXXXXX or
 * a bare ten-digit mobile. A number that cannot be dialled is worse than none,
 * so anything else is rejected rather than stored.
 */
export const indianPhoneSchema = z
  .string()
  .trim()
  .min(10)
  .max(20)
  .refine((value) => {
    const digits = value.replace(/[\s-()]/g, "");
    return /^(?:\+91|0091|91|0)?[6-9]\d{9}$/.test(digits);
  }, "Enter a valid Indian mobile number, for example +91 98450 12093.");

/** A six-digit Indian PIN code. The first digit is never 0. */
export const indianPostalCodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit postal (PIN) code, for example 560038.");

export const paiseSchema = z.number().int().min(0).max(1_000_000_000);

/** Six-character base32 body of an order reference, e.g. ORX-PH-7K2M4Q. */
export const orderReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^ORX-PH-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, "That is not a valid order reference.");

/** What a prescription reference looks like, e.g. ORX-RX-7K2M4Q. */
export const prescriptionReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^ORX-RX-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, "That is not a valid prescription reference.");

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const cartAddItemSchema = z.object({
  offerId: z.string().trim().min(1).max(64),
  quantity: z.coerce.number().int().min(1).max(999).optional().default(1),
});

export type CartAddItemInput = z.infer<typeof cartAddItemSchema>;

export const cartUpdateItemSchema = z.object({
  offerId: z.string().trim().min(1).max(64),
  quantity: z.coerce.number().int().min(1).max(999),
});

export type CartUpdateItemInput = z.infer<typeof cartUpdateItemSchema>;

export const cartRemoveItemSchema = z.object({ offerId: z.string().trim().min(1).max(64) });

// ---------------------------------------------------------------------------
// Delivery addresses
// ---------------------------------------------------------------------------

const addressFields = {
  label: z.string().trim().min(1).max(60),
  recipientName: z.string().trim().min(2).max(120),
  phone: indianPhoneSchema,
  addressLine1: z.string().trim().min(4).max(200),
  addressLine2: optionalText(200),
  landmark: optionalText(160),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  postalCode: indianPostalCodeSchema,
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  isDefault: checkboxBoolean.optional().default(false),
};

export const addressCreateSchema = z
  .object(addressFields)
  .refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
    message: "Provide both latitude and longitude, or neither.",
    path: ["latitude"],
  });

export type AddressCreateInput = z.infer<typeof addressCreateSchema>;

export const addressUpdateSchema = z
  .object({ id: z.string().trim().min(1).max(64), ...addressFields })
  .refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
    message: "Provide both latitude and longitude, or neither.",
    path: ["latitude"],
  });

export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;

export const addressDeleteSchema = z.object({ id: z.string().trim().min(1).max(64) });

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export const checkoutSchema = z.object({
  addressId: z.string().trim().min(1).max(64),
  /** Optional: an order that needs no prescription ignores it; one that does requires it. */
  prescriptionId: optionalText(64),
  /**
   * Client-generated key so a double tap, a retry after a timeout, or a
   * replayed submission resolves to the same order instead of a second one.
   */
  idempotencyKey: z.string().trim().min(8).max(128),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

export const prescriptionUploadMetaSchema = z.object({
  patientNotes: optionalText(1000),
  familyMemberId: optionalText(64),
  /** Explicit, per-upload consent to store and later release the document. */
  consentAcknowledged: checkboxBoolean,
  policyVersion: z.string().trim().min(1).max(80),
});

export type PrescriptionUploadMetaInput = z.infer<typeof prescriptionUploadMetaSchema>;

export const prescriptionReviewSchema = z.object({
  prescriptionId: z.string().trim().min(1).max(64),
  decision: z.enum(PRESCRIPTION_REVIEW_DECISIONS),
  /** Required: a decision without reasoning is a label the patient cannot act on. */
  notes: z.string().trim().min(10).max(4000),
});

export type PrescriptionReviewInput = z.infer<typeof prescriptionReviewSchema>;

export const prescriptionWithdrawSchema = z.object({ prescriptionId: z.string().trim().min(1).max(64) });

export const prescriptionConsentSchema = z.object({
  granted: checkboxBoolean,
  policyVersion: z.string().trim().min(1).max(80),
});

// ---------------------------------------------------------------------------
// Partner: inventory and offers
// ---------------------------------------------------------------------------

export const inventoryAdjustSchema = z.object({
  offerId: z.string().trim().min(1).max(64),
  /** Signed change to the level. Zero is rejected: an empty movement is noise. */
  delta: z.coerce
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0, "Enter a non-zero adjustment."),
  reason: z.enum(PARTNER_INVENTORY_REASONS),
  note: optionalText(400),
});

export type InventoryAdjustInput = z.infer<typeof inventoryAdjustSchema>;

export const offerUpsertSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  /** Rupees as typed, converted to paise with `parseRupeesToPaise` on the server. */
  priceRupees: z.string().trim().min(1).max(20),
  taxRateBps: z.coerce.number().int().min(0).max(5000).optional(),
  stockQuantity: z.coerce.number().int().min(0).max(1_000_000).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(100_000).optional(),
  maxPerOrder: z.coerce.number().int().min(1).max(999).optional(),
  deliveryEtaMinutes: z.coerce.number().int().min(0).max(20_160).optional(),
  pricePublished: checkboxBoolean.optional().default(false),
  isActive: checkboxBoolean.optional().default(true),
});

export type OfferUpsertInput = z.infer<typeof offerUpsertSchema>;

export const offerToggleSchema = z.object({
  offerId: z.string().trim().min(1).max(64),
  isActive: checkboxBoolean,
});

export const partnerProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  tradeName: optionalText(200),
  drugLicenceNumber: optionalText(80),
  drugLicenceType: optionalText(80),
  drugLicenceAuthority: optionalText(120),
  gstin: optionalText(20),
  pharmacistName: optionalText(160),
  pharmacistRegistrationNumber: optionalText(80),
  pharmacistRegistrationCouncil: optionalText(120),
  homeDeliveryAvailable: checkboxBoolean.optional().default(false),
  deliveryRadiusKm: z.coerce.number().int().min(0).max(2000).optional(),
});

export type PartnerProfileInput = z.infer<typeof partnerProfileSchema>;

// ---------------------------------------------------------------------------
// Partner: order fulfilment
// ---------------------------------------------------------------------------

export const orderDecisionSchema = z
  .object({
    orderId: z.string().trim().min(1).max(64),
    decision: z.enum(ORDER_DECISIONS),
    reason: optionalText(400),
  })
  .refine((value) => value.decision !== "REJECT" || (value.reason && value.reason.length >= 4), {
    message: "Give a reason for rejecting an order. The customer sees it.",
    path: ["reason"],
  });

export type OrderDecisionInput = z.infer<typeof orderDecisionSchema>;

export const dispatchDetailsSchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  deliveryPartnerName: z.string().trim().min(2).max(160),
  trackingUrl: optionalText(500),
  /** The partner's own acknowledgement reference. Required: it is what proves dispatch. */
  ackReference: z.string().trim().min(1).max(120),
});

export type DispatchDetailsInput = z.infer<typeof dispatchDetailsSchema>;

export const deliveryAckSchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  ackReference: z.string().trim().min(1).max(120),
});

export const orderActionSchema = z.object({ orderId: z.string().trim().min(1).max(64) });

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export const refundRequestSchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(4).max(400),
});

export type RefundRequestInput = z.infer<typeof refundRequestSchema>;

export const refundDecisionSchema = z
  .object({
    refundId: z.string().trim().min(1).max(64),
    approve: checkboxBoolean,
    note: optionalText(400),
  })
  .refine((value) => value.approve || (value.note && value.note.length >= 4), {
    message: "Give a reason for declining a refund.",
    path: ["note"],
  });

export type RefundDecisionInput = z.infer<typeof refundDecisionSchema>;

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const paymentVerifySchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  providerPaymentId: z.string().trim().min(1).max(200),
  signature: z.string().trim().min(1).max(500).optional(),
});

export type PaymentVerifyInput = z.infer<typeof paymentVerifySchema>;

/**
 * The sandbox rehearsal payload.
 *
 * The amount is included so the signed string binds the outcome to the exact
 * amount the server computed; it is still checked against the stored order
 * total rather than trusted.
 */
export const sandboxOutcomeSchema = z.object({
  providerOrderId: z.string().trim().min(1).max(200),
  providerPaymentId: z.string().trim().min(1).max(200),
  amountPaise: z.coerce.number().int().min(1).max(1_000_000_000),
  outcome: z.enum(SANDBOX_PAYMENT_OUTCOMES),
  signature: z.string().trim().min(1).max(500),
});

export type SandboxOutcomeInput = z.infer<typeof sandboxOutcomeSchema>;

// ---------------------------------------------------------------------------
// Storefront search
// ---------------------------------------------------------------------------

export const catalogueQuerySchema = z.object({
  query: optionalText(120),
  categorySlug: optionalText(80),
  scheduleClass: z.enum(MEDICINE_SCHEDULE_CLASSES).optional(),
  prescriptionRequiredOnly: checkboxBoolean.optional().default(false),
  sort: z.enum(CART_SORT_OPTIONS).optional().default("relevance"),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
});

export type CatalogueQuery = z.infer<typeof catalogueQuerySchema>;

export const suggestionQuerySchema = z.object({
  query: optionalText(80),
  limit: z.coerce.number().int().min(1).max(10).optional().default(6),
});

export const partnerReportRangeSchema = z.object({
  from: z.string().trim().min(1).max(40),
  to: z.string().trim().min(1).max(40),
});
