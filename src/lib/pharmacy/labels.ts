import type {
  MedicineDosageForm,
  MedicineEquivalentRelationship,
  MedicineScheduleClass,
  MedicineStockStatus,
  PaymentStatus,
  PharmacyInventoryReason,
  PharmacyOrderEventType,
  PharmacyOrderStatus,
  PrescriptionDocumentStatus,
  PrescriptionStatus,
  RefundStatus,
} from "@prisma/client";

/**
 * The copy tables the pharmacy surface renders from.
 *
 * This module is deliberately client-safe (type-only Prisma import, no
 * `server-only`, no environment access) so the same words the server uses in an
 * audit note appear verbatim in the browser. It follows the `MALWARE_SCAN_COPY`
 * shape in `src/lib/ai/capabilities.ts`: every enum value maps to a label, a
 * sentence of plain detail, and a tone the badge component understands.
 *
 * The tone vocabulary is fixed at four values so a new status never has to
 * invent a colour.
 */

export type CopyTone = "neutral" | "success" | "warning" | "emergency";

export type EnumCopy = { label: string; detail: string; tone: CopyTone };

/**
 * Stock state as the customer reads it.
 *
 * `UNKNOWN` is the important entry: the partner has not published a countable
 * level, so the storefront must say exactly that and never render it as "in
 * stock". The wording here is the single source of truth for that rule.
 */
export const STOCK_COPY: Record<MedicineStockStatus, EnumCopy> = {
  IN_STOCK: {
    label: "In stock",
    detail: "The partner has published a stock level and this medicine is available to order.",
    tone: "success",
  },
  LOW_STOCK: {
    label: "Low stock",
    detail: "The partner is running low. Order soon, or the line may not be available after review.",
    tone: "warning",
  },
  OUT_OF_STOCK: {
    label: "Out of stock",
    detail: "The partner has no stock right now. This line cannot be added to an order.",
    tone: "emergency",
  },
  DISCONTINUED: {
    label: "Discontinued",
    detail: "The partner has stopped listing this medicine. It cannot be ordered.",
    tone: "neutral",
  },
  UNKNOWN: {
    label: "Stock level not published",
    detail:
      "This pharmacy has not published a stock level for this medicine. That is not the same as being in stock — ask the pharmacy before relying on it.",
    tone: "warning",
  },
};

/**
 * Indian drug-schedule classification.
 *
 * Each entry states plainly whether a prescription is legally required and
 * whether the platform may list the product at all, because that is the fact a
 * customer (and a code reviewer) most needs from this table. `listable: false`
 * entries are never returned by a storefront query and must never be ordered.
 */
export type ScheduleClassCopy = EnumCopy & {
  /** True when Indian law requires a valid prescription to dispense. */
  prescriptionRequired: boolean;
  /** False when the platform may not list or sell this class of product at all. */
  listable: boolean;
};

export const SCHEDULE_CLASS_COPY: Record<MedicineScheduleClass, ScheduleClassCopy> = {
  OTC: {
    label: "Over the counter",
    detail: "No prescription is legally required to buy this medicine.",
    tone: "neutral",
    prescriptionRequired: false,
    listable: true,
  },
  GENERAL_SCHEDULE_H: {
    label: "General sale",
    detail: "Sold without a prescription, but only from a licensed pharmacy.",
    tone: "neutral",
    prescriptionRequired: false,
    listable: true,
  },
  SCHEDULE_H: {
    label: "Schedule H — prescription required",
    detail:
      "Indian law requires a prescription from a registered medical practitioner. ORVEXA cannot dispense it without one.",
    tone: "warning",
    prescriptionRequired: true,
    listable: true,
  },
  SCHEDULE_H1: {
    label: "Schedule H1 — prescription required",
    detail:
      "A tighter Schedule H category. A prescription is legally required, and the pharmacy must keep a record of the sale.",
    tone: "warning",
    prescriptionRequired: true,
    listable: true,
  },
  SCHEDULE_X: {
    label: "Schedule X — not sold here",
    detail:
      "Schedule X drugs are not listed or sold through ORVEXA under any circumstances, whatever prescription is produced.",
    tone: "emergency",
    prescriptionRequired: true,
    listable: false,
  },
  NARCOTIC: {
    label: "Narcotic — not sold here",
    detail:
      "Narcotic drugs are not listed or sold through ORVEXA. They cannot be ordered here and are handled only by licensed institutions.",
    tone: "emergency",
    prescriptionRequired: true,
    listable: false,
  },
  AYURVEDIC_PROPRIETARY: {
    label: "Ayurvedic / proprietary",
    detail: "A licensed Ayurvedic or proprietary preparation. The label states whether a prescription is required.",
    tone: "neutral",
    prescriptionRequired: false,
    listable: true,
  },
  RESTRICTED_OTHER: {
    label: "Restricted — not sold here",
    detail:
      "This classification is restricted by the platform. It is not listed or sold through ORVEXA and cannot be ordered.",
    tone: "emergency",
    prescriptionRequired: true,
    listable: false,
  },
};

