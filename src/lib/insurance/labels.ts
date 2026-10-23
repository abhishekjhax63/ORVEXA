import type {
  ClaimDecision,
  ClaimDocumentKind,
  ClaimEventType,
  ClaimStatus,
  ClaimType,
  EligibilityCheckStatus,
  InsuranceCoverType,
  InsuranceDocumentStatus,
  InsurancePolicyDocumentKind,
  InsuranceProductSource,
  InsurerIntegrationMode,
  NetworkEntrySource,
  PolicyStatus,
  PolicyVerificationSource,
  PreAuthStatus,
  SettlementStatus,
} from "@prisma/client";

/**
 * Copy tables for the insurance surface.
 *
 * Client-safe on purpose: the Prisma import is type-only, so no database code
 * reaches the browser. The honesty rules have to be readable in the UI — a claim
 * status a patient sees, a network entry's provenance, the badge on a coverage
 * figure — so the wording lives here next to the enum it describes rather than
 * being assembled ad hoc at each render.
 *
 * The tone vocabulary matches the `Badge` variants exactly.
 */

export type InsuranceTone = "neutral" | "success" | "warning" | "emergency";

export type InsuranceCopy = { label: string; detail: string; tone: InsuranceTone };

/**
 * Version of the notice a patient agrees to before policy data may be shared
 * with a hospital or an insurer. Bumped whenever the wording changes, so a stored
 * consent record can always be read back against the text that was shown.
 */
export const INSURANCE_CONSENT_POLICY_VERSION = "orvexa.insurance-consent.v1";

/**
 * The one sentence that governs the whole surface. Rendered on every claim and
 * pre-authorisation view.
 */
export const DECISION_ATTRIBUTION_NOTICE =
  "The insurer decides. ORVEXA records what the insurer communicated and does not approve, reject or guarantee any claim.";

/** Shown wherever an amount is an estimate rather than a confirmed benefit. */
export const ESTIMATE_VS_CONFIRMED = {
  estimate: {
    label: "Estimate",
    detail:
      "This figure is an estimate of what may be payable. It is not an approval and it is not a promise of payment — the insurer decides what, if anything, is paid.",
  },
  confirmed: {
    label: "Confirmed by the insurer",
    detail:
      "The insurer communicated this figure. It is recorded here exactly as they stated it; ORVEXA has not added or changed it.",
  },
} as const;

export const CLAIM_STATUS_COPY: Record<ClaimStatus, InsuranceCopy> = {
  DRAFT: {
    label: "Draft",
    detail: "This claim has not been filed anywhere yet. It is saved on your account so you can finish and submit it.",
    tone: "neutral",
  },
  SUBMITTED: {
    label: "Submitted — awaiting the insurer",
    detail:
      "The claim has been recorded and filed. It is now with the insurer; no decision has been made, and nothing has been approved.",
    tone: "warning",
  },
  ACKNOWLEDGED: {
    label: "Acknowledged by the insurer",
    detail: "The insurer's record says they have received the claim. Receiving a claim is not a decision.",
    tone: "neutral",
  },
  AWAITING_INFORMATION: {
    label: "The insurer asked for more information",
    detail:
      "The insurer has raised a query and is waiting on you. Open the claim to see exactly what they asked for and answer it.",
    tone: "warning",
  },
  UNDER_REVIEW: {
    label: "Under review by the insurer",
    detail: "The insurer is assessing the claim. A reviewer is looking at it; no outcome has been recorded yet.",
    tone: "neutral",
  },
  PRE_AUTH_PENDING: {
    label: "Pre-authorisation pending",
    detail: "A cashless pre-authorisation request is with the insurer. It is not an approval until they say so.",
    tone: "warning",
  },
  PRE_AUTH_APPROVED: {
    label: "Pre-authorisation approved by the insurer",
    detail:
      "The insurer approved the pre-authorisation for the amount they stated. ORVEXA did not approve this and cannot guarantee the final bill will be settled.",
    tone: "success",
  },
  PRE_AUTH_PARTIALLY_APPROVED: {
    label: "Pre-authorisation partly approved by the insurer",
    detail:
      "The insurer approved part of the requested amount. The rest is not covered by this authorisation and may be payable by you.",
    tone: "warning",
  },
  PRE_AUTH_REJECTED: {
    label: "Pre-authorisation rejected by the insurer",
    detail:
      "The insurer rejected the pre-authorisation request. Read their stated reason on the claim; you may be able to file a reimbursement claim instead.",
    tone: "emergency",
  },
  APPROVED: {
    label: "Claim approved by the insurer",
    detail:
      "The insurer approved the claim for the amount they stated. This is their decision, recorded here as they communicated it. It is not a guarantee of what will be paid until settlement.",
    tone: "success",
  },
  PARTIALLY_APPROVED: {
    label: "Claim partly approved by the insurer",
    detail:
      "The insurer approved part of the claimed amount. The remainder was not approved — check their stated reason on the claim.",
    tone: "warning",
  },
  REJECTED: {
    label: "Claim rejected by the insurer",
    detail: "The insurer rejected the claim. Their stated reason is recorded on the claim.",
    tone: "emergency",
  },
  SETTLED: {
    label: "Settlement recorded",
    detail: "A settlement has been recorded against this claim. The amount and reference are shown in the settlement tracker.",
    tone: "success",
  },
  CLOSED: {
    label: "Closed",
    detail: "This claim is closed. No further action is expected unless the insurer reopens it.",
    tone: "neutral",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    detail: "This claim was withdrawn and is no longer active.",
    tone: "neutral",
  },
};

