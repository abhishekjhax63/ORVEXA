import "server-only";

import type {
  InsuranceCoverType,
  InsurancePolicyDocumentKind,
  InsuranceProductSource,
  PolicyVerificationSource,
  Prisma,
  VerificationState,
} from "@prisma/client";

import { assertOwnership } from "@/lib/auth/guards";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { retentionDeadline } from "@/lib/ai/config";
import { scanAiUpload } from "@/lib/ai/malware";
import {
  buildDocumentKey,
  createDocumentLink,
  DOCUMENT_LINK_TTL_SECONDS,
  isAcceptedDocumentMimeType,
  removeDocument,
  storeDocument,
} from "@/lib/documents/storage";
import {
  COVERAGE_SOURCE_BADGE,
  COVERAGE_TERM_LABELS,
  ESTIMATE_VS_CONFIRMED,
  INSURANCE_CONSENT_POLICY_VERSION,
  POLICY_VERIFICATION_SOURCE_COPY,
  PRODUCT_SOURCE_COPY,
} from "@/lib/insurance/labels";
import { formatSumInsured, paiseToRupees, rupeesToPaise } from "@/lib/insurance/money";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import type { PolicyInput } from "@/lib/validation/insurance";

/**
 * The policy wallet.
 *
 * A policy is the one thing a claim is authorised against, so the rules of this
 * module are narrow and repeated everywhere:
 *
 *  - Every read and write is scoped to the signed-in owner. A policy id from a
 *    URL never grants access on its own; `assertOwnership` runs before any row is
 *    returned or changed, and a cross-user attempt is audited.
 *  - The **verification source is never accepted from a form**. A patient enters
 *    their own policy and it is stored `SELF_DECLARED`; only a platform
 *    administrator, reading a document and saying so, can raise it. That is what
 *    stops a self-typed "sum insured" being shown as an insurer-confirmed benefit.
 *  - Amounts cross the boundary in paise and are stored as whole rupees, via
 *    `src/lib/insurance/money.ts`.
 *  - Deleting is a soft delete; the row is retained so a claim already filed
 *    against it does not lose its policy.
 */

/** Retention for a policy that has been deleted: the row is purged after this. */
const POLICY_RETENTION_DAYS = 365 * 7;

export type PolicyRecord = Prisma.InsurancePolicyGetPayload<{
  include: { insurer: true; product: true; familyMember: true };
}>;

export type PolicyDocumentRecord = Prisma.InsurancePolicyDocumentGetPayload<Record<string, never>>;

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/**
 * Records the consent that lets policy details be shared with an insurer.
 *
 * A withdrawal is written as a second, `granted: false` row rather than by
 * deleting the first: the audit trail must be able to show that consent was held
 * when a claim was filed, and that it was later removed.
 */
export async function recordInsuranceConsent(input: {
  user: AuthenticatedUser;
  granted: boolean;
  policyVersion?: string;
  context?: RequestContext;
}): Promise<{ granted: boolean; at: Date }> {
  const policyVersion = input.policyVersion ?? INSURANCE_CONSENT_POLICY_VERSION;
  const at = new Date();

  await prisma.consentRecord.create({
    data: {
      userId: input.user.id,
      consentType: "INSURANCE_DATA_SHARING",
      policyVersion,
      granted: input.granted,
      grantedAt: at,
      revokedAt: input.granted ? null : at,
      ipAddress: input.context?.ipAddress ?? null,
      userAgent: input.context?.userAgent ?? null,
    },
  });

  await recordAuditEvent({
    action: input.granted ? "consent.recorded" : "consent.revoked",
    entityType: "consent",
    entityId: input.user.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { consentType: "INSURANCE_DATA_SHARING", policyVersion },
  });

  return { granted: input.granted, at };
}

/** The most recent consent decision for insurance data sharing, or null. */
export async function latestInsuranceConsent(userId: string) {
  return prisma.consentRecord.findFirst({
    where: { userId, consentType: "INSURANCE_DATA_SHARING" },
    orderBy: { grantedAt: "desc" },
  });
}

/**
 * Whether the account currently holds insurance-data consent.
 *
 * Read before anything is submitted to an insurer. A revoked consent reads as
 * false, and no submission path may treat "no record" as consent.
 */