/** True when the platform may list and sell a product in this schedule class. */
export function isScheduleClassListable(scheduleClass: MedicineScheduleClass): boolean {
  return SCHEDULE_CLASS_COPY[scheduleClass].listable;
}

/** True when Indian law requires a prescription for this schedule class. */
export function isScheduleClassPrescriptionRequired(scheduleClass: MedicineScheduleClass): boolean {
  return SCHEDULE_CLASS_COPY[scheduleClass].prescriptionRequired;
}

export const DOSAGE_FORM_COPY: Record<MedicineDosageForm, EnumCopy> = {
  TABLET: { label: "Tablet", detail: "A compressed solid dose taken by mouth.", tone: "neutral" },
  CAPSULE: { label: "Capsule", detail: "A solid dose in a soluble shell, taken by mouth.", tone: "neutral" },
  SYRUP: { label: "Syrup", detail: "A liquid dose taken by mouth.", tone: "neutral" },
  SUSPENSION: { label: "Suspension", detail: "A liquid in which the medicine is dispersed; shake before use.", tone: "neutral" },
  SOLUTION: { label: "Solution", detail: "A liquid in which the medicine is fully dissolved.", tone: "neutral" },
  INJECTION: { label: "Injection", detail: "Given by injection. Usually administered by a clinician.", tone: "warning" },
  INFUSION: { label: "Infusion", detail: "Given slowly into a vein. Administered by a clinician.", tone: "warning" },
  CREAM: { label: "Cream", detail: "Applied to the skin.", tone: "neutral" },
  OINTMENT: { label: "Ointment", detail: "Applied to the skin.", tone: "neutral" },
  GEL: { label: "Gel", detail: "Applied to the skin.", tone: "neutral" },
  LOTION: { label: "Lotion", detail: "Applied to the skin.", tone: "neutral" },
  DROPS: { label: "Drops", detail: "Dropped into the eyes, ears or nose as the label directs.", tone: "neutral" },
  INHALER: { label: "Inhaler", detail: "Breathed in through the mouth or nose.", tone: "neutral" },
  SPRAY: { label: "Spray", detail: "Applied as a spray, to the skin or as directed.", tone: "neutral" },
  POWDER: { label: "Powder", detail: "A powder mixed or taken as the label directs.", tone: "neutral" },
  GRANULES: { label: "Granules", detail: "A granular dose taken as the label directs.", tone: "neutral" },
  PATCH: { label: "Patch", detail: "A patch applied to the skin that releases the medicine over time.", tone: "neutral" },
  SUPPOSITORY: { label: "Suppository", detail: "Inserted into the rectum or vagina as the label directs.", tone: "neutral" },
  DEVICE: { label: "Device", detail: "A medical device rather than a medicine.", tone: "neutral" },
  OTHER: { label: "Other", detail: "The manufacturer lists a form outside the standard set.", tone: "neutral" },
};

/**
 * How two products relate.
 *
 * None of these is a substitution instruction. The storefront shows the
 * relationship and the platform never swaps a line because of it.
 */
export const EQUIVALENT_RELATIONSHIP_COPY: Record<MedicineEquivalentRelationship, EnumCopy> = {
  GENERIC_EQUIVALENT: {
    label: "Generic equivalent",
    detail:
      "Same active ingredient and strength, different brand. A prescriber may allow a substitution — ORVEXA shows it and never performs it.",
    tone: "neutral",
  },
  SAME_MOLECULE: {
    label: "Same molecule, different strength",
    detail: "Same active ingredient but a different strength or pack. Not interchangeable as-is.",
    tone: "warning",
  },
  THERAPEUTIC_ALTERNATIVE: {
    label: "Therapeutic alternative",
    detail: "A different medicine used for the same condition. Informational only — not a substitute.",
    tone: "neutral",
  },
};