export const CLAIM_DECISION_COPY: Record<ClaimDecision, InsuranceCopy> = {
  PENDING: {
    label: "No decision recorded",
    detail: "The insurer has not communicated a decision. ORVEXA has not decided anything.",
    tone: "neutral",
  },
  APPROVED: {
    label: "Approved — by the insurer",
    detail: "The insurer communicated an approval. The name of who communicated it is recorded with the decision.",
    tone: "success",
  },
  PARTIALLY_APPROVED: {
    label: "Partly approved — by the insurer",
    detail: "The insurer communicated a partial approval for the amount they stated.",
    tone: "warning",
  },
  REJECTED: {
    label: "Rejected — by the insurer",
    detail: "The insurer communicated a rejection. Their stated reason is recorded with the decision.",
    tone: "emergency",
  },
  QUERY_RAISED: {
    label: "The insurer asked for more information",
    detail: "The insurer raised a query instead of deciding. Answer it and the claim can move forward.",
    tone: "warning",
  },
  WITHDRAWN: {
    label: "Withdrawn by the policyholder",
    detail: "The policyholder withdrew this claim before the insurer decided.",
    tone: "neutral",
  },
};

export const PRE_AUTH_STATUS_COPY: Record<PreAuthStatus, InsuranceCopy> = {
  DRAFT: {
    label: "Draft",
    detail: "This pre-authorisation request has not been filed with the insurer yet.",
    tone: "neutral",
  },
  SUBMITTED: {
    label: "Filed — awaiting the insurer",
    detail:
      "The request has been filed. Filing it is not approval: the insurer has to review it and tell you the outcome.",
    tone: "warning",
  },
  ACKNOWLEDGED: {
    label: "Acknowledged by the insurer",
    detail: "The insurer's record says they have received the request.",
    tone: "neutral",
  },
  QUERY_RAISED: {
    label: "The insurer asked for more information",
    detail: "The insurer needs something before deciding. Open the request to see what is outstanding.",
    tone: "warning",
  },
  APPROVED: {
    label: "Approved by the insurer",
    detail: "The insurer approved the pre-authorisation for the amount they stated.",
    tone: "success",
  },
  PARTIALLY_APPROVED: {
    label: "Partly approved by the insurer",
    detail: "The insurer approved part of the requested amount. The balance may be payable by you.",
    tone: "warning",
  },
  REJECTED: {
    label: "Rejected by the insurer",
    detail: "The insurer rejected the request. Their stated reason is recorded here.",
    tone: "emergency",
  },
  EXPIRED: {
    label: "Expired",
    detail: "The authorisation's validity period has passed. A new request may be needed.",
    tone: "neutral",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    detail: "This pre-authorisation request was withdrawn.",
    tone: "neutral",
  },
};

export const ELIGIBILITY_STATUS_COPY: Record<EligibilityCheckStatus, InsuranceCopy> = {
  REQUESTED: {
    label: "Requested",
    detail: "The check has been requested. No answer has come back yet.",
    tone: "warning",
  },
  ACKNOWLEDGED: {
    label: "Acknowledged by the insurer",
    detail: "The insurer's record says they received the check.",
    tone: "neutral",
  },
  RESPONDED: {
    label: "Answered by the insurer",
    detail: "The insurer returned an answer. It is shown exactly as they supplied it.",
    tone: "success",
  },
  NOT_SUPPORTED: {
    label: "Not supported — the insurer could not be asked",
    detail:
      "There is no automated link to this insurer, so no eligibility answer was obtained. ORVEXA will not invent one. Check the policy document, or call the insurer directly.",
    tone: "warning",
  },
  FAILED: {
    label: "The check failed",
    detail: "The insurer's system could not be reached, so no answer was obtained.",
    tone: "emergency",
  },
};

