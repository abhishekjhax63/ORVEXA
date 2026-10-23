import "server-only";

import { randomBytes } from "node:crypto";

import type {
  ClaimDecision,
  ClaimDocumentKind,
  ClaimEventType,
  ClaimQueryStatus,
  ClaimStatus,
  ClaimType,
  PolicyVerificationSource,
  Prisma,
  PreAuthStatus,
  Role,
  SettlementStatus,
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
  CLAIM_STATUS_COPY,
  CLAIM_TIMELINE,
  DECISION_ATTRIBUTION_NOTICE,
  ESTIMATE_VS_CONFIRMED,
  INSURANCE_CONSENT_POLICY_VERSION,
} from "@/lib/insurance/labels";
import { amountBandRupees, formatPaise, paiseToRupees, rupeesToPaise } from "@/lib/insurance/money";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import type { ClaimCreateInput, ClaimUpdateInput } from "@/lib/validation/insurance";

/**
 * Claims: creation, the administrative lifecycle, the insurer's recorded
 * decision, queries, settlement and evidence.
 *
 * Three rules are load-bearing and are enforced here rather than trusted to a
 * caller:
 *
 *  1. **ORVEXA never decides.** A decision is only ever written from a record
 *     that names who communicated it. `recordClaimDecision` refuses an
 *     attribution that points at the platform, because a decision attributed to
 *     ORVEXA is exactly the thing this whole surface exists to avoid.
 *  2. **A duplicate submission is suppressed, not filed twice.** A deterministic
 *     `dedupeKey` is computed on the server and a second claim with the same key
 *     is refused, recorded against the claim already on file, and audited.
 *  3. **Nothing advances on its own.** A status only moves through
 *     `changeClaimStatus` (administrative) or a recorded insurer decision; there
 *     is no timer and no inference that moves a claim forward.
 */

const CLAIM_RETENTION_DAYS = 365 * 10;

/** Reference alphabet omits characters that are misread when read aloud. */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CLAIM_REFERENCE_PATTERN = /^ORX-CL-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

/** A patient-facing claim reference, e.g. `ORX-CL-8F3P2W`. */
export function generateClaimReference(): string {
  const bytes = randomBytes(6);
  let suffix = "";
  for (const byte of bytes) suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `ORX-CL-${suffix}`;
}

export function isClaimReference(value: string): boolean {
  return CLAIM_REFERENCE_PATTERN.test(value);
}

export const CLAIM_INCLUDE = {
  policy: true,
  insurer: true,
  hospital: true,
  familyMember: true,
  patient: { select: { id: true, fullName: true } },
} as const;

export type ClaimRecord = Prisma.InsuranceClaimGetPayload<{ include: typeof CLAIM_INCLUDE }>;

export type ClaimEventRecord = Prisma.InsuranceClaimEventGetPayload<Record<string, never>>;
export type ClaimQueryRecord = Prisma.InsuranceClaimQueryGetPayload<Record<string, never>>;
export type ClaimDocumentRecord = Prisma.InsuranceClaimDocumentGetPayload<Record<string, never>>;
export type SettlementRecord = Prisma.InsuranceSettlementGetPayload<Record<string, never>>;

/** Who is acting, for the immutable claim trail. */
export type ClaimActor = {
  userId: string;
  label: string;
  role: Role | null;
};

export function claimActorFromUser(user: AuthenticatedUser, role: Role | null = null): ClaimActor {
  return { userId: user.id, label: user.fullName, role };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * Administrative moves a claim may make.
 *
 * The decision states are deliberately absent: a claim reaches `APPROVED`,
 * `PARTIALLY_APPROVED` or `REJECTED` only through `recordClaimDecision`, so a
 * status can never be nudged into looking like an outcome.
 */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  DRAFT: ["SUBMITTED", "WITHDRAWN"],
  SUBMITTED: ["ACKNOWLEDGED", "AWAITING_INFORMATION", "UNDER_REVIEW", "WITHDRAWN"],
  ACKNOWLEDGED: ["UNDER_REVIEW", "AWAITING_INFORMATION", "WITHDRAWN"],
  AWAITING_INFORMATION: ["UNDER_REVIEW", "ACKNOWLEDGED", "WITHDRAWN"],
  UNDER_REVIEW: ["AWAITING_INFORMATION", "CLOSED", "WITHDRAWN"],
  PRE_AUTH_PENDING: ["PRE_AUTH_APPROVED", "PRE_AUTH_PARTIALLY_APPROVED", "PRE_AUTH_REJECTED", "WITHDRAWN"],
  PRE_AUTH_APPROVED: ["UNDER_REVIEW", "CLOSED"],
  PRE_AUTH_PARTIALLY_APPROVED: ["UNDER_REVIEW", "CLOSED"],
  PRE_AUTH_REJECTED: ["UNDER_REVIEW", "AWAITING_INFORMATION", "CLOSED"],
  APPROVED: ["SETTLED", "CLOSED"],
  PARTIALLY_APPROVED: ["SETTLED", "CLOSED"],
  REJECTED: ["CLOSED", "AWAITING_INFORMATION"],
  SETTLED: ["CLOSED"],
  CLOSED: [],
  WITHDRAWN: [],
};