export const ORDER_STATUS_COPY: Record<PharmacyOrderStatus, EnumCopy> = {
  PENDING_PAYMENT: {
    label: "Awaiting payment",
    detail: "The order is reserved but unpaid. It is released if payment does not complete in time.",
    tone: "warning",
  },
  PAYMENT_CONFIRMED: {
    label: "Payment confirmed",
    detail: "Payment has been confirmed by the gateway. The pharmacy has not accepted the order yet.",
    tone: "success",
  },
  PRESCRIPTION_REVIEW: {
    label: "Prescription under review",
    detail:
      "A line on this order needs a prescription. A pharmacist must approve a prescription covering it before the order can be accepted.",
    tone: "warning",
  },
  ACCEPTED: {
    label: "Accepted by the pharmacy",
    detail: "The pharmacy has accepted the order and will begin packing it.",
    tone: "success",
  },
  PACKED: { label: "Packed", detail: "The pharmacy has packed the order. It has not been dispatched yet.", tone: "success" },
  DISPATCHED: {
    label: "Dispatched",
    detail: "The pharmacy has recorded a dispatch acknowledgement. Delivery has not yet been confirmed.",
    tone: "success",
  },
  DELIVERED: {
    label: "Delivered",
    detail: "The pharmacy recorded a delivery acknowledgement from its delivery partner.",
    tone: "success",
  },
  CANCELLED: {
    label: "Cancelled",
    detail: "This order was cancelled. Any reserved stock has been returned to the pharmacy.",
    tone: "neutral",
  },
  REFUNDED: {
    label: "Refunded",
    detail: "A refund has been processed for this order.",
    tone: "neutral",
  },
};

/**
 * The customer-facing order steps, in order.
 *
 * Rendered as a progress timeline. `CANCELLED` and `REFUNDED` are terminal
 * states that sit outside this list, because a timeline implies forward motion
 * and a cancellation is not a step towards delivery. `PRESCRIPTION_REVIEW` is
 * shown only for orders that need a prescription; a timeline renderer should
 * skip it for the rest.
 */
export const ORDER_STATUS_TIMELINE: readonly {
  status: PharmacyOrderStatus;
  title: string;
  description: string;
}[] = [
  { status: "PENDING_PAYMENT", title: "Awaiting payment", description: "Your order is reserved until payment completes." },
  { status: "PAYMENT_CONFIRMED", title: "Payment confirmed", description: "We have confirmed your payment with the gateway." },
  {
    status: "PRESCRIPTION_REVIEW",
    title: "Prescription check",
    description: "A pharmacist is checking the prescription for the medicines that need one.",
  },
  { status: "ACCEPTED", title: "Accepted", description: "The pharmacy has accepted the order." },
  { status: "PACKED", title: "Packed", description: "Your medicines are packed and awaiting dispatch." },
  { status: "DISPATCHED", title: "Dispatched", description: "The pharmacy recorded handing it to a delivery partner." },
  { status: "DELIVERED", title: "Delivered", description: "A delivery acknowledgement was recorded." },
];

/** Terminal statuses shown outside the timeline. */
export const TERMINAL_ORDER_STATUSES: readonly PharmacyOrderStatus[] = ["CANCELLED", "REFUNDED"];

export const ORDER_EVENT_COPY: Record<PharmacyOrderEventType, EnumCopy> = {
  CREATED: { label: "Order placed", detail: "The order was created and its stock was reserved.", tone: "neutral" },
  PAYMENT_INITIATED: { label: "Payment started", detail: "A payment attempt was started.", tone: "neutral" },
  PAYMENT_FAILED: { label: "Payment did not complete", detail: "A payment attempt did not succeed.", tone: "emergency" },
  PAYMENT_CONFIRMED: { label: "Payment confirmed", detail: "The gateway confirmed the payment.", tone: "success" },
  PRESCRIPTION_REQUIRED: {
    label: "Prescription needed",
    detail: "This order contains at least one medicine that requires a prescription.",
    tone: "warning",
  },
  PRESCRIPTION_APPROVED: {
    label: "Prescription approved",
    detail: "A pharmacist approved a prescription covering this order.",
    tone: "success",
  },
  PRESCRIPTION_REJECTED: {
    label: "Prescription rejected",
    detail: "A pharmacist rejected the prescription for this order.",
    tone: "emergency",
  },
  ORDER_ACCEPTED: { label: "Accepted", detail: "The pharmacy accepted the order.", tone: "success" },
  ORDER_REJECTED: { label: "Rejected", detail: "The pharmacy rejected the order and gave a reason.", tone: "emergency" },
  PACKED: { label: "Packed", detail: "The pharmacy packed the order.", tone: "neutral" },
  DISPATCHED: { label: "Dispatched", detail: "The pharmacy recorded a dispatch acknowledgement.", tone: "neutral" },
  DELIVERED: { label: "Delivered", detail: "A delivery acknowledgement was recorded.", tone: "success" },
  CANCELLED: { label: "Cancelled", detail: "The order was cancelled.", tone: "neutral" },
  REFUND_INITIATED: { label: "Refund requested", detail: "A refund was requested for this order.", tone: "warning" },
  REFUND_COMPLETED: { label: "Refund processed", detail: "The refund was processed.", tone: "success" },
  NOTE: { label: "Note", detail: "A note was added to the order timeline.", tone: "neutral" },
};