export async function hasInsuranceConsent(userId: string): Promise<boolean> {
  const record = await latestInsuranceConsent(userId);
  return Boolean(record?.granted);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const POLICY_INCLUDE = { insurer: true, product: true, familyMember: true } as const;

export async function listPoliciesForOwner(ownerUserId: string): Promise<PolicyRecord[]> {
  return prisma.insurancePolicy.findMany({
    where: { ownerUserId, deletedAt: null },
    include: POLICY_INCLUDE,
    orderBy: [{ status: "asc" }, { renewalDate: "asc" }, { createdAt: "desc" }],
  });
}

/**
 * Loads one policy and proves the caller may see it.
 *
 * The row is fetched by id alone and then passed through `assertOwnership`, so a
 * guessed id from a URL produces an audited denial rather than a silent 404 that
 * hides the attempt.
 */
export async function getPolicyForOwner(input: {
  user: AuthenticatedUser;
  policyId: string;
  context?: RequestContext;
}): Promise<PolicyRecord | null> {
  const policy = await prisma.insurancePolicy.findFirst({
    where: { id: input.policyId, deletedAt: null },
    include: POLICY_INCLUDE,
  });
  if (!policy) return null;

  await assertOwnership({
    user: input.user,
    ownerUserId: policy.ownerUserId,
    permission: "insurance.manage_own",
    entityType: "insurance_policy",
    entityId: policy.id,
  });

  return policy;
}

/**
 * Policies whose renewal falls inside the window. Used to warn a patient before
 * cover lapses, which is the one moment a lapse actually costs them money.
 */
export async function listRenewals(ownerUserId: string, withinDays = 60): Promise<PolicyRecord[]> {
  const now = new Date();
  const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  return prisma.insurancePolicy.findMany({
    where: {
      ownerUserId,
      deletedAt: null,
      renewalDate: { gte: now, lte: until },
      status: { in: ["ACTIVE", "UNKNOWN"] },
    },
    include: POLICY_INCLUDE,
    orderBy: { renewalDate: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type SavePolicyResult = { created: boolean; policy: PolicyRecord };

/**
 * Creates or updates a policy the caller owns.
 *
 * `verificationSource` is deliberately not read from the input: a policy written
 * here is always `SELF_DECLARED` on creation and keeps whatever source it already
 * had on update. Raising it is a separate, audited administrative act.
 */
export async function savePolicy(input: {
  user: AuthenticatedUser;
  data: PolicyInput;
  context?: RequestContext;
}): Promise<SavePolicyResult> {
  const { data } = input;
  const consentAt = data.consentAcknowledged ? new Date() : null;

  const base = {
    insurerName: data.insurerName,
    insurerId: data.insurerId ?? null,
    productId: data.productId ?? null,
    productName: data.productName ?? null,
    policyNumber: data.policyNumber,
    memberId: data.memberId ?? null,
    policyHolderName: data.policyHolderName,
    coveredMemberNames: data.coveredMemberNames,
    coverType: data.coverType,
    sumInsuredInr: data.sumInsuredPaise === undefined ? null : paiseToRupees(data.sumInsuredPaise),
    premiumInr: data.premiumPaise === undefined ? null : paiseToRupees(data.premiumPaise),
    premiumFrequency: data.premiumFrequency ?? null,
    startDate: data.startDate ?? null,
    renewalDate: data.renewalDate ?? null,
    roomRentLimitNote: data.roomRentLimitNote ?? null,
    coPaymentNote: data.coPaymentNote ?? null,
    deductibleInr: data.deductiblePaise === undefined ? null : paiseToRupees(data.deductiblePaise),
    waitingPeriodNote: data.waitingPeriodNote ?? null,
    exclusions: data.exclusions,
    status: data.status,
  };

  if (data.id) {
    const existing = await getPolicyForOwner({ user: input.user, policyId: data.id, context: input.context });
    if (!existing) throw new Error("That policy could not be found.");

    const policy = await prisma.insurancePolicy.update({
      where: { id: existing.id },
      data: {
        ...base,
        familyMemberId: data.familyMemberId ?? null,
        consentAcknowledgedAt: consentAt ?? existing.consentAcknowledgedAt,
        consentPolicyVersion: consentAt ? INSURANCE_CONSENT_POLICY_VERSION : existing.consentPolicyVersion,
        retentionUntil: existing.retentionUntil,
      },
      include: POLICY_INCLUDE,
    });

    await recordAuditEvent({
      action: "insurance.policy_updated",
      entityType: "insurance_policy",
      entityId: policy.id,
      actorUserId: input.user.id,
      context: input.context,
      metadata: { insurerName: policy.insurerName, verificationSource: policy.verificationSource },
    });

    return { created: false, policy };
  }

  const policy = await prisma.insurancePolicy.create({
    data: {
      ...base,
      ownerUserId: input.user.id,
      familyMemberId: data.familyMemberId ?? null,
      verificationSource: "SELF_DECLARED",
      consentAcknowledgedAt: consentAt,
      consentPolicyVersion: consentAt ? INSURANCE_CONSENT_POLICY_VERSION : null,
      retentionUntil: retentionDeadline(POLICY_RETENTION_DAYS),
    },
    include: POLICY_INCLUDE,
  });

  await recordAuditEvent({
    action: "insurance.policy_recorded",
    entityType: "insurance_policy",
    entityId: policy.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { insurerName: policy.insurerName, coverType: policy.coverType },
  });

  return { created: true, policy };
}

/** Soft-deletes a policy. The row survives so an existing claim keeps its policy. */
export async function deletePolicy(input: {
  user: AuthenticatedUser;
  policyId: string;
  context?: RequestContext;
}): Promise<void> {
  const policy = await getPolicyForOwner({ user: input.user, policyId: input.policyId, context: input.context });
  if (!policy) throw new Error("That policy could not be found.");

  const liveClaims = await prisma.insuranceClaim.count({
    where: { policyId: policy.id, deletedAt: null, status: { notIn: ["CLOSED", "WITHDRAWN"] } },
  });
  if (liveClaims > 0) {
    throw new Error(
      "This policy has an open claim against it, so it cannot be removed. Close or withdraw the claim first.",
    );
  }

  await prisma.insurancePolicy.update({ where: { id: policy.id }, data: { deletedAt: new Date() } });

  await recordAuditEvent({
    action: "insurance.policy_deleted",
    entityType: "insurance_policy",
    entityId: policy.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { insurerName: policy.insurerName },
  });
}

/**
 * Sets a policy's verification source. Administrative only — called from the
 * platform administrator surface, never from a patient form.
 */
export async function recordPolicyVerification(input: {
  actor: AuthenticatedUser;
  policyId: string;
  source: PolicyVerificationSource;
  notes?: string;
  context?: RequestContext;
}): Promise<PolicyRecord> {
  const policy = await prisma.insurancePolicy.update({
    where: { id: input.policyId },
    data: {
      verificationSource: input.source,
      verificationNotes: input.notes ?? null,
      verifiedAt: new Date(),
      verifiedById: input.actor.id,
    },
    include: POLICY_INCLUDE,
  });

  await recordAuditEvent({
    action: "insurance.policy_updated",
    entityType: "insurance_policy",
    entityId: policy.id,
    actorUserId: input.actor.id,
    context: input.context,
    metadata: { verificationSource: input.source },
  });

  return policy;
}

// ---------------------------------------------------------------------------
// Coverage summary
// ---------------------------------------------------------------------------

export type CoverageTerm = {
  key: keyof typeof COVERAGE_TERM_LABELS;
  label: string;
  description: string;
  /** The value a verified source supplied, or null when none did. */
  value: string | null;
  /** What to render: the value, or the shared "not published" sentence. */
  display: string;
  verified: boolean;
};

export type CoverageSummary = {
  policyId: string;
  insurerName: string;
  coverType: InsuranceCoverType;
  sumInsuredPaise: number | null;
  sumInsuredDisplay: string;
  source: PolicyVerificationSource;
  sourceLabel: string;
  sourceDetail: string;
  /** True only when a document or the insurer backed these figures. */
  sourceVerified: boolean;
  tone: (typeof POLICY_VERIFICATION_SOURCE_COPY)[PolicyVerificationSource]["tone"];
  terms: CoverageTerm[];
  /** The sentence that must accompany every coverage figure on screen. */
  certaintyNotice: string;
};

/**
 * Turns a stored policy into the tiles the UI renders.
 *
 * A term with no value is displayed with `COVERAGE_NOT_PUBLISHED` and marked
 * unverified. Nothing is defaulted to a plausible figure: an absent room-rent cap
 * is rendered as absent, because guessing it is how a patient is misled about a
 * bill they will have to pay.
 */
export function summariseCoverage(policy: PolicyRecord): CoverageSummary {
  const source = POLICY_VERIFICATION_SOURCE_COPY[policy.verificationSource];
  const badge = COVERAGE_SOURCE_BADGE[policy.verificationSource];
  const verified = policy.verificationSource !== "SELF_DECLARED";
  const sumInsuredPaise = policy.sumInsuredInr === null ? null : rupeesToPaise(policy.sumInsuredInr);

  const terms: CoverageTerm[] = [
    buildTerm("waitingPeriod", policy.waitingPeriodNote, verified),
    buildTerm("exclusion", policy.exclusions.length > 0 ? policy.exclusions.join(", ") : null, verified),
    buildTerm("coPayment", policy.coPaymentNote, verified),
    buildTerm(
      "deductible",
      policy.deductibleInr === null ? null : formatSumInsured(rupeesToPaise(policy.deductibleInr)),
      verified,
    ),
    buildTerm("subLimit", policy.roomRentLimitNote, verified),
    buildTerm("roomRentCap", policy.roomRentLimitNote, verified),
    buildTerm("preExisting", null, false),
  ];

  return {
    policyId: policy.id,
    insurerName: policy.insurerName,
    coverType: policy.coverType,
    sumInsuredPaise,
    sumInsuredDisplay: sumInsuredPaise === null ? COVERAGE_TERM_LABELS.coPayment.notPublished : formatSumInsured(sumInsuredPaise),
    source: policy.verificationSource,
    sourceLabel: badge.label,
    sourceDetail: badge.detail,
    sourceVerified: source.tone === "success",
    tone: source.tone,
    terms,
    certaintyNotice: verified ? ESTIMATE_VS_CONFIRMED.confirmed.detail : ESTIMATE_VS_CONFIRMED.estimate.detail,
  };
}

function buildTerm(
  key: keyof typeof COVERAGE_TERM_LABELS,
  value: string | null,
  verified: boolean,
): CoverageTerm {
  const meta = COVERAGE_TERM_LABELS[key];
  const trimmed = value && value.trim() !== "" ? value.trim() : null;
  return {
    key,
    label: meta.label,
    description: meta.description,
    value: trimmed,
    display: trimmed ?? meta.notPublished,
    // A term is only "verified" when the policy itself came from a verified source.
    verified: verified && trimmed !== null,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type ProductSummary = {
  id: string;
  insurerId: string;
  insurerName: string;
  slug: string;
  productName: string;
  coverType: InsuranceCoverType;
  sumInsuredMinPaise: number | null;
  sumInsuredMaxPaise: number | null;
  premiumFromPaise: number | null;
  roomRentLimitNote: string | null;
  coPaymentNote: string | null;
  deductiblePaise: number | null;
  waitingPeriodNote: string | null;
  preExistingWaitingMonths: number | null;
  maternityWaitingMonths: number | null;
  exclusions: string[];
  inclusions: string[];
  networkHospitalCount: number | null;
  source: InsuranceProductSource;
  sourceLabel: string;
  sourceDetail: string;
  sourceVerified: boolean;
  verificationStatus: VerificationState;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
};

type ProductRow = Prisma.InsuranceProductGetPayload<{ include: { insurer: true } }>;

export function toProductSummary(product: ProductRow): ProductSummary {
  const source = PRODUCT_SOURCE_COPY[product.sourceOfTruth];
  return {
    id: product.id,
    insurerId: product.insurerId,
    insurerName: product.insurer.name,
    slug: product.slug,
    productName: product.productName,
    coverType: product.coverType,
    sumInsuredMinPaise: product.sumInsuredMinInr === null ? null : rupeesToPaise(product.sumInsuredMinInr),
    sumInsuredMaxPaise: product.sumInsuredMaxInr === null ? null : rupeesToPaise(product.sumInsuredMaxInr),
    premiumFromPaise: product.premiumFromInr === null ? null : rupeesToPaise(product.premiumFromInr),
    roomRentLimitNote: product.roomRentLimitNote,
    coPaymentNote: product.coPaymentNote,
    deductiblePaise: product.deductibleInr === null ? null : rupeesToPaise(product.deductibleInr),
    waitingPeriodNote: product.waitingPeriodNote,
    preExistingWaitingMonths: product.preExistingWaitingMonths,
    maternityWaitingMonths: product.maternityWaitingMonths,
    exclusions: product.exclusions,
    inclusions: product.inclusions,
    networkHospitalCount: product.networkHospitalCount,
    source: product.sourceOfTruth,
    sourceLabel: source.label,
    sourceDetail: source.detail,
    sourceVerified: source.verified,
    verificationStatus: product.verificationStatus,
    effectiveFrom: product.effectiveFrom,
    effectiveTo: product.effectiveTo,
  };
}

export type PolicyComparison = {
  policies: CoverageSummary[];
  products: ProductSummary[];
};

/**
 * Lines up the caller's own policies, and optionally the published products of
 * the insurers those policies are with.
 */
export async function comparePolicies(input: {
  user: AuthenticatedUser;
  policyIds: string[];
  includeProducts: boolean;
  context?: RequestContext;
}): Promise<PolicyComparison> {
  const policies: PolicyRecord[] = [];
  for (const policyId of input.policyIds) {
    const policy = await getPolicyForOwner({ user: input.user, policyId, context: input.context });
    if (policy) policies.push(policy);
  }

  if (!input.includeProducts || policies.length === 0) {
    return { policies: policies.map(summariseCoverage), products: [] };
  }

  const insurerIds = Array.from(new Set(policies.map((policy) => policy.insurerId).filter((id): id is string => Boolean(id))));
  const products = insurerIds.length === 0 ? [] : await listPublishedProducts({ insurerIds });

  return { policies: policies.map(summariseCoverage), products };
}

// ---------------------------------------------------------------------------
// Published products
// ---------------------------------------------------------------------------

/**
 * Products whose terms came from a verified source, for comparison and for the
 * patient-facing catalogue.
 *
 * A product whose source is `PLATFORM_UNVERIFIED`, or whose renewal date has
 * passed, is not returned: the whole point of the catalogue is that everything in
 * it can be relied on.
 */
export async function listPublishedProducts(filter: {
  insurerIds?: string[];
  coverType?: InsuranceCoverType;
  limit?: number;
} = {}): Promise<ProductSummary[]> {
  const now = new Date();
  const rows = await prisma.insuranceProduct.findMany({
    where: {
      isActive: true,
      verificationStatus: "VERIFIED",
      sourceOfTruth: { in: ["INSURER_PUBLISHED", "INSURER_API", "PARTNER_CONFIRMED"] },
      insurer: { isActive: true },
      ...(filter.insurerIds && filter.insurerIds.length > 0 ? { insurerId: { in: filter.insurerIds } } : {}),
      ...(filter.coverType ? { coverType: filter.coverType } : {}),
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    include: { insurer: true },
    orderBy: [{ insurerId: "asc" }, { productName: "asc" }],
    take: filter.limit ?? 60,
  });

  return rows.map(toProductSummary);
}

// ---------------------------------------------------------------------------
// Policy documents
// ---------------------------------------------------------------------------

export type PolicyDocumentUploadResult =
  | { ok: true; document: PolicyDocumentRecord }
  | { ok: false; message: string };

/**
 * Stores a policy document privately and records it against the policy.
 *
 * The bytes never leave the server: the object is written to the private bucket
 * and the browser is only ever handed a short-lived signed link, created on
 * demand by `createPolicyDocumentLink`. A file that fails a malware scan is
 * refused outright and nothing is stored.
 */
export async function uploadPolicyDocument(input: {
  user: AuthenticatedUser;
  policyId: string;
  kind: InsurancePolicyDocumentKind;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  context?: RequestContext;
}): Promise<PolicyDocumentUploadResult> {
  const policy = await getPolicyForOwner({ user: input.user, policyId: input.policyId, context: input.context });
  if (!policy) return { ok: false, message: "That policy could not be found." };

  if (!isAcceptedDocumentMimeType(input.mimeType)) {
    return { ok: false, message: "That file type is not accepted. Upload a PDF, JPEG, PNG or WebP file." };
  }

  const verdict = await scanAiUpload({ bytes: input.bytes, fileName: input.fileName, mimeType: input.mimeType });
  if (verdict.status === "INFECTED") {
    await recordAuditEvent({
      action: "insurance.policy_document_uploaded",
      entityType: "insurance_policy_document",
      entityId: policy.id,
      outcome: "FAILURE",
      actorUserId: input.user.id,
      context: input.context,
      metadata: { rejected: "malware" },
    });
    return { ok: false, message: verdict.detail };
  }

  const key = buildDocumentKey({
    namespace: "insurance-policies",
    ownerUserId: input.user.id,
    parentId: policy.id,
    mimeType: input.mimeType,
  });

  const stored = await storeDocument({ key, bytes: input.bytes, contentType: input.mimeType });
  if (!stored.ok) return { ok: false, message: stored.error.message };

  const document = await prisma.insurancePolicyDocument.create({
    data: {
      policyId: policy.id,
      uploadedById: input.user.id,
      kind: input.kind,
      fileName: input.fileName.slice(0, 200),
      mimeType: input.mimeType,
      sizeBytes: stored.data.sizeBytes,
      storageBucket: "orvexa-ai-uploads",
      storageKey: stored.data.key,
      checksumSha256: stored.data.checksum,
      // A file that could not be scanned is never marked READY as if it were clean.
      status: verdict.status === "FAILED" ? "PENDING" : "READY",
      malwareScan: verdict.status,
      malwareScanDetail: verdict.detail,
      retentionUntil: retentionDeadline(POLICY_RETENTION_DAYS),
    },
  });

  await recordAuditEvent({
    action: "insurance.policy_document_uploaded",
    entityType: "insurance_policy_document",
    entityId: document.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { policyId: policy.id, kind: input.kind, malwareScan: verdict.status },
  });

  return { ok: true, document };
}

export async function listPolicyDocuments(policyId: string): Promise<PolicyDocumentRecord[]> {
  return prisma.insurancePolicyDocument.findMany({
    where: { policyId, deletedAt: null, status: { not: "DELETED" } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Issues a short-lived link to one policy document.
 *
 * The document is loaded through its policy so the ownership check is the
 * policy's, not the document's, and the access is audited.
 */
export async function createPolicyDocumentLink(input: {
  user: AuthenticatedUser;
  policyId: string;
  documentId: string;
  context?: RequestContext;
}): Promise<{ ok: true; url: string; expiresAt: Date } | { ok: false; message: string }> {
  const policy = await getPolicyForOwner({ user: input.user, policyId: input.policyId, context: input.context });
  if (!policy) return { ok: false, message: "That policy could not be found." };

  const document = await prisma.insurancePolicyDocument.findFirst({
    where: { id: input.documentId, policyId: policy.id, deletedAt: null },
  });
  if (!document) return { ok: false, message: "That document could not be found." };

  const link = await createDocumentLink(document.storageKey, DOCUMENT_LINK_TTL_SECONDS);
  if (!link.ok) return { ok: false, message: link.error.message };

  await recordAuditEvent({
    action: "insurance.policy_document_accessed",
    entityType: "insurance_policy_document",
    entityId: document.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { policyId: policy.id },
  });

  return { ok: true, url: link.data.url, expiresAt: link.data.expiresAt };
}

export async function removePolicyDocument(input: {
  user: AuthenticatedUser;
  policyId: string;
  documentId: string;
  context?: RequestContext;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const policy = await getPolicyForOwner({ user: input.user, policyId: input.policyId, context: input.context });
  if (!policy) return { ok: false, message: "That policy could not be found." };

  const document = await prisma.insurancePolicyDocument.findFirst({
    where: { id: input.documentId, policyId: policy.id, deletedAt: null },
  });
  if (!document) return { ok: false, message: "That document could not be found." };

  await removeDocument(document.storageKey);
  await prisma.insurancePolicyDocument.update({
    where: { id: document.id },
    data: { status: "DELETED", deletedAt: new Date() },
  });

  await recordAuditEvent({
    action: "insurance.policy_document_deleted",
    entityType: "insurance_policy_document",
    entityId: document.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { policyId: policy.id },
  });

  return { ok: true };
}