export const SETTLEMENT_STATUS_COPY: Record<SettlementStatus, InsuranceCopy> = {
  PENDING: {
    label: "Settlement pending",
    detail: "A settlement is expected but nothing has been paid yet.",
    tone: "warning",
  },
  IN_PROGRESS: {
    label: "Settlement in progress",
    detail: "The insurer is processing the payment.",
    tone: "neutral",
  },
  SETTLED: {
    label: "Settled",
    detail: "The insurer's record shows the amount as paid. The payment reference is shown alongside.",
    tone: "success",
  },
  PARTIALLY_SETTLED: {
    label: "Partly settled",
    detail: "Only part of the amount was paid. The remainder is still outstanding.",
    tone: "warning",
  },
  FAILED: {
    label: "Settlement failed",
    detail: "The payment did not go through. Nothing has been received.",
    tone: "emergency",
  },
};

export const POLICY_STATUS_COPY: Record<PolicyStatus, InsuranceCopy> = {
  ACTIVE: { label: "Active", detail: "The policy is in force according to the source on record.", tone: "success" },
  EXPIRED: { label: "Expired", detail: "The policy period has ended.", tone: "neutral" },
  CANCELLED: { label: "Cancelled", detail: "The policy was cancelled.", tone: "warning" },
  SUSPENDED: { label: "Suspended", detail: "The policy is suspended. Cover may not apply.", tone: "warning" },
  LAPSED: { label: "Lapsed", detail: "The policy lapsed, typically for a missed premium.", tone: "warning" },
  UNKNOWN: {
    label: "Status not known",
    detail: "The status of this policy has not been confirmed by the insurer or by a reviewed document.",
    tone: "neutral",
  },
};

export const POLICY_VERIFICATION_SOURCE_COPY: Record<PolicyVerificationSource, InsuranceCopy> = {
  SELF_DECLARED: {
    label: "Self-declared",
    detail:
      "These details were entered by you and have not been checked against a document or confirmed by the insurer.",
    tone: "warning",
  },
  DOCUMENT_REVIEWED: {
    label: "Document reviewed",
    detail: "These details were read from a policy document you supplied and were reviewed against it.",
    tone: "success",
  },
  INSURER_CONFIRMED: {
    label: "Confirmed by the insurer",
    detail: "The insurer confirmed these details.",
    tone: "success",
  },
  PARTNER_CONFIRMED: {
    label: "Confirmed by a partner",
    detail: "A verified partner confirmed these details.",
    tone: "success",
  },
};

export const INTEGRATION_MODE_COPY: Record<
  InsurerIntegrationMode,
  { label: string; detail: string; tone: InsuranceTone; automated: boolean }
> = {
  API: {
    label: "Direct API integration",
    detail:
      "Requests are sent to the insurer's system and their answers are recorded automatically. An approval or a rejection is still the insurer's, and is recorded with who communicated it.",
    tone: "success",
    automated: true,
  },
  PARTNER_PORTAL: {
    label: "Insurer's partner portal",
    detail:
      "A reviewer works the request in the insurer's own portal by hand, then records the reference number and the outcome here. There is no automated status feed: a status changes only when a human records what the portal shows.",
    tone: "warning",
    automated: false,
  },
  MANUAL_OFFLINE: {
    label: "Manual — filed by a human",
    detail:
      "A person files the request by email or phone and records the reference number the insurer issues. There is no automated status feed; nothing here moves until the insurer's answer is recorded by hand.",
    tone: "warning",
    automated: false,
  },
  NONE: {
    label: "No route to this insurer",
    detail:
      "There is no way for ORVEXA to submit to this insurer, so the request is NOT submitted anywhere. It is recorded on your account with a reference number so you can take it to the insurer yourself.",
    tone: "emergency",
    automated: false,
  },
};