export const PRESCRIPTION_STATUS_COPY: Record<PrescriptionStatus, EnumCopy> = {
  UPLOADED: {
    label: "Uploaded",
    detail: "The prescription has been stored. No pharmacist has reviewed it yet.",
    tone: "neutral",
  },
  UNDER_REVIEW: { label: "Under review", detail: "A pharmacist is reviewing this prescription.", tone: "warning" },
  CLARIFICATION_REQUESTED: {
    label: "Clarification requested",
    detail: "The pharmacist needs something clarified before a decision can be made.",
    tone: "warning",
  },
  APPROVED: { label: "Approved", detail: "A pharmacist approved this prescription for the medicines it covers.", tone: "success" },
  PARTIALLY_APPROVED: {
    label: "Partially approved",
    detail: "A pharmacist approved only some of the medicines written on this prescription.",
    tone: "warning",
  },
  REJECTED: { label: "Rejected", detail: "A pharmacist rejected this prescription and recorded why.", tone: "emergency" },
  EXPIRED: { label: "Expired", detail: "This prescription is past the date it was valid for.", tone: "neutral" },
  WITHDRAWN: {
    label: "Withdrawn",
    detail: "You withdrew this prescription. Its documents were removed and it is not shared with any pharmacy.",
    tone: "neutral",
  },
};

/** True only when a review decision on the prescription allows a line to be dispensed. */
export function isPrescriptionApproving(status: PrescriptionStatus): boolean {
  return status === "APPROVED" || status === "PARTIALLY_APPROVED";
}

export const PRESCRIPTION_DOCUMENT_STATUS_COPY: Record<PrescriptionDocumentStatus, EnumCopy> = {
  PENDING: { label: "Stored, not yet cleared", detail: "The file is held and not released while it is being checked.", tone: "neutral" },
  READY: { label: "Available", detail: "The file can be opened through a short-lived private link.", tone: "success" },
  REJECTED: { label: "Rejected", detail: "This file was rejected and will not be released to a pharmacy.", tone: "emergency" },
  DELETED: { label: "Deleted", detail: "This file has been removed. Its row is kept so the withdrawal stays auditable.", tone: "neutral" },
};

export const PAYMENT_STATUS_COPY: Record<PaymentStatus, EnumCopy> = {
  CREATED: { label: "Created", detail: "A payment record was created but nothing has been sent yet.", tone: "neutral" },
  PENDING: { label: "Pending", detail: "The payment is in progress and the outcome is not known yet.", tone: "warning" },
  REQUIRES_ACTION: { label: "Action required", detail: "The customer still has to complete the payment.", tone: "warning" },
  AUTHORISED: {
    label: "Authorised, not captured",
    detail: "The money is held but not taken. The order stays awaiting capture until the gateway settles it.",
    tone: "warning",
  },
  CAPTURED: { label: "Paid", detail: "The gateway confirmed the money was taken.", tone: "success" },
  FAILED: { label: "Failed", detail: "The payment attempt did not succeed and no money was taken.", tone: "emergency" },
  CANCELLED: { label: "Cancelled", detail: "The payment attempt was cancelled.", tone: "neutral" },
  EXPIRED: { label: "Expired", detail: "The payment window closed before the payment completed.", tone: "neutral" },
};

