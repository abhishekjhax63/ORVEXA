import "server-only";

import { randomBytes } from "node:crypto";

import type {
  EligibilityCheckStatus,
  PolicyVerificationSource,
  Prisma,
  PreAuthStatus,
  Role,
} from "@prisma/client";

import { assertOwnership } from "@/lib/auth/guards";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { retentionDeadline } from "@/lib/ai/config";
import { getInsurerIntegration, submitEligibilityCheck, submitPreAuthorization } from "@/lib/insurance/integration";
import { DECISION_ATTRIBUTION_NOTICE, INSURANCE_CONSENT_POLICY_VERSION, PRE_AUTH_STATUS_COPY } from "@/lib/insurance/labels";
import { formatPaise, paiseToRupees, rupeesToPaise } from "@/lib/insurance/money";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import type { EligibilityRequestInput, PreAuthRequestInput } from "@/lib/validation/insurance";

/**
 * Cashless pre-authorisation and eligibility.
 *
 * This is the workflow the brief calls out most sharply. **Requesting a
 * pre-authorisation is not approval.** So:
 *
 *  - A request that could not be sent to the insurer stays `DRAFT` and says so.
 *    It is never marked `SUBMITTED`, because "submitted" would claim a filing
 *    that did not happen.
 *  - An approval is only ever written from an answer the insurer's own system
 *    returned and named, via `recordPreAuthDecision`, which refuses an
 *    attribution that points at ORVEXA.
 *  - An eligibility check with no integration stays `NOT_SUPPORTED` and the UI
 *    says no answer was obtained, rather than inventing one.
 */

const PRE_AUTH_RETENTION_DAYS = 365 * 10;
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function reference(prefix: string): string {
  const bytes = randomBytes(6);
  let suffix = "";
  for (const byte of bytes) suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `${prefix}-${suffix}`;
}

export const PRE_AUTH_INCLUDE = {
  policy: true,
  insurer: true,
  hospital: true,
  claim: true,
  patient: { select: { id: true, fullName: true } },
} as const;

export type PreAuthRecord = Prisma.InsurancePreAuthorizationGetPayload<{ include: typeof PRE_AUTH_INCLUDE }>;
export type EligibilityRecord = Prisma.InsuranceEligibilityCheckGetPayload<{ include: { insurer: true } }>;

export type PreAuthActor = { userId: string; label: string; role: Role | null };

/**
 * The moves a pre-authorisation may make.
 *
 * `APPROVED`, `PARTIALLY_APPROVED` and `REJECTED` are deliberately absent from
 * every list here: they are reached only by `recordPreAuthDecision`.
 */
export const PRE_AUTH_TRANSITIONS: Record<PreAuthStatus, readonly PreAuthStatus[]> = {
  DRAFT: ["SUBMITTED", "WITHDRAWN"],
  SUBMITTED: ["ACKNOWLEDGED", "QUERY_RAISED", "WITHDRAWN"],
  ACKNOWLEDGED: ["QUERY_RAISED", "WITHDRAWN", "EXPIRED"],
  QUERY_RAISED: ["SUBMITTED", "WITHDRAWN"],
  APPROVED: ["EXPIRED"],
  PARTIALLY_APPROVED: ["EXPIRED"],
  REJECTED: [],
  EXPIRED: [],
  WITHDRAWN: [],
};

/** Statuses reachable only from a recorded insurer decision. */
export const PRE_AUTH_DECISION_ONLY_STATUSES: readonly PreAuthStatus[] = [
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
];