export const CLAIM_TYPE_COPY: Record<ClaimType, InsuranceCopy> = {
  CASHLESS_PRE_AUTHORIZATION: {
    label: "Cashless pre-authorisation",
    detail: "A request, before a planned admission, for the hospital to bill the insurer directly.",
    tone: "neutral",
  },
  CASHLESS: {
    label: "Cashless claim",
    detail: "A claim where the hospital bills the insurer directly rather than you paying and claiming back.",
    tone: "neutral",
  },
  REIMBURSEMENT: {
    label: "Reimbursement",
    detail: "You paid the hospital and are claiming the money back from the insurer.",
    tone: "neutral",
  },
};

export const CLAIM_EVENT_COPY: Record<ClaimEventType, InsuranceCopy> = {
  CREATED: { label: "Claim created", detail: "The claim record was created on your account.", tone: "neutral" },
  SUBMITTED: {
    label: "Filed",
    detail: "The claim was filed. Filing is not approval — the insurer decides.",
    tone: "warning",
  },
  ACKNOWLEDGED: { label: "Acknowledged by the insurer", detail: "The insurer's record says they received the claim.", tone: "neutral" },
  ASSIGNED: { label: "Assigned to a reviewer", detail: "The insurer assigned the claim to a reviewer.", tone: "neutral" },
  INFORMATION_REQUESTED: {
    label: "Information requested",
    detail: "The insurer asked for more information.",
    tone: "warning",
  },
  QUERY_RAISED: { label: "Query raised by the insurer", detail: "The insurer raised a question that needs an answer.", tone: "warning" },
  QUERY_RESPONDED: { label: "Query answered", detail: "An answer was sent back to the insurer.", tone: "neutral" },
  DECISION_RECORDED: {
    label: "Insurer's decision recorded",
    detail: "A decision that the insurer communicated was recorded, naming who communicated it.",
    tone: "warning",
  },
  STATUS_CHANGED: { label: "Status changed", detail: "The administrative status of the claim changed.", tone: "neutral" },
  SETTLEMENT_RECORDED: { label: "Settlement recorded", detail: "A settlement was recorded against the claim.", tone: "success" },
  WITHDRAWN: { label: "Withdrawn", detail: "The claim was withdrawn.", tone: "neutral" },
  DOCUMENT_ADDED: { label: "Document added", detail: "A document was added to the claim.", tone: "neutral" },
  DOCUMENT_REMOVED: { label: "Document removed", detail: "A document was removed from the claim.", tone: "neutral" },
  NOTE: { label: "Note", detail: "A note was recorded on the claim.", tone: "neutral" },
};

export const CLAIM_DOCUMENT_KIND_COPY: Record<ClaimDocumentKind, { label: string; detail: string }> = {
  POLICY_COPY: { label: "Policy copy", detail: "The policy schedule or certificate." },
  INSURED_ID_PROOF: { label: "Insured person's ID", detail: "Photo identification for the insured person." },
  HOSPITAL_ESTIMATE: { label: "Hospital estimate", detail: "The hospital's cost estimate for the treatment." },
  PRE_AUTH_FORM: { label: "Pre-authorisation form", detail: "The form the hospital or insurer requires for a cashless request." },
  DISCHARGE_SUMMARY: { label: "Discharge summary", detail: "The hospital's summary of the admission." },
  INVESTIGATION_REPORT: { label: "Investigation report", detail: "Laboratory or imaging reports related to the treatment." },
  PRESCRIPTION: { label: "Prescription", detail: "The treating doctor's prescription." },
  HOSPITAL_INVOICE: { label: "Hospital invoice", detail: "The final bill from the hospital." },
  PAYMENT_PROOF: { label: "Payment proof", detail: "Evidence that the bill was paid, needed for a reimbursement." },
  INSURER_CORRESPONDENCE: { label: "Insurer correspondence", detail: "A letter or email from the insurer or its TPA." },
  OTHER: { label: "Other document", detail: "A supporting document for this claim." },
};

export const POLICY_DOCUMENT_KIND_COPY: Record<InsurancePolicyDocumentKind, { label: string; detail: string }> = {
  POLICY_SCHEDULE: { label: "Policy schedule", detail: "The schedule of benefits issued with the policy." },
  CERTIFICATE: { label: "Certificate of insurance", detail: "The certificate that confirms cover." },
  PREMIUM_RECEIPT: { label: "Premium receipt", detail: "Proof that a premium was paid." },
  ENDORSEMENT: { label: "Endorsement", detail: "A change made to the policy after it was issued." },
  ID_PROOF: { label: "Identification", detail: "Photo identification for the policyholder or a member." },
  OTHER: { label: "Other document", detail: "A supporting document for this policy." },
};