export const REFUND_STATUS_COPY: Record<RefundStatus, EnumCopy> = {
  REQUESTED: { label: "Requested", detail: "A refund has been requested and is waiting for a decision.", tone: "warning" },
  PROCESSING: {
    label: "Processing",
    detail: "The gateway accepted the refund and has not settled it yet. It isn't done until it is.",
    tone: "warning",
  },
  PROCESSED: { label: "Processed", detail: "The refund was processed.", tone: "success" },
  FAILED: { label: "Failed", detail: "The refund did not go through and would need to be retried.", tone: "emergency" },
  CANCELLED: { label: "Cancelled", detail: "The refund was cancelled before it was processed.", tone: "neutral" },
};

export const INVENTORY_REASON_COPY: Record<PharmacyInventoryReason, EnumCopy> = {
  RESTOCK: { label: "Restock", detail: "Stock was added to the pharmacy.", tone: "success" },
  SALE: { label: "Order reserved", detail: "Stock was reserved against a customer order.", tone: "neutral" },
  ORDER_CANCELLED: { label: "Order cancelled", detail: "Reserved stock was returned after a cancellation.", tone: "neutral" },
  CORRECTION: { label: "Correction", detail: "A manual correction was recorded against the level.", tone: "warning" },
  EXPIRY: { label: "Expiry", detail: "Expired stock was removed from the level.", tone: "warning" },
  DAMAGE: { label: "Damage", detail: "Damaged stock was removed from the level.", tone: "warning" },
  RETURN: { label: "Return", detail: "Stock was returned to the level.", tone: "neutral" },
  RECONCILIATION: { label: "Reconciliation", detail: "A stock count was reconciled against the ledger.", tone: "neutral" },
};

/**
 * The platform's standing statement about generic-equivalent information.
 *
 * Rendered on the product page and next to any equivalent relationship, so the
 * boundary travels with the information wherever it is shown.
 */
export const PRESCRIPTION_DISCIPLINE =
  "A prescription-required medicine is dispensed only after a pharmacist has approved a prescription that covers that line. " +
  "The platform cannot and does not authorise a prescription, and no automated system makes that decision.";

/**
 * The generic-equivalent notice.
 *
 * ORVEXA shows generic-equivalent information for information only. It never
 * substitutes one medicine for another; only a prescriber may authorise a
 * substitution, and only a pharmacist may act on it.
 */
export const MEDICINE_DISCLAIMER =
  "ORVEXA shows generic-equivalent information for information only. It does not substitute one medicine for another. " +
  "Only your prescriber can change what you are prescribed, and only a pharmacist can act on it. " +
  "Never change or stop a medicine because of something you read here — speak to your doctor or pharmacist first.";

/**
 * Version of the prescription-sharing consent text.
 *
 * Bumped whenever the wording changes so a stored consent record can always be
 * read back against the text the patient actually saw. Release of a
 * prescription to a pharmacy requires a granted `PHARMACY_PRESCRIPTION_SHARING`
 * consent at this version or later.
 */
export const PRESCRIPTION_CONSENT_POLICY_VERSION = "orvexa.pharmacy-prescription.v1";

/** The exact text a patient agrees to before a prescription is stored and shared. */
export const PRESCRIPTION_CONSENT_STATEMENT =
  "I confirm this prescription is for me or for a family member I manage, and I agree to ORVEXA storing the document " +
  "privately and releasing it to a licensed pharmacy so a pharmacist can review and dispense it. I understand I can " +
  "withdraw it at any time, after which it is removed and no longer shared.";

/**
 * The sandbox banner.
 *
 * Shown wherever a payment is a rehearsal rather than a sale, so a test order
 * is never presented as a real one. The live and test-mode entries are the
 * counterparts for the genuine gateway, so one component renders every state
 * honestly.
 */
export const SANDBOX_BANNER = {
  sandboxTitle: "Sandbox payment — no money moves",
  sandboxDetail:
    "This is a rehearsal. No card is charged, no money is taken, and this order is labelled as a sandbox order. " +
    "Configure Razorpay keys (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) to take real payments.",
  liveTitle: "Live payment",
  liveDetail:
    "This payment is handled by the configured gateway and real money moves. Card details are entered on the gateway's own page and never reach ORVEXA.",
  testModeTitle: "Test-mode payment",
  testModeDetail:
    "The gateway is configured with test keys, so payments are simulated and no money is taken. Orders placed in this mode are test orders.",
} as const;