export function preAuthTransitionAllowed(from: PreAuthStatus, to: PreAuthStatus): boolean {
  return PRE_AUTH_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listPreAuthorizationsForPatient(patientUserId: string): Promise<PreAuthRecord[]> {
  return prisma.insurancePreAuthorization.findMany({
    where: { patientUserId },
    include: PRE_AUTH_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getPreAuthForPatient(input: {
  user: AuthenticatedUser;
  preAuthId: string;
  context?: RequestContext;
}): Promise<PreAuthRecord | null> {
  const preAuth = await prisma.insurancePreAuthorization.findUnique({
    where: { id: input.preAuthId },
    include: PRE_AUTH_INCLUDE,
  });
  if (!preAuth) return null;

  await assertOwnership({
    user: input.user,
    ownerUserId: preAuth.patientUserId,
    permission: "insurance.manage_own",
    entityType: "insurance_pre_authorization",
    entityId: preAuth.id,
  });

  return preAuth;
}

export async function listEligibilityChecksForPolicy(policyId: string): Promise<EligibilityRecord[]> {
  return prisma.insuranceEligibilityCheck.findMany({
    where: { policyId },
    include: { insurer: true },
    orderBy: { requestedAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Requesting a pre-authorisation
// ---------------------------------------------------------------------------

export type PreAuthRequestOutcome = {
  preAuth: PreAuthRecord;
  /** What actually happened with the insurer, in a sentence safe to render. */
  submission: {
    /** `sent` — an automated request went out and the insurer answered. */
    channel: "api" | "manual";
    sent: boolean;
    message: string;
  };
};

/**
 * Files a pre-authorisation request.
 *
 * Where an API integration is configured and available the request is sent and
 * the insurer's answer is recorded. Otherwise the request is stored as a `DRAFT`
 * with a reference number the patient or hospital can take to the insurer — it is
 * **not** marked as filed, because it was not.
 */
export async function requestPreAuthorization(input: {
  user: AuthenticatedUser;
  data: PreAuthRequestInput;
  context?: RequestContext;
  /** Set when a hospital desk files on the patient's behalf. */
  onBehalfOf?: { patientUserId: string; actor: PreAuthActor };
}): Promise<PreAuthRequestOutcome> {
  const policy = await prisma.insurancePolicy.findFirst({ where: { id: input.data.policyId, deletedAt: null } });
  if (!policy) throw new Error("That policy could not be found.");

  const patientUserId = input.onBehalfOf?.patientUserId ?? input.user.id;
  if (!input.onBehalfOf) {
    await assertOwnership({
      user: input.user,
      ownerUserId: policy.ownerUserId,
      permission: "insurance.manage_own",
      entityType: "insurance_policy",
      entityId: policy.id,
    });
  }

  const hospitalName = await resolveHospitalName(input.data.hospitalId ?? null, input.data.hospitalName);
  const insurerId = input.data.insurerId ?? policy.insurerId ?? null;
  const insurer = insurerId
    ? await prisma.insurer.findUnique({
        where: { id: insurerId },
        select: {
          id: true,
          name: true,
          integrationMode: true,
          integrationBaseUrl: true,
          integrationConfigured: true,
          isActive: true,
        },
      })
    : null;

  const actor: PreAuthActor =
    input.onBehalfOf?.actor ?? { userId: input.user.id, label: input.user.fullName, role: null };

  const preAuthReference = reference("ORX-PA");
  const requestedAmountInr =
    input.data.requestedAmountPaise === undefined ? null : paiseToRupees(input.data.requestedAmountPaise);

  const descriptor = insurer ? getInsurerIntegration(insurer) : null;

  let status: PreAuthStatus = "DRAFT";
  let insurerReferenceNumber: string | null = null;
  let approvedAmountInr: number | null = null;
  let decidedByLabel: string | null = null;
  let decisionNotes: string = descriptor?.reason ?? "No insurer is linked to this policy, so nothing was filed.";
  let validUntil: Date | null = null;
  let channel: "api" | "manual" = "manual";
  let sent = false;
  let submissionMessage: string;

  if (insurer && descriptor?.available) {
    const result = await submitPreAuthorization({
      insurer,
      reference: preAuthReference,
      policyNumber: policy.policyNumber,
      memberId: policy.memberId,
      patientName: policy.policyHolderName,
      hospitalName,
      plannedProcedure: input.data.plannedProcedure,
      plannedAdmissionDate: input.data.plannedAdmissionDate ?? null,
      treatingDoctorName: input.data.treatingDoctorName ?? null,
      treatingDoctorRegistration: input.data.treatingDoctorRegistration ?? null,
      requestedAmountPaise: input.data.requestedAmountPaise ?? null,
    });

    channel = "api";
    if (result.outcome === "submitted") {
      sent = true;
      status = result.data.status;
      insurerReferenceNumber = result.data.insurerReferenceNumber;
      approvedAmountInr =
        result.data.approvedAmountPaise === null ? null : paiseToRupees(result.data.approvedAmountPaise);
      decidedByLabel = result.data.decidedByLabel;
      decisionNotes = result.data.decisionNotes ?? "The insurer's system returned this status.";
      validUntil = result.data.validUntil;
      submissionMessage =
        status === "APPROVED" || status === "PARTIALLY_APPROVED"
          ? "The insurer's system returned a decision for this request. It is recorded here exactly as they sent it."
          : "The request was sent to the insurer. A response is awaited — sending it is not an approval.";
    } else {
      decisionNotes = result.message;
      submissionMessage = result.message;
    }
  } else {
    submissionMessage =
      "This request has been recorded on your account but has NOT been filed with the insurer automatically. " +
      "Take the reference number to the insurer or the hospital's insurance desk, and record their answer here when you have it.";
  }

  const created = await prisma.$transaction(async (tx) => {
    const preAuth = await tx.insurancePreAuthorization.create({
      data: {
        reference: preAuthReference,
        claimId: input.data.claimId ?? null,
        policyId: policy.id,
        patientUserId,
        requestedById: actor.userId,
        insurerId,
        hospitalId: input.data.hospitalId ?? null,
        hospitalName,
        status,
        plannedAdmissionDate: input.data.plannedAdmissionDate ?? null,
        plannedProcedure: input.data.plannedProcedure,
        treatingDoctorName: input.data.treatingDoctorName ?? null,
        treatingDoctorRegistration: input.data.treatingDoctorRegistration ?? null,
        requestedAmountInr,
        approvedAmountInr,
        insurerReferenceNumber,
        decisionNotes,
        decidedByLabel,
        decidedAt: status === "APPROVED" || status === "PARTIALLY_APPROVED" || status === "REJECTED" ? new Date() : null,
        validUntil,
        consentAcknowledgedAt: input.data.consentAcknowledged ? new Date() : null,
        consentPolicyVersion: input.data.consentAcknowledged ? INSURANCE_CONSENT_POLICY_VERSION : null,
        submittedAt: sent ? new Date() : null,
        retentionUntil: retentionDeadline(PRE_AUTH_RETENTION_DAYS),
      },
      include: PRE_AUTH_INCLUDE,
    });

    await tx.insuranceClaimEvent.create({
      data: {
        claimId: preAuth.claimId,
        preAuthId: preAuth.id,
        type: sent ? "SUBMITTED" : "NOTE",
        actorUserId: actor.userId,
        actorRole: actor.role,
        actorLabel: actor.label,
        toStatus: status,
        note: submissionMessage,
        metadata: { channel, insurerId },
      },
    });

    return preAuth;
  });

  await recordAuditEvent({
    action: "insurance.pre_authorisation_requested",
    entityType: "insurance_pre_authorization",
    entityId: created.id,
    actorUserId: actor.userId,
    context: input.context,
    metadata: { reference: created.reference, channel, sent, status },
  });

  return { preAuth: created, submission: { channel, sent, message: submissionMessage } };
}

// ---------------------------------------------------------------------------
// Manual filing by a hospital desk or the patient
// ---------------------------------------------------------------------------

/**
 * Records that the request really was filed, and the reference the insurer gave.
 *
 * This is the manual counterpart to the API submission: it is how a hospital's
 * insurance desk marks a request as filed after they have actually emailed or
 * called the insurer. It does not move the request to an approval.
 */
export async function recordPreAuthFiling(input: {
  preAuth: PreAuthRecord;
  insurerReferenceNumber: string;
  actor: PreAuthActor;
  context?: RequestContext;
}): Promise<{ ok: true; preAuth: PreAuthRecord } | { ok: false; message: string }> {
  if (!preAuthTransitionAllowed(input.preAuth.status, "SUBMITTED")) {
    return { ok: false, message: `A request in status ${input.preAuth.status} cannot be marked as filed.` };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.insurancePreAuthorization.update({
      where: { id: input.preAuth.id },
      data: {
        status: "SUBMITTED",
        insurerReferenceNumber: input.insurerReferenceNumber,
        submittedAt: new Date(),
        decisionNotes: "Filed with the insurer by hand. Filing is not approval — the insurer has not decided yet.",
      },
      include: PRE_AUTH_INCLUDE,
    });

    await tx.insuranceClaimEvent.create({
      data: {
        claimId: next.claimId,
        preAuthId: next.id,
        type: "SUBMITTED",
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        actorLabel: input.actor.label,
        fromStatus: input.preAuth.status,
        toStatus: "SUBMITTED",
        note: `Filed by hand; insurer reference ${input.insurerReferenceNumber}.`,
      },
    });

    return next;
  });

  await recordAuditEvent({
    action: "insurance.pre_authorisation_updated",
    entityType: "insurance_pre_authorization",
    entityId: updated.id,
    actorUserId: input.actor.userId,
    context: input.context,
    metadata: { reference: updated.reference, filed: true },
  });

  return { ok: true, preAuth: updated };
}

export async function withdrawPreAuthorization(input: {
  preAuth: PreAuthRecord;
  actor: PreAuthActor;
  reason?: string;
  context?: RequestContext;
}): Promise<{ ok: true; preAuth: PreAuthRecord } | { ok: false; message: string }> {
  if (!preAuthTransitionAllowed(input.preAuth.status, "WITHDRAWN")) {
    return { ok: false, message: "This request has reached an outcome and can no longer be withdrawn." };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.insurancePreAuthorization.update({
      where: { id: input.preAuth.id },
      data: { status: "WITHDRAWN", decidedAt: new Date() },
      include: PRE_AUTH_INCLUDE,
    });
    await tx.insuranceClaimEvent.create({
      data: {
        claimId: next.claimId,
        preAuthId: next.id,
        type: "WITHDRAWN",
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        actorLabel: input.actor.label,
        fromStatus: input.preAuth.status,
        toStatus: "WITHDRAWN",
        note: input.reason ?? null,
      },
    });
    return next;
  });

  await recordAuditEvent({
    action: "insurance.pre_authorisation_updated",
    entityType: "insurance_pre_authorization",
    entityId: updated.id,
    actorUserId: input.actor.userId,
    context: input.context,
    metadata: { reference: updated.reference, withdrawn: true },
  });

  return { ok: true, preAuth: updated };
}

// ---------------------------------------------------------------------------
// The insurer's pre-authorisation decision
// ---------------------------------------------------------------------------

function attributionIsPlatform(value: string): boolean {
  return /orvexa|platform|automated|system/i.test(value);
}

export type PreAuthDecisionInput = {
  preAuth: PreAuthRecord;
  decision: Extract<PreAuthStatus, "ACKNOWLEDGED" | "QUERY_RAISED" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED" | "EXPIRED">;
  attributedTo: string;
  approvedAmountPaise?: number | null;
  reason?: string | null;
  insurerReferenceNumber?: string | null;
  validUntil?: Date | null;
  actor: PreAuthActor;
  context?: RequestContext;
};

/**
 * Records what the insurer said about a pre-authorisation.
 *
 * The same attribution rule as a claim decision: the source must be the insurer
 * or a person acting for them, never the platform.
 */
export async function recordPreAuthDecision(
  input: PreAuthDecisionInput,
): Promise<{ ok: true; preAuth: PreAuthRecord } | { ok: false; message: string }> {
  if (attributionIsPlatform(input.attributedTo)) {
    return {
      ok: false,
      message:
        "A decision must be attributed to the insurer or the person who communicated it. ORVEXA does not approve or reject pre-authorisations.",
    };
  }
  if (!PRE_AUTH_DECISION_ONLY_STATUSES.includes(input.decision) && !["ACKNOWLEDGED", "QUERY_RAISED", "EXPIRED"].includes(input.decision)) {
    return { ok: false, message: "That is not an outcome a reviewer can record." };
  }

  if (["APPROVED", "PARTIALLY_APPROVED"].includes(input.decision)) {
    if (!input.approvedAmountPaise || input.approvedAmountPaise <= 0) {
      return { ok: false, message: "Record the amount the insurer approved." };
    }
  }
  if (["REJECTED", "PARTIALLY_APPROVED"].includes(input.decision) && !input.reason) {
    return { ok: false, message: "Record the reason the insurer gave." };
  }

  const approvedAmountInr =
    ["APPROVED", "PARTIALLY_APPROVED"].includes(input.decision) && input.approvedAmountPaise
      ? paiseToRupees(input.approvedAmountPaise)
      : null;

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.insurancePreAuthorization.update({
      where: { id: input.preAuth.id },
      data: {
        status: input.decision,
        approvedAmountInr,
        decisionNotes: input.reason ?? PRE_AUTH_STATUS_COPY[input.decision].detail,
        insurerReferenceNumber: input.insurerReferenceNumber ?? input.preAuth.insurerReferenceNumber,
        decidedByLabel: input.attributedTo,
        decidedAt: new Date(),
        validUntil: input.validUntil ?? input.preAuth.validUntil,
      },
      include: PRE_AUTH_INCLUDE,
    });

    await tx.insuranceClaimEvent.create({
      data: {
        claimId: next.claimId,
        preAuthId: next.id,
        type: "DECISION_RECORDED",
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        actorLabel: input.actor.label,
        fromStatus: input.preAuth.status,
        toStatus: input.decision,
        note: input.reason ?? null,
        metadata: { attributedTo: input.attributedTo, approvedAmountPaise: input.approvedAmountPaise ?? null },
      },
    });

    return next;
  });

  await recordAuditEvent({
    action: "insurance.pre_authorisation_updated",
    entityType: "insurance_pre_authorization",
    entityId: updated.id,
    actorUserId: input.actor.userId,
    context: input.context,
    metadata: { reference: updated.reference, decision: input.decision, attributedTo: input.attributedTo },
  });

  return { ok: true, preAuth: updated };
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export type EligibilityOutcome = {
  check: EligibilityRecord;
  /** What happened, in a sentence the UI shows verbatim. */
  message: string;
};

/**
 * Asks whether a policy is live and what it covers.
 *
 * Without a configured integration the row is written `NOT_SUPPORTED` and the
 * message says plainly that no answer was obtained. The platform will not
 * invent an eligibility answer, which is why this is a distinct status rather
 * than a silent "unknown".
 */
export async function requestEligibilityCheck(input: {
  user: AuthenticatedUser;
  data: EligibilityRequestInput;
  actor?: PreAuthActor;
  context?: RequestContext;
}): Promise<EligibilityOutcome> {
  const policy = await prisma.insurancePolicy.findFirst({ where: { id: input.data.policyId, deletedAt: null } });
  if (!policy) throw new Error("That policy could not be found.");

  await assertOwnership({
    user: input.user,
    ownerUserId: policy.ownerUserId,
    permission: "insurance.manage_own",
    entityType: "insurance_policy",
    entityId: policy.id,
  });

  const actor: PreAuthActor = input.actor ?? { userId: input.user.id, label: input.user.fullName, role: null };
  const hospitalName = input.data.hospitalName ?? null;
  const insurer = policy.insurerId
    ? await prisma.insurer.findUnique({
        where: { id: policy.insurerId },
        select: {
          id: true,
          name: true,
          integrationMode: true,
          integrationBaseUrl: true,
          integrationConfigured: true,
          isActive: true,
        },
      })
    : null;

  const descriptor = insurer ? getInsurerIntegration(insurer) : null;
  const checkReference = reference("ORX-EL");

  let status: EligibilityCheckStatus = "NOT_SUPPORTED";
  let responseSummary: Prisma.InputJsonValue | undefined;
  let insurerReferenceNumber: string | null = null;
  let failureReason: string | null = descriptor?.reason ?? "No insurer is linked to this policy, so nobody could be asked.";
  let message: string;

  if (insurer && descriptor?.available) {
    const result = await submitEligibilityCheck({
      insurer,
      policyNumber: policy.policyNumber,
      memberId: policy.memberId,
      patientName: policy.policyHolderName,
      plannedProcedure: input.data.plannedProcedure ?? null,
      hospitalName,
      reference: checkReference,
    });

    if (result.outcome === "submitted") {
      status = result.data.status;
      responseSummary = result.data.responseSummary as Prisma.InputJsonValue;
      insurerReferenceNumber = result.data.insurerReferenceNumber;
      failureReason = null;
      message = "The insurer returned an answer. It is shown exactly as they supplied it.";
    } else {
      status = "FAILED";
      failureReason = result.message;
      message = result.message;
    }
  } else {
    message =
      "There is no automated link to this insurer, so no eligibility answer was obtained. ORVEXA will not invent one — " +
      "check the policy document, or call the insurer directly.";
  }

  const check = await prisma.insuranceEligibilityCheck.create({
    data: {
      reference: checkReference,
      policyId: policy.id,
      patientUserId: policy.ownerUserId,
      requestedById: actor.userId,
      insurerId: policy.insurerId,
      hospitalId: input.data.hospitalId ?? null,
      status,
      requestPayload: {
        policyNumber: policy.policyNumber,
        memberId: policy.memberId,
        plannedProcedure: input.data.plannedProcedure ?? null,
        hospitalName,
        note: input.data.note ?? null,
      },
      responseSummary,
      insurerReferenceNumber,
      failureReason,
      respondedAt: status === "RESPONDED" ? new Date() : null,
    },
    include: { insurer: true },
  });

  await prisma.insuranceClaimEvent.create({
    data: {
      eligibilityId: check.id,
      type: status === "RESPONDED" ? "NOTE" : "NOTE",
      actorUserId: actor.userId,
      actorRole: actor.role,
      actorLabel: actor.label,
      toStatus: status,
      note: message,
      metadata: { reference: check.reference },
    },
  });

  await recordAuditEvent({
    action: "insurance.eligibility_requested",
    entityType: "insurance_eligibility_check",
    entityId: check.id,
    actorUserId: actor.userId,
    context: input.context,
    metadata: { reference: check.reference, status },
  });

  return { check, message };
}

/**
 * Records an eligibility answer obtained out of band — a person phoned the
 * insurer and typed what they were told. Attributed, and never attributed to
 * the platform.
 */
export async function recordEligibilityResult(input: {
  checkId: string;
  summary: Record<string, unknown>;
  attributedTo: string;
  actor: PreAuthActor;
  context?: RequestContext;
}): Promise<{ ok: true; check: EligibilityRecord } | { ok: false; message: string }> {
  if (attributionIsPlatform(input.attributedTo)) {
    return {
      ok: false,
      message: "An answer must be attributed to the insurer or the person who communicated it, never to ORVEXA.",
    };
  }

  const existing = await prisma.insuranceEligibilityCheck.findUnique({ where: { id: input.checkId } });
  if (!existing) return { ok: false, message: "That eligibility check could not be found." };

  const check = await prisma.insuranceEligibilityCheck.update({
    where: { id: existing.id },
    data: {
      status: "RESPONDED",
      responseSummary: { ...input.summary, attributedTo: input.attributedTo } as Prisma.InputJsonValue,
      failureReason: null,
      respondedAt: new Date(),
    },
    include: { insurer: true },
  });

  await recordAuditEvent({
    action: "insurance.eligibility_recorded",
    entityType: "insurance_eligibility_check",
    entityId: check.id,
    actorUserId: input.actor.userId,
    context: input.context,
    metadata: { reference: check.reference, attributedTo: input.attributedTo },
  });

  return { ok: true, check };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export type PreAuthView = {
  id: string;
  reference: string;
  status: PreAuthStatus;
  statusLabel: string;
  statusDetail: string;
  hospitalName: string;
  plannedProcedure: string | null;
  plannedAdmissionDate: string | null;
  requestedAmount: { paise: number | null; display: string };
  approvedAmount: { paise: number | null; display: string; isEstimate: boolean };
  insurerReferenceNumber: string | null;
  attributedTo: string | null;
  decidedAt: string | null;
  validUntil: string | null;
  policyVerificationSource: PolicyVerificationSource;
  decisionNotice: string;
};

export function buildPreAuthView(preAuth: PreAuthRecord): PreAuthView {
  const copy = PRE_AUTH_STATUS_COPY[preAuth.status];
  const approved = preAuth.approvedAmountInr === null ? null : rupeesToPaise(preAuth.approvedAmountInr);
  const requested = preAuth.requestedAmountInr === null ? null : rupeesToPaise(preAuth.requestedAmountInr);
  return {
    id: preAuth.id,
    reference: preAuth.reference,
    status: preAuth.status,
    statusLabel: copy.label,
    statusDetail: copy.detail,
    hospitalName: preAuth.hospitalName,
    plannedProcedure: preAuth.plannedProcedure,
    plannedAdmissionDate: preAuth.plannedAdmissionDate ? preAuth.plannedAdmissionDate.toISOString().slice(0, 10) : null,
    requestedAmount: { paise: requested, display: formatPaise(requested) },
    approvedAmount: { paise: approved, display: formatPaise(approved), isEstimate: preAuth.decidedByLabel === null },
    insurerReferenceNumber: preAuth.insurerReferenceNumber,
    attributedTo: preAuth.decidedByLabel,
    decidedAt: preAuth.decidedAt ? preAuth.decidedAt.toISOString() : null,
    validUntil: preAuth.validUntil ? preAuth.validUntil.toISOString().slice(0, 10) : null,
    policyVerificationSource: preAuth.policy.verificationSource,
    decisionNotice: DECISION_ATTRIBUTION_NOTICE,
  };
}

async function resolveHospitalName(hospitalId: string | null, typedName: string): Promise<string> {
  if (hospitalId) {
    const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId }, select: { name: true } });
    if (hospital) return hospital.name;
  }
  return typedName;
}