/**
 * Where a policy's coverage figures came from. Only `INSURER_CONFIRMED` and
 * `DOCUMENT_REVIEWED` are treated as verified sources by the UI; the rest are
 * displayed with their provenance badge and never as a confirmed benefit.
 */
export const COVERAGE_SOURCE_BADGE = {
  INSURER_CONFIRMED: {
    label: "Insurer-confirmed",
    detail: "The insurer supplied this figure. It is shown exactly as they stated it.",
    tone: "success" as InsuranceTone,
    verified: true,
  },
  DOCUMENT_REVIEWED: {
    label: "Document-reviewed",
    detail: "This figure was read from a policy document that was reviewed. Check the document for the exact wording.",
    tone: "success" as InsuranceTone,
    verified: true,
  },
  PARTNER_CONFIRMED: {
    label: "Partner-confirmed",
    detail: "A verified partner confirmed this figure. It has not been confirmed by the insurer directly.",
    tone: "success" as InsuranceTone,
    verified: true,
  },
  SELF_DECLARED: {
    label: "Self-declared",
    detail: "You entered this figure. It has not been verified against a document or by the insurer.",
    tone: "warning" as InsuranceTone,
    verified: false,
  },
  NOT_PUBLISHED: {
    label: "Not published by the insurer",
    detail: "No verified source has supplied this term. ORVEXA will not guess it, and a plausible-sounding default would be misleading.",
    tone: "neutral" as InsuranceTone,
    verified: false,
  },
} as const;

/** The single fallback string used wherever a coverage term is absent. */
export const COVERAGE_NOT_PUBLISHED = "Not published by the insurer";

/**
 * The coverage terms a policy can carry. Each has a label for the tile and the
 * fallback text to show when no verified source supplied it. The fallback is
 * always the same sentence, so a reader learns it and can trust it.
 */
export const COVERAGE_TERM_LABELS: Record<
  "waitingPeriod" | "exclusion" | "coPayment" | "deductible" | "subLimit" | "roomRentCap" | "preExisting",
  { label: string; description: string; notPublished: string }
> = {
  waitingPeriod: {
    label: "Waiting period",
    description: "How long the policy must be in force before a condition is covered.",
    notPublished: COVERAGE_NOT_PUBLISHED,
  },
  exclusion: {
    label: "Exclusions",
    description: "Treatments the policy does not cover.",
    notPublished: COVERAGE_NOT_PUBLISHED,
  },
  coPayment: {
    label: "Co-payment",
    description: "The share of a bill you pay even on a covered claim.",
    notPublished: COVERAGE_NOT_PUBLISHED,
  },
  deductible: {
    label: "Deductible",
    description: "The amount you pay before the policy starts paying.",
    notPublished: COVERAGE_NOT_PUBLISHED,
  },
  subLimit: {
    label: "Sub-limit",
    description: "A cap on a specific treatment or category within the sum insured.",
    notPublished: COVERAGE_NOT_PUBLISHED,
  },
  roomRentCap: {
    label: "Room-rent cap",
    description: "The maximum room category or rate the policy pays for.",
    notPublished: COVERAGE_NOT_PUBLISHED,
  },
  preExisting: {
    label: "Pre-existing conditions",
    description: "How pre-existing conditions are treated, and after how long.",
    notPublished: COVERAGE_NOT_PUBLISHED,
  },
};

export const COVER_TYPE_COPY: Record<InsuranceCoverType, string> = {
  INDIVIDUAL: "Individual",
  FAMILY_FLOATER: "Family floater",
  GROUP_EMPLOYER: "Group / employer",
  SENIOR_CITIZEN: "Senior citizen",
  MATERNITY: "Maternity",
  CRITICAL_ILLNESS: "Critical illness",
  TOP_UP: "Top-up",
  SUPER_TOP_UP: "Super top-up",
  PERSONAL_ACCIDENT: "Personal accident",
  OTHER: "Other cover",
};

/**
 * Where a network membership came from. Only the entries whose source is an
 * insurer list, an insurer API or a confirmed partner may be presented as
 * membership; the rest are shown with "not confirmed by the insurer".
 */
export const NETWORK_ENTRY_SOURCE_COPY: Record<
  NetworkEntrySource,
  { label: string; detail: string; confirmed: boolean; tone: InsuranceTone }