/** Statuses that may only be reached from a recorded insurer decision. */
export const DECISION_ONLY_STATUSES: readonly ClaimStatus[] = [
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "PRE_AUTH_APPROVED",
  "PRE_AUTH_PARTIALLY_APPROVED",
  "PRE_AUTH_REJECTED",
];

export function claimTransitionAllowed(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_TRANSITIONS[from].includes(to);
}

function decisionStatus(decision: ClaimDecision): ClaimStatus | null {
  switch (decision) {
    case "APPROVED":
      return "APPROVED";
    case "PARTIALLY_APPROVED":
      return "PARTIALLY_APPROVED";
    case "REJECTED":
      return "REJECTED";
    case "QUERY_RAISED":
      return "AWAITING_INFORMATION";
    case "WITHDRAWN":
      return "WITHDRAWN";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

async function appendClaimEvent(
  client: Prisma.TransactionClient,
  input: {
    claimId?: string | null;
    preAuthId?: string | null;
    eligibilityId?: string | null;
    type: ClaimEventType;
    actor: ClaimActor | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    note?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await client.insuranceClaimEvent.create({
    data: {
      claimId: input.claimId ?? null,
      preAuthId: input.preAuthId ?? null,
      eligibilityId: input.eligibilityId ?? null,
      type: input.type,
      actorUserId: input.actor?.userId ?? null,
      actorRole: input.actor?.role ?? null,
      actorLabel: input.actor?.label ?? null,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
      metadata: input.metadata,
    },
  });
}

export async function listClaimEvents(claimId: string): Promise<ClaimEventRecord[]> {
  return prisma.insuranceClaimEvent.findMany({
    where: { claimId },
    orderBy: { createdAt: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listClaimsForPatient(patientUserId: string): Promise<ClaimRecord[]> {
  return prisma.insuranceClaim.findMany({
    where: { patientUserId, deletedAt: null },
    include: CLAIM_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getClaimForPatient(input: {
  user: AuthenticatedUser;
  claimId: string;
  context?: RequestContext;
}): Promise<ClaimRecord | null> {
  const claim = await prisma.insuranceClaim.findFirst({
    where: { id: input.claimId, deletedAt: null },
    include: CLAIM_INCLUDE,
  });
  if (!claim) return null;

  await assertOwnership({
    user: input.user,
    ownerUserId: claim.patientUserId,
    permission: "insurance.manage_own",
    entityType: "insurance_claim",
    entityId: claim.id,
  });

  return claim;
}

export async function getClaimById(claimId: string): Promise<ClaimRecord | null> {
  return prisma.insuranceClaim.findFirst({ where: { id: claimId, deletedAt: null }, include: CLAIM_INCLUDE });
}

// ---------------------------------------------------------------------------
// Duplicate suppression
// ---------------------------------------------------------------------------

/**
 * Deterministic key over policy, type, admission date and a wide amount band.
 *
 * The band is deliberately coarse so a second attempt typed with a slightly
 * different figure still collides. The key is computed on the server and stored,
 * so suppression cannot be bypassed by omitting a field from the request.
 */
export function buildClaimDedupeKey(input: {
  policyId: string;
  claimType: ClaimType;
  admissionDate: Date | null;
  claimedAmountRupees: number;
}): string {
  const day = input.admissionDate ? input.admissionDate.toISOString().slice(0, 10) : "no-admission-date";
  return [input.policyId, input.claimType, day, amountBandRupees(input.claimedAmountRupees)].join("|");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateClaimResult = {
  created: boolean;
  /** True when this submission matched a claim already on file. */
  duplicateSuppressed: boolean;
  claim: ClaimRecord;
};

/**
 * Creates a claim, or reports that an equivalent one is already on file.
 *
 * A duplicate is never filed twice: the existing claim is returned, the attempt
 * is written to the claim's trail as a note, and an
 * `insurance.claim_duplicate_suppressed` audit event is recorded.
 */
export async function createClaim(input: {
  user: AuthenticatedUser;
  data: ClaimCreateInput;
  context?: RequestContext;
}): Promise<CreateClaimResult> {
  const policy = await prisma.insurancePolicy.findFirst({
    where: { id: input.data.policyId, deletedAt: null },
  });
  if (!policy) throw new Error("That policy could not be found.");

  await assertOwnership({
    user: input.user,
    ownerUserId: policy.ownerUserId,
    permission: "insurance.manage_own",
    entityType: "insurance_policy",
    entityId: policy.id,
  });

  const claimedAmountRupees =
    input.data.claimedAmountPaise === undefined
      ? (input.data.estimatedCostPaise === undefined ? 0 : paiseToRupees(input.data.estimatedCostPaise))
      : paiseToRupees(input.data.claimedAmountPaise);

  const dedupeKey = buildClaimDedupeKey({
    policyId: policy.id,
    claimType: input.data.claimType,
    admissionDate: input.data.admissionDate ?? null,
    claimedAmountRupees,
  });

  const existing = await prisma.insuranceClaim.findFirst({
    where: { policyId: policy.id, dedupeKey, deletedAt: null },
    include: CLAIM_INCLUDE,
  });

  if (existing) {
    const actor = claimActorFromUser(input.user);
    await appendClaimEvent(prisma, {
      claimId: existing.id,
      type: "NOTE",
      actor,
      note: "A second submission with the same policy, treatment date and amount was detected and was not filed again.",
      metadata: { duplicateSuppressed: true },
    });
    await recordAuditEvent({
      action: "insurance.claim_duplicate_suppressed",
      entityType: "insurance_claim",
      entityId: existing.id,
      actorUserId: input.user.id,
      context: input.context,
      metadata: { dedupeKey, policyId: policy.id },
    });
    return { created: false, duplicateSuppressed: true, claim: existing };
  }

  // A near-duplicate — same policy, same admission date and type, a different
  // amount band — is still filed, but is linked to the earlier claim so a reader
  // can see the two together.
  const nearDuplicate = await prisma.insuranceClaim.findFirst({
    where: {
      policyId: policy.id,
      dedupeKey: { not: dedupeKey },
      claimType: input.data.claimType,
      admissionDate: input.data.admissionDate ?? null,
      deletedAt: null,
      status: { notIn: ["WITHDRAWN", "CLOSED"] },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  const hospitalName = await resolveHospitalName(input.data.hospitalId ?? null, input.data.hospitalName ?? null);
  const actor = claimActorFromUser(input.user);
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const claim = await tx.insuranceClaim.create({
      data: {
        reference: generateClaimReference(),
        claimType: input.data.claimType,
        status: "DRAFT",
        patientUserId: input.user.id,
        familyMemberId: input.data.familyMemberId ?? null,
        initiatedById: input.user.id,
        policyId: policy.id,
        insurerId: policy.insurerId,
        hospitalId: input.data.hospitalId ?? null,
        hospitalName,
        treatmentSummary: input.data.treatmentSummary ?? null,
        admissionDate: input.data.admissionDate ?? null,
        dischargeDate: input.data.dischargeDate ?? null,
        diagnosisSummary: input.data.diagnosisSummary ?? null,
        treatingDoctorName: input.data.treatingDoctorName ?? null,
        estimatedCostInr: input.data.estimatedCostPaise === undefined ? null : paiseToRupees(input.data.estimatedCostPaise),
        claimedAmountInr: input.data.claimedAmountPaise === undefined ? null : paiseToRupees(input.data.claimedAmountPaise),
        dedupeKey,
        duplicateOfClaimId: nearDuplicate?.id ?? null,
        // The consent snapshot is written from the server clock and the current
        // policy version, never from a value the browser supplied.
        consentAcknowledgedAt: now,
        consentPolicyVersion: INSURANCE_CONSENT_POLICY_VERSION,
        retentionUntil: retentionDeadline(CLAIM_RETENTION_DAYS),
      },
      include: CLAIM_INCLUDE,
    });

    await appendClaimEvent(tx, { claimId: claim.id, type: "CREATED", actor, toStatus: "DRAFT" });

    if (nearDuplicate) {
      await appendClaimEvent(tx, {
        claimId: claim.id,
        type: "NOTE",
        actor,
        note: "This claim has the same policy, treatment date and type as a claim already on file, and has been linked to it.",
        metadata: { duplicateOfClaimId: nearDuplicate.id },
      });
    }

    return claim;
  });

  await recordAuditEvent({
    action: "insurance.claim_created",
    entityType: "insurance_claim",
    entityId: created.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      reference: created.reference,
      claimType: created.claimType,
      policyId: policy.id,
      linkedDuplicate: nearDuplicate?.id ?? null,
    },
  });

  return { created: true, duplicateSuppressed: false, claim: created };
}

async function resolveHospitalName(hospitalId: string | null, typedName: string | null): Promise<string | null> {
  if (hospitalId) {
    const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId }, select: { name: true } });
    if (hospital) return hospital.name;
  }
  return typedName;
}

// ---------------------------------------------------------------------------
// Update / withdraw
// ---------------------------------------------------------------------------

export async function updateClaim(input: {
  user: AuthenticatedUser;
  data: ClaimUpdateInput;
  context?: RequestContext;
}): Promise<ClaimRecord> {
  const claim = await getClaimForPatient({ user: input.user, claimId: input.data.claimId, context: input.context });
  if (!claim) throw new Error("That claim could not be found.");
  if (!["DRAFT", "SUBMITTED", "ACKNOWLEDGED", "AWAITING_INFORMATION"].includes(claim.status)) {
    throw new Error("This claim is already in progress with the insurer, so it can no longer be edited.");
  }

  const hospitalName =
    input.data.hospitalName !== undefined
      ? await resolveHospitalName(input.data.hospitalId ?? claim.hospitalId, input.data.hospitalName ?? null)
      : claim.hospitalName;

  const updated = await prisma.insuranceClaim.update({
    where: { id: claim.id },
    data: {
      hospitalId: input.data.hospitalId ?? claim.hospitalId,
      hospitalName,
      treatmentSummary: input.data.treatmentSummary ?? claim.treatmentSummary,
      admissionDate: input.data.admissionDate ?? claim.admissionDate,
      dischargeDate: input.data.dischargeDate ?? claim.dischargeDate,
      diagnosisSummary: input.data.diagnosisSummary ?? claim.diagnosisSummary,
      treatingDoctorName: input.data.treatingDoctorName ?? claim.treatingDoctorName,
      estimatedCostInr:
        input.data.estimatedCostPaise === undefined ? claim.estimatedCostInr : paiseToRupees(input.data.estimatedCostPaise),
      claimedAmountInr:
        input.data.claimedAmountPaise === undefined ? claim.claimedAmountInr : paiseToRupees(input.data.claimedAmountPaise),
    },
    include: CLAIM_INCLUDE,
  });

  await recordAuditEvent({
    action: "insurance.claim_updated",
    entityType: "insurance_claim",
    entityId: updated.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { reference: updated.reference },
  });

  return updated;
}

/**
 * Withdraws a claim that the insurer has not decided.
 *
 * A claim with a recorded decision cannot be withdrawn here: from the platform's
 * point of view that outcome is the insurer's and stands, whatever the patient
 * does next.
 */
export async function withdrawClaim(input: {
  user: AuthenticatedUser;
  claimId: string;
  reason?: string;
  context?: RequestContext;
}): Promise<ClaimRecord> {
  const claim = await getClaimForPatient({ user: input.user, claimId: input.claimId, context: input.context });
  if (!claim) throw new Error("That claim could not be found.");
  if (claim.status === "WITHDRAWN") throw new Error("This claim has already been withdrawn.");
  if (claim.decision !== "PENDING") {
    throw new Error(
      "The insurer has already recorded an outcome on this claim, so it cannot be withdrawn. Contact the insurer if you disagree with it.",
    );
  }

  const actor = claimActorFromUser(input.user);
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.insuranceClaim.update({
      where: { id: claim.id },
      data: {
        status: "WITHDRAWN",
        decision: "WITHDRAWN",
        decisionNotes: input.reason ?? null,
        closedAt: new Date(),
      },
      include: CLAIM_INCLUDE,
    });
    await appendClaimEvent(tx, {
      claimId: next.id,
      type: "WITHDRAWN",
      actor,
      fromStatus: claim.status,
      toStatus: "WITHDRAWN",
      note: input.reason ?? null,
    });
    return next;
  });

  await recordAuditEvent({
    action: "insurance.claim_withdrawn",
    entityType: "insurance_claim",
    entityId: updated.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { reference: updated.reference },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

export type ClaimStatusChangeOutcome =
  | { ok: true; claim: ClaimRecord }
  | { ok: false; message: string };

/**
 * Moves a claim's administrative status.
 *
 * Refuses the decision states outright — those come only from a recorded insurer
 * decision — and refuses any move the transition table does not allow.
 */
export async function changeClaimStatus(input: {
  claim: ClaimRecord;
  next: ClaimStatus;
  actor: ClaimActor;
  note?: string;
  context?: RequestContext;
}): Promise<ClaimStatusChangeOutcome> {
  if (DECISION_ONLY_STATUSES.includes(input.next)) {
    return {
      ok: false,
      message:
        "That status can only be reached by recording the insurer's decision. Use the decision form so the outcome is attributed to whoever communicated it.",
    };
  }
  if (!claimTransitionAllowed(input.claim.status, input.next)) {
    return { ok: false, message: `A claim cannot move from ${input.claim.status} to ${input.next}.` };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.insuranceClaim.update({
      where: { id: input.claim.id },
      data: {
        status: input.next,
        submittedAt: input.next === "SUBMITTED" ? new Date() : input.claim.submittedAt,
        acknowledgedAt: input.next === "ACKNOWLEDGED" ? new Date() : input.claim.acknowledgedAt,
        closedAt: input.next === "CLOSED" ? new Date() : input.claim.closedAt,
      },
      include: CLAIM_INCLUDE,
    });
    await appendClaimEvent(tx, {
      claimId: next.id,
      type: input.next === "SUBMITTED" ? "SUBMITTED" : input.next === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "STATUS_CHANGED",
      actor: input.actor,
      fromStatus: input.claim.status,
      toStatus: input.next,
      note: input.note ?? null,
    });
    return next;
  });

  await recordAuditEvent({
    action: "insurance.claim_status_changed",
    entityType: "insurance_claim",
    entityId: updated.id,
    actorUserId: input.actor.userId,
    context: input.context,
    metadata: { from: input.claim.status, to: input.next, reference: updated.reference },
  });

  return { ok: true, claim: updated };
}

// ---------------------------------------------------------------------------
// The insurer's decision
// ---------------------------------------------------------------------------

/** Refuses an attribution that points at the platform instead of the insurer. */
function attributionIsPlatform(value: string): boolean {
  return /orvexa|platform|automated|system/i.test(value);
}

export type RecordDecisionOutcome =
  | { ok: true; claim: ClaimRecord }
  | { ok: false; message: string };

/**
 * Records the outcome the insurer communicated.
 *
 * `attributedTo` is the whole point: a decision without a named human or
 * organisation behind it is refused, and an attribution that names the platform
 * is refused too, because ORVEXA does not decide claims.
 */
export async function recordClaimDecision(input: {
  claim: ClaimRecord;
  decision: Exclude<ClaimDecision, "PENDING">;
  attributedTo: string;
  decidedAt?: Date | null;
  approvedAmountPaise?: number | null;
  reason?: string | null;
  referenceNumber?: string | null;
  actor: ClaimActor;
  context?: RequestContext;
}): Promise<RecordDecisionOutcome> {
  if (attributionIsPlatform(input.attributedTo)) {
    return {
      ok: false,
      message:
        "A decision must be attributed to the insurer or the person who communicated it. ORVEXA does not decide claims, so it cannot be named as the source of one.",
    };
  }

  const nextStatus = decisionStatus(input.decision);
  if (!nextStatus) return { ok: false, message: "That is not a decision a reviewer can record." };

  if (["APPROVED", "PARTIALLY_APPROVED"].includes(input.decision)) {
    if (!input.approvedAmountPaise || input.approvedAmountPaise <= 0) {
      return { ok: false, message: "Record the amount the insurer approved." };
    }
  }
  if (["REJECTED", "PARTIALLY_APPROVED"].includes(input.decision) && !input.reason) {
    return { ok: false, message: "Record the reason the insurer gave." };
  }

  const approvedInr =
    ["APPROVED", "PARTIALLY_APPROVED"].includes(input.decision) && input.approvedAmountPaise
      ? paiseToRupees(input.approvedAmountPaise)
      : null;

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.insuranceClaim.update({
      where: { id: input.claim.id },
      data: {
        decision: input.decision,
        status: nextStatus,
        decisionNotes: input.reason ?? null,
        decisionReasonLabel: input.reason ?? null,
        decidedAt: input.decidedAt ?? new Date(),
        decidedByLabel: input.attributedTo,
        approvedAmountInr: approvedInr,
        insurerClaimNumber: input.referenceNumber ?? input.claim.insurerClaimNumber,
        closedAt: nextStatus === "WITHDRAWN" ? new Date() : input.claim.closedAt,
      },
      include: CLAIM_INCLUDE,
    });
    await appendClaimEvent(tx, {
      claimId: next.id,
      type: "DECISION_RECORDED",
      actor: input.actor,
      fromStatus: input.claim.status,
      toStatus: nextStatus,
      note: input.reason ?? null,
      metadata: {
        decision: input.decision,
        attributedTo: input.attributedTo,
        approvedAmountPaise: input.approvedAmountPaise ?? null,
      },
    });
    return next;
  });

  await recordAuditEvent({
    action: "insurance.claim_decision_recorded",
    entityType: "insurance_claim",
    entityId: updated.id,
    actorUserId: input.actor.userId,
    context: input.context,
    metadata: {
      decision: input.decision,
      attributedTo: input.attributedTo,
      reference: updated.reference,
    },
  });

  return { ok: true, claim: updated };
}

/**
 * Reverses a decision that was recorded in error.
 *
 * Kept separate from recording one, and audited under its own action, so a
 * reversal is never mistaken for a change in the insurer's position.
 */
export async function clearClaimDecision(input: {
  claim: ClaimRecord;
  actor: ClaimActor;
  reason: string;
  context?: RequestContext;
}): Promise<ClaimRecord> {
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.insuranceClaim.update({
      where: { id: input.claim.id },
      data: {
        decision: "PENDING",
        status: "UNDER_REVIEW",
        decisionNotes: null,
        decisionReasonLabel: null,
        decidedAt: null,
        decidedByLabel: null,
        approvedAmountInr: null,
      },
      include: CLAIM_INCLUDE,
    });
    await appendClaimEvent(tx, {
      claimId: next.id,
      type: "STATUS_CHANGED",
      actor: input.actor,
      fromStatus: input.claim.status,
      toStatus: "UNDER_REVIEW",
      note: `Recorded decision cleared: ${input.reason}`,
      metadata: { clearedDecision: input.claim.decision },
    });
    return next;
  });

  await recordAuditEvent({
    action: "insurance.claim_decision_cleared",
    entityType: "insurance_claim",
    entityId: updated.id,
    actorUserId: input.actor.userId,
    context: input.context,
    metadata: { cleared: input.claim.decision, reference: updated.reference },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Queries raised by the insurer
// ---------------------------------------------------------------------------

export type ClaimQueryOutcome =
  | { ok: true; query: ClaimQueryRecord; claim: ClaimRecord }
  | { ok: false; message: string };

/** Records a question the insurer (or a TPA) raised. */
export async function raiseClaimQuery(input: {
  claim: ClaimRecord;
  question: string;
  dueBy?: Date | null;
  actor: ClaimActor;
  context?: RequestContext;
}): Promise<ClaimQueryOutcome> {
  const query = await prisma.$transaction(async (tx) => {
    const created = await tx.insuranceClaimQuery.create({
      data: {
        claimId: input.claim.id,
        raisedByLabel: input.actor.label,
        raisedByUserId: input.actor.userId,
        question: input.question,
        dueBy: input.dueBy ?? null,
        status: "OPEN",
      },
    });

    await tx.insuranceClaim.update({
      where: { id: input.claim.id },
      data: { status: "AWAITING_INFORMATION" },
    });

    await appendClaimEvent(tx, {
      claimId: input.claim.id,
      type: "QUERY_RAISED",
      actor: input.actor,
      fromStatus: input.claim.status,
      toStatus: "AWAITING_INFORMATION",
      note: input.question,
      metadata: { queryId: created.id, dueBy: input.dueBy ? input.dueBy.toISOString() : null },
    });

    return created;
  });

  await recordAuditEvent({
    action: "insurance.claim_query_raised",
    entityType: "insurance_claim_query",
    entityId: query.id,
    actorUserId: input.actor.userId,
    context: input.context,
    metadata: { claimId: input.claim.id },
  });

  const claim = (await getClaimById(input.claim.id)) ?? input.claim;
  return { ok: true, query, claim };
}

/** Records an answer to an open query. The insurer is who closes it. */
export async function answerClaimQuery(input: {
  claim: ClaimRecord;
  queryId: string;
  answer: string;
  actor: ClaimActor;
  context?: RequestContext;
}): Promise<ClaimQueryOutcome> {
  const query = await prisma.insuranceClaimQuery.findFirst({
    where: { id: input.queryId, claimId: input.claim.id },
  });
  if (!query) return { ok: false, message: "That query could not be found on this claim." };
  if (query.status === "CLOSED") return { ok: false, message: "That query has already been closed by the insurer." };

  const updatedQuery = await prisma.$transaction(async (tx) => {
    const next = await tx.insuranceClaimQuery.update({
      where: { id: query.id },
      data: {
        responseText: input.answer,
        respondedByLabel: input.actor.label,
        respondedAt: new Date(),
        status: "RESPONDED",
      },
    });

    await appendClaimEvent(tx, {
      claimId: input.claim.id,
      type: "QUERY_RESPONDED",
      actor: input.actor,
      note: input.answer,
      metadata: { queryId: query.id },
    });

    return next;
  });

  await recordAuditEvent({
    action: "insurance.claim_query_answered",
    entityType: "insurance_claim_query",
    entityId: query.id,
    actorUserId: input.actor.userId,
    context: input.context,
    metadata: { claimId: input.claim.id },
  });

  const claim = (await getClaimById(input.claim.id)) ?? input.claim;
  return { ok: true, query: updatedQuery, claim };
}

export async function listClaimQueries(claimId: string): Promise<ClaimQueryRecord[]> {
  return prisma.insuranceClaimQuery.findMany({ where: { claimId }, orderBy: { createdAt: "desc" } });
}

export function isOpenQuery(status: ClaimQueryStatus): boolean {
  return status === "OPEN" || status === "OVERDUE";
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export type SettlementOutcome =
  | { ok: true; settlement: SettlementRecord; claim: ClaimRecord }
  | { ok: false; message: string };

/**
 * Records what was paid.
 *
 * A settlement for an amount is recorded exactly as the insurer's own reference
 * states it. The claim's status only becomes `SETTLED` when the recorded status
 * says the money actually moved — not when a settlement row is created.
 */
export async function recordSettlement(input: {
  claim: ClaimRecord;
  amountPaise: number;
  status: SettlementStatus;
  referenceNumber?: string | null;
  utrNumber?: string | null;
  note?: string | null;
  actor: ClaimActor;
  context?: RequestContext;
}): Promise<SettlementOutcome> {
  const paidInr = paiseToRupees(input.amountPaise);

  const { settlement, claim } = await prisma.$transaction(async (tx) => {
    const created = await tx.insuranceSettlement.create({
      data: {
        claimId: input.claim.id,
        reference: input.referenceNumber ?? null,
        approvedAmountInr: input.claim.approvedAmountInr,
        paidAmountInr: paidInr,
        utrNumber: input.utrNumber ?? null,
        status: input.status,
        notes: input.note ?? null,
        recordedById: input.actor.userId,
        recordedByLabel: input.actor.label,
        settledAt: input.status === "SETTLED" || input.status === "PARTIALLY_SETTLED" ? new Date() : null,
      },
    });

    // The claim only moves to `SETTLED` when the recorded status says the money
    // actually moved. An in-progress or failed settlement leaves the status alone.
    const nextStatus: ClaimStatus =
      input.status === "SETTLED" || input.status === "PARTIALLY_SETTLED" ? "SETTLED" : input.claim.status;

    const next = await tx.insuranceClaim.update({
      where: { id: input.claim.id },
      data: {
        status: nextStatus,
        settledAt:
          input.status === "SETTLED" || input.status === "PARTIALLY_SETTLED" ? new Date() : input.claim.settledAt,
      },
      include: CLAIM_INCLUDE,
    });

    await appendClaimEvent(tx, {
      claimId: next.id,
      type: "SETTLEMENT_RECORDED",
      actor: input.actor,
      toStatus: nextStatus,
      note: input.note ?? null,
      metadata: { status: input.status, amountPaise: input.amountPaise, utr: input.utrNumber ?? null },
    });

    return { settlement: created, claim: next };
  });

  await recordAuditEvent({
    action: "insurance.settlement_recorded",
    entityType: "insurance_settlement",
    entityId: settlement.id,
    actorUserId: input.actor.userId,
    context: input.context,
    metadata: { claimId: claim.id, status: input.status, reference: claim.reference },
  });

  return { ok: true, settlement, claim };
}

export async function listSettlements(claimId: string): Promise<SettlementRecord[]> {
  return prisma.insuranceSettlement.findMany({ where: { claimId }, orderBy: { createdAt: "desc" } });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type ClaimDocumentUploadResult =
  | { ok: true; document: ClaimDocumentRecord }
  | { ok: false; message: string };

/**
 * Stores claim evidence privately.
 *
 * Same rules as a policy document: the bytes stay in the private bucket, the
 * browser only ever sees a signed link built on demand, and an infected file is
 * refused without anything being stored.
 */
export async function uploadClaimDocument(input: {
  user: AuthenticatedUser;
  claimId: string;
  kind: ClaimDocumentKind;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  queryId?: string | null;
  context?: RequestContext;
}): Promise<ClaimDocumentUploadResult> {
  const claim = await getClaimForPatient({ user: input.user, claimId: input.claimId, context: input.context });
  if (!claim) return { ok: false, message: "That claim could not be found." };
  if (claim.status === "WITHDRAWN" || claim.status === "CLOSED") {
    return { ok: false, message: "This claim is closed, so evidence can no longer be added to it." };
  }

  if (!isAcceptedDocumentMimeType(input.mimeType)) {
    return { ok: false, message: "That file type is not accepted. Upload a PDF, JPEG, PNG or WebP file." };
  }

  const verdict = await scanAiUpload({ bytes: input.bytes, fileName: input.fileName, mimeType: input.mimeType });
  if (verdict.status === "INFECTED") {
    await recordAuditEvent({
      action: "insurance.claim_document_uploaded",
      entityType: "insurance_claim_document",
      entityId: claim.id,
      outcome: "FAILURE",
      actorUserId: input.user.id,
      context: input.context,
      metadata: { rejected: "malware" },
    });
    return { ok: false, message: verdict.detail };
  }

  const key = buildDocumentKey({
    namespace: "insurance-claims",
    ownerUserId: claim.patientUserId,
    parentId: claim.id,
    mimeType: input.mimeType,
  });

  const stored = await storeDocument({ key, bytes: input.bytes, contentType: input.mimeType });
  if (!stored.ok) return { ok: false, message: stored.error.message };

  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.insuranceClaimDocument.create({
      data: {
        claimId: claim.id,
        uploadedById: input.user.id,
        kind: input.kind,
        fileName: input.fileName.slice(0, 200),
        mimeType: input.mimeType,
        sizeBytes: stored.data.sizeBytes,
        storageBucket: "orvexa-ai-uploads",
        storageKey: stored.data.key,
        checksumSha256: stored.data.checksum,
        status: verdict.status === "FAILED" ? "PENDING" : "READY",
        malwareScan: verdict.status,
        malwareScanDetail: verdict.detail,
        queryId: input.queryId ?? null,
        retentionUntil: retentionDeadline(CLAIM_RETENTION_DAYS),
      },
    });

    await appendClaimEvent(tx, {
      claimId: claim.id,
      type: "DOCUMENT_ADDED",
      actor: claimActorFromUser(input.user),
      note: input.kind,
      metadata: { documentId: created.id, kind: input.kind },
    });

    return created;
  });

  await recordAuditEvent({
    action: "insurance.claim_document_uploaded",
    entityType: "insurance_claim_document",
    entityId: document.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { claimId: claim.id, kind: input.kind, malwareScan: verdict.status },
  });

  return { ok: true, document };
}

export async function listClaimDocuments(claimId: string): Promise<ClaimDocumentRecord[]> {
  return prisma.insuranceClaimDocument.findMany({
    where: { claimId, deletedAt: null, status: { not: "DELETED" } },
    orderBy: { createdAt: "desc" },
  });
}

export type ClaimDocumentAccess =
  | { ok: true; url: string; expiresAt: Date }
  | { ok: false; message: string };

/**
 * Issues a short-lived link to one claim document.
 *
 * `viewerUserId` is recorded on the audit event, so an insurer's reviewer opening
 * a patient's discharge summary leaves a trail just as the patient does.
 */
export async function createClaimDocumentLink(input: {
  claimId: string;
  documentId: string;
  viewerUserId: string;
  context?: RequestContext;
}): Promise<ClaimDocumentAccess> {
  const document = await prisma.insuranceClaimDocument.findFirst({
    where: { id: input.documentId, claimId: input.claimId, deletedAt: null, status: { not: "DELETED" } },
  });
  if (!document) return { ok: false, message: "That document could not be found." };

  const link = await createDocumentLink(document.storageKey, DOCUMENT_LINK_TTL_SECONDS);
  if (!link.ok) return { ok: false, message: link.error.message };

  await recordAuditEvent({
    action: "insurance.claim_document_accessed",
    entityType: "insurance_claim_document",
    entityId: document.id,
    actorUserId: input.viewerUserId,
    context: input.context,
    metadata: { claimId: input.claimId },
  });

  return { ok: true, url: link.data.url, expiresAt: link.data.expiresAt };
}

export async function removeClaimDocument(input: {
  user: AuthenticatedUser;
  claimId: string;
  documentId: string;
  context?: RequestContext;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const claim = await getClaimForPatient({ user: input.user, claimId: input.claimId, context: input.context });
  if (!claim) return { ok: false, message: "That claim could not be found." };

  const document = await prisma.insuranceClaimDocument.findFirst({
    where: { id: input.documentId, claimId: claim.id, deletedAt: null },
  });
  if (!document) return { ok: false, message: "That document could not be found." };

  await removeDocument(document.storageKey);
  await prisma.$transaction(async (tx) => {
    await tx.insuranceClaimDocument.update({
      where: { id: document.id },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    await appendClaimEvent(tx, {
      claimId: claim.id,
      type: "DOCUMENT_REMOVED",
      actor: claimActorFromUser(input.user),
      note: document.kind,
      metadata: { documentId: document.id },
    });
  });

  await recordAuditEvent({
    action: "insurance.claim_document_deleted",
    entityType: "insurance_claim_document",
    entityId: document.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { claimId: claim.id },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type ClaimSummaryAmount = { paise: number | null; display: string; isEstimate: boolean };

export type ClaimSummary = {
  id: string;
  reference: string;
  claimType: ClaimType;
  status: ClaimStatus;
  statusLabel: string;
  statusDetail: string;
  decision: ClaimDecision;
  attributedTo: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  insurerClaimNumber: string | null;
  policyId: string;
  policyNumber: string;
  insurerName: string | null;
  hospitalName: string | null;
  patientName: string;
  admittedOn: string | null;
  dischargedOn: string | null;
  claimed: ClaimSummaryAmount;
  approved: ClaimSummaryAmount;
  settlement: { status: SettlementStatus; paidPaise: number | null; utr: string | null } | null;
  openQueries: number;
  stages: { id: string; label: string; detail: string; reached: boolean }[];
  certaintyNotice: string;
  decisionNotice: string;
};

/**
 * The single shape every claim view and the summary API return.
 *
 * Every amount carries `isEstimate`, so a caller cannot render a claim figure
 * without having been told whether the insurer confirmed it.
 */
export function buildClaimSummary(input: {
  claim: ClaimRecord;
  events: ClaimEventRecord[];
  queries: ClaimQueryRecord[];
  settlement: SettlementRecord | null;
}): ClaimSummary {
  const { claim, events, queries, settlement } = input;
  const statusCopy = CLAIM_STATUS_COPY[claim.status];
  const decided = claim.decision !== "PENDING";

  const reached = (type: ClaimEventType) => events.some((event) => event.type === type);

  const stages = CLAIM_TIMELINE.stages.map((stage) => {
    const isReached =
      stage.id === "created"
        ? true
        : stage.id === "submitted"
          ? reached("SUBMITTED")
          : stage.id === "acknowledged"
            ? reached("ACKNOWLEDGED")
            : stage.id === "review"
              ? reached("STATUS_CHANGED") || claim.status === "UNDER_REVIEW"
              : stage.id === "decision"
                ? reached("DECISION_RECORDED")
                : stage.id === "settlement"
                  ? reached("SETTLEMENT_RECORDED")
                  : stage.id === "closed"
                    ? claim.status === "CLOSED"
                    : false;
    return { id: stage.id, label: stage.label, detail: stage.detail, reached: isReached };
  });

  return {
    id: claim.id,
    reference: claim.reference,
    claimType: claim.claimType,
    status: claim.status,
    statusLabel: statusCopy.label,
    statusDetail: statusCopy.detail,
    decision: claim.decision,
    attributedTo: claim.decidedByLabel,
    decidedAt: claim.decidedAt ? claim.decidedAt.toISOString() : null,
    decisionReason: claim.decisionReasonLabel,
    insurerClaimNumber: claim.insurerClaimNumber,
    policyId: claim.policyId,
    policyNumber: claim.policy.policyNumber,
    insurerName: claim.insurer?.name ?? claim.policy.insurerName,
    hospitalName: claim.hospitalName,
    patientName: claim.patient.fullName,
    admittedOn: claim.admissionDate ? claim.admissionDate.toISOString().slice(0, 10) : null,
    dischargedOn: claim.dischargeDate ? claim.dischargeDate.toISOString().slice(0, 10) : null,
    claimed: {
      paise: claim.claimedAmountInr === null ? null : rupeesToPaise(claim.claimedAmountInr),
      display: formatPaise(claim.claimedAmountInr === null ? null : rupeesToPaise(claim.claimedAmountInr)),
      isEstimate: true,
    },
    approved: {
      paise: claim.approvedAmountInr === null ? null : rupeesToPaise(claim.approvedAmountInr),
      display: formatPaise(claim.approvedAmountInr === null ? null : rupeesToPaise(claim.approvedAmountInr)),
      isEstimate: !decided,
    },
    settlement: settlement
      ? {
          status: settlement.status,
          paidPaise: settlement.paidAmountInr === null ? null : rupeesToPaise(settlement.paidAmountInr),
          utr: settlement.utrNumber,
        }
      : null,
    openQueries: queries.filter((query) => isOpenQuery(query.status)).length,
    stages,
    certaintyNotice: decided ? ESTIMATE_VS_CONFIRMED.confirmed.detail : ESTIMATE_VS_CONFIRMED.estimate.detail,
    decisionNotice: DECISION_ATTRIBUTION_NOTICE,
  };
}

/** Convenience loader used by the summary route and the claim detail page. */
export async function loadClaimSummary(claim: ClaimRecord): Promise<ClaimSummary> {
  const [events, queries, settlements] = await Promise.all([
    listClaimEvents(claim.id),
    listClaimQueries(claim.id),
    listSettlements(claim.id),
  ]);
  return buildClaimSummary({ claim, events, queries, settlement: settlements[0] ?? null });
}

/**
 * The policy's verification source, so a claim view can badge the coverage it
 * was filed under without a second query.
 */
export function claimPolicyVerificationSource(claim: ClaimRecord): PolicyVerificationSource {
  return claim.policy.verificationSource;
}

/** Re-exported for the pre-authorisation module, which shares the trail. */
export type { PreAuthStatus };