> = {
  INSURER_LIST: {
    label: "Insurer's published network list",
    detail: "This hospital appears on the network list the insurer published.",
    confirmed: true,
    tone: "success",
  },
  INSURER_API: {
    label: "Insurer's network API",
    detail: "The insurer's system returned this hospital as in-network.",
    confirmed: true,
    tone: "success",
  },
  PARTNER_CONFIRMED: {
    label: "Confirmed by the insurer's partner",
    detail: "The insurer or its TPA confirmed this listing out of band.",
    confirmed: true,
    tone: "success",
  },
  HOSPITAL_DECLARED: {
    label: "Not confirmed by the insurer",
    detail:
      "The hospital states it accepts this insurer, but the insurer has not confirmed it. Treat cashless availability as unverified until the insurer says otherwise.",
    confirmed: false,
    tone: "warning",
  },
  PLATFORM_UNVERIFIED: {
    label: "Not confirmed by the insurer",
    detail:
      "This listing has not been confirmed by the insurer and its source is not known to be authoritative. Do not rely on it as a guarantee of cashless admission.",
    confirmed: false,
    tone: "warning",
  },
};

export const PRODUCT_SOURCE_COPY: Record<
  InsuranceProductSource,
  { label: string; detail: string; verified: boolean; tone: InsuranceTone }
> = {
  INSURER_PUBLISHED: {
    label: "Published by the insurer",
    detail: "These terms were taken from the insurer's own published material.",
    verified: true,
    tone: "success",
  },
  INSURER_API: {
    label: "Supplied by the insurer's API",
    detail: "These terms were returned by the insurer's system.",
    verified: true,
    tone: "success",
  },
  PARTNER_CONFIRMED: {
    label: "Confirmed by a verified partner",
    detail: "A verified partner confirmed these terms. They have not been confirmed by the insurer directly.",
    verified: true,
    tone: "success",
  },
  PLATFORM_UNVERIFIED: {
    label: "Not verified",
    detail: "These terms have not been confirmed by the insurer or by a reviewed document, so they are not shown as supported.",
    verified: false,
    tone: "warning",
  },
};

export const DOCUMENT_STATUS_COPY: Record<InsuranceDocumentStatus, InsuranceCopy> = {
  PENDING: {
    label: "Being processed",
    detail: "The file has been received and is being checked before it is used.",
    tone: "neutral",
  },
  READY: { label: "Ready", detail: "The file was stored privately and is available to the people authorised to see it.", tone: "success" },
  REJECTED: {
    label: "Rejected",
    detail: "The file was rejected — it failed a scan or the type was not accepted. It was not stored.",
    tone: "emergency",
  },
  DELETED: { label: "Deleted", detail: "The file has been deleted.", tone: "neutral" },
};

/**
 * The customer-facing stages of a claim.
 *
 * The wording is deliberately careful: a stage is only *reached* when the
 * insurer's own record says so, not when a patient or the platform has asked for
 * it. A claim that has been filed is not a claim that has been approved.
 */
export const CLAIM_TIMELINE = {
  stages: [
    { id: "created", label: "Claim recorded", detail: "Your claim details are saved on your account." },
    { id: "submitted", label: "Filed", detail: "The claim has been filed with the insurer — by API where one exists, otherwise by hand." },
    { id: "acknowledged", label: "Insurer acknowledged", detail: "The insurer's record says they have received the claim." },
    { id: "review", label: "Under review", detail: "The insurer is assessing the claim." },
    { id: "decision", label: "Insurer's decision recorded", detail: "The outcome the insurer communicated, with the name of who communicated it." },
    { id: "settlement", label: "Settlement recorded", detail: "The payment the insurer's record shows." },
    { id: "closed", label: "Closed", detail: "No further action is expected." },
  ],
  caveat:
    "A stage appears as reached only when the insurer's own record, or a document the insurer issued, says so. ORVEXA does not move a claim forward on its own and does not decide any part of it.",
} as const;

/** Whether an entry may be presented as confirmed network membership. */
export function isNetworkEntryConfirmed(source: NetworkEntrySource): boolean {
  return NETWORK_ENTRY_SOURCE_COPY[source].confirmed;
}

/** Whether a product's published terms came from a verified source. */
export function isProductSourceVerified(source: InsuranceProductSource): boolean {
  return PRODUCT_SOURCE_COPY[source].verified;
}

/** Whether a policy's coverage figures came from a verified source. */
export function isPolicySourceVerified(source: PolicyVerificationSource): boolean {
  return source !== "SELF_DECLARED";
}
