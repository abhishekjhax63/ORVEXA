import "server-only";

import type {
  PartnerApplicationStatus,
  PartnerType,
  VerificationRequestStatus,
  VerificationState,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { Permission } from "@/lib/auth/roles";
import { actingOperatorLabel, recordPlatformAction, type PlatformContext } from "@/lib/platform/console";
import { platformFail, platformOk, type PlatformResult } from "@/lib/platform/errors";
import type {
  PartnerApplicationDecisionInput,
  PartnerApplicationFilterInput,
  PartnerSuspensionInput,
  VerificationDecisionInput,
  VerificationInfoRequestInput,
  VerificationQueueFilterInput,
} from "@/lib/validation/platform";

/**
 * Provider verification and partner onboarding.
 *
 * ## The shape of a verification decision
 *
 * A reviewer is *not* editing a hospital, a doctor or a laboratory. They are
 * deciding a `VerificationRequest`, and the decision is what writes the effect
 * onto the subject. Keeping the two apart is what makes the queue answerable
 * later: the request row carries the payload that was submitted, the reviewer who
 * decided it and when, even after the subject has been edited a dozen times
 * since.
 *
 * ## The four rules this module holds
 *
 * 1. **A decision is a transaction.** A reviewer cannot leave a request approved
 *    while the hospital is still unverified — or the reverse, which is worse,
 *    because an approved request with an unverified hospital is a queue that
 *    lies about what is live. Both writes happen or neither does.
 *
 * 2. **A rejection must explain itself.** Enforced twice: in the schema, and here
 *    at the service, because a service can be called from somewhere other than
 *    the form.
 *
 * 3. **Suspension is not deletion, and it removes capability.** Suspending a
 *    partner sets its verification state to `SUSPENDED` *and* clears the
 *    capability flags a reviewer once granted — `canPublishReports`,
 *    `canDispensePrescriptionMedicines`, `canRecordDecisions`. A suspended
 *    laboratory that can still publish a patient's result is not suspended.
 *    Lifting the suspension restores `VERIFIED` but deliberately does **not**
 *    restore those flags: re-granting the right to publish a clinical document is
 *    its own decision, made by a named reviewer, not a side effect of undoing a
 *    suspension.
 *
 * 4. **The reviewer is never named by the request.** Every operator id and label
 *    here comes from `PlatformContext`, resolved from the session.
 *
 * ## What this module deliberately does not do
 *
 * Approving a `PROFILE_CHANGE` request does not merge the proposed `payload`
 * fields into a provider profile. Each provider domain (hospital, doctor,
 * pharmacy, laboratory, ambulance, insurer) owns the shape of its own profile and
 * its own field-level rules, and a generic merge written here would be a second,
 * weaker copy of those rules. This module records *that the change was approved*
 * and marks the request `APPROVED`; applying the approved values is the owning
 * module's job. The console shows the payload so the reviewer sees exactly what
 * they approved.
 */

const MANAGED_PARTNER_KINDS = ["HOSPITAL", "DOCTOR", "PHARMACY", "LABORATORY", "AMBULANCE", "INSURER"] as const;
export type ManagedPartnerKind = (typeof MANAGED_PARTNER_KINDS)[number];

/**
 * Narrows a path segment to a partner kind.
 *
 * The kind is part of the console's URL because it selects which verification
 * grant the operator needs: suspending a hospital and suspending a pharmacy are
 * different judgements, held by different people.
 */
export function isManagedPartnerKind(value: string): value is ManagedPartnerKind {
  return (MANAGED_PARTNER_KINDS as readonly string[]).includes(value);
}

/**
 * The partner-application types each verification grant covers.
 *
 * A reviewer's grant says what they review, so the queue a pharmacy reviewer
 * opens contains pharmacy applications and nothing else. Deriving the scope from
 * the permissions rather than from the staff role keeps the one rule true: the
 * permission is what is checked. A full platform administrator holds every one
 * of these grants, so the union is the whole set for them without a special case.
 */
const APPLICATION_SCOPE: ReadonlyArray<{ permission: Permission; types: readonly PartnerType[] }> = [
  { permission: "platform.verify_pharmacy", types: ["PHARMACY"] },
  { permission: "platform.verify_laboratory", types: ["LABORATORY", "DIAGNOSTIC_CENTER"] },
  { permission: "platform.verify_ambulance", types: ["AMBULANCE"] },
  { permission: "platform.verify_insurer", types: ["INSURANCE"] },
];

/** The application types this operator may review. Empty means none. */
export function allowedPartnerApplicationTypes(context: PlatformContext): PartnerType[] {
  const types = new Set<PartnerType>();
  for (const scope of APPLICATION_SCOPE) {
    if (!context.permissions.has(scope.permission)) continue;
    for (const type of scope.types) types.add(type);
  }
  return [...types];
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export type VerificationQueueItem = {
  id: string;
  subjectType: "HOSPITAL" | "DOCTOR" | "PARTNER_APPLICATION";
  subjectId: string;
  subjectLabel: string;
  kind: "INITIAL_VERIFICATION" | "PROFILE_CHANGE";
  status: VerificationRequestStatus;
  requiredFields: string[];
  payload: unknown;
  requestedByLabel: string | null;
  reviewNotes: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The verification queue, oldest first.
 *
 * Oldest first is the point of a queue: a hospital that has waited three weeks is
 * the one that needs the decision, not the one that arrived this morning. The
 * subject label is resolved per subject type so a reviewer never sees a bare
 * cuid they cannot identify.
 */
export async function listVerificationQueue(input: {
  context: PlatformContext;
  filter: VerificationQueueFilterInput;
}): Promise<PlatformResult<{ items: VerificationQueueItem[]; total: number }>> {
  const { filter } = input;

  const where = {
    ...(filter.status ? { status: filter.status } : { status: "PENDING" as VerificationRequestStatus }),
    ...(filter.subjectType ? { subjectType: filter.subjectType } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.verificationRequest.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        subjectType: true,
        subjectId: true,
        kind: true,
        status: true,
        payload: true,
        requiredFields: true,
        reviewNotes: true,
        decidedAt: true,
        createdAt: true,
        updatedAt: true,
        requestedBy: { select: { fullName: true, email: true } },
      },
    }),
    prisma.verificationRequest.count({ where }),
  ]);

  const labels = await resolveSubjectLabels(rows.map((row) => ({ type: row.subjectType, id: row.subjectId })));
  const needle = filter.query?.toLowerCase();

  const items: VerificationQueueItem[] = rows.map((row) => {
    const subjectLabel = labels.get(`${row.subjectType}:${row.subjectId}`) ?? "Unknown or removed record";
    return {
      id: row.id,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      subjectLabel,
      kind: row.kind,
      status: row.status,
      requiredFields: row.requiredFields,
      payload: row.payload,
      requestedByLabel: row.requestedBy?.fullName ?? row.requestedBy?.email ?? null,
      reviewNotes: row.reviewNotes,
      decidedAt: row.decidedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  const filtered = needle
    ? items.filter(
        (item) =>
          item.subjectLabel.toLowerCase().includes(needle) ||
          (item.requestedByLabel ?? "").toLowerCase().includes(needle),
      )
    : items;

  return platformOk({ items: filtered, total });
}

/**
 * Resolves display labels for a mixed batch of verification subjects.
 *
 * Batched per subject type rather than one query per row, and tolerant of a
 * subject that has since been deleted: a queue item whose hospital is gone still
 * has to render, because the request itself is the record of what was submitted.
 */
async function resolveSubjectLabels(
  subjects: ReadonlyArray<{ type: string; id: string }>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const hospitalIds = subjects.filter((s) => s.type === "HOSPITAL").map((s) => s.id);
  const doctorIds = subjects.filter((s) => s.type === "DOCTOR").map((s) => s.id);
  const applicationIds = subjects.filter((s) => s.type === "PARTNER_APPLICATION").map((s) => s.id);

  const [hospitals, doctors, applications] = await Promise.all([
    hospitalIds.length
      ? prisma.hospital.findMany({ where: { id: { in: hospitalIds } }, select: { id: true, name: true } })
      : [],
    doctorIds.length
      ? prisma.doctorProfile.findMany({
          where: { id: { in: doctorIds } },
          select: { id: true, user: { select: { fullName: true } } },
        })
      : [],
    applicationIds.length
      ? prisma.partnerApplication.findMany({
          where: { id: { in: applicationIds } },
          select: { id: true, organizationName: true },
        })
      : [],
  ]);

  for (const row of hospitals) labels.set(`HOSPITAL:${row.id}`, row.name);
  for (const row of doctors) labels.set(`DOCTOR:${row.id}`, row.user.fullName);
  for (const row of applicationIds.length ? applications : []) {
    labels.set(`PARTNER_APPLICATION:${row.id}`, row.organizationName);
  }

  return labels;
}

// ---------------------------------------------------------------------------
// Verification decisions
// ---------------------------------------------------------------------------

/**
 * Decides a `VerificationRequest`.
 *
 * The status effect on the subject and the status effect on the request are
 * written in one transaction. A reviewer who approves a hospital and whose
 * second write then fails would otherwise leave a hospital that is verified in
 * the queue's eyes and unverified in the catalogue's — the exact disagreement
 * that makes a verification system untrustworthy.
 */
export async function decideVerification(input: {
  context: PlatformContext;
  data: VerificationDecisionInput;
}): Promise<PlatformResult<{ requestId: string; status: VerificationRequestStatus; subjectState: VerificationState }>> {
  const { context, data } = input;

  if (data.decision === "REJECTED" && (data.reviewNotes ?? "").trim().length < 10) {
    return platformFail("validation", "A rejection needs a written reason of at least 10 characters.");
  }

  const request = await prisma.verificationRequest.findUnique({
    where: { id: data.requestId },
    select: { id: true, subjectType: true, subjectId: true, kind: true, status: true },
  });
  if (!request) return platformFail("not_found", "That verification request was not found.");
  if (request.status !== "PENDING") {
    return platformFail(
      "already_decided",
      `This request was already ${request.status.toLowerCase()}. Reload the queue before deciding it again.`,
    );
  }

  const isApproved = data.decision === "APPROVED";
  const subjectState: VerificationState = isApproved ? "VERIFIED" : "REJECTED";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.verificationRequest.update({
      where: { id: request.id },
      data: {
        status: data.decision,
        reviewedById: context.user.id,
        reviewNotes: data.reviewNotes ?? null,
        decidedAt: now,
      },
    });

    if (request.subjectType === "HOSPITAL") {
      await tx.hospital.updateMany({
        where: { id: request.subjectId },
        data: {
          verificationStatus: subjectState,
          verificationNotes: data.reviewNotes ?? null,
          verifiedAt: isApproved ? now : null,
          verifiedById: isApproved ? context.user.id : null,
          dataProvenance: isApproved ? "PLATFORM_VERIFIED" : "PROVIDER_SUBMITTED",
          publishedAt: isApproved ? now : null,
        },
      });
      return;
    }

    if (request.subjectType === "DOCTOR") {
      await tx.doctorProfile.updateMany({
        where: { id: request.subjectId },
        data: {
          verificationStatus: subjectState,
          verificationNotes: data.reviewNotes ?? null,
          verifiedAt: isApproved ? now : null,
          verifiedById: isApproved ? context.user.id : null,
          dataProvenance: isApproved ? "PLATFORM_VERIFIED" : "PROVIDER_SUBMITTED",
        },
      });
      return;
    }

    await tx.partnerApplication.updateMany({
      where: { id: request.subjectId },
      data: {
        status: isApproved ? "APPROVED" : "REJECTED",
        reviewNotes: data.reviewNotes ?? null,
        reviewedById: context.user.id,
        reviewedAt: now,
      },
    });
    await promotePartnerProfile(tx, request.subjectId, isApproved ? "APPROVED" : "REJECTED", {
      reviewerId: context.user.id,
      notes: data.reviewNotes ?? null,
    });
  });

  await recordPlatformAction({
    context,
    action: "platform.verification_decided",
    entityType: "verification_request",
    entityId: request.id,
    metadata: {
      decision: data.decision,
      subjectType: request.subjectType,
      subjectId: request.subjectId,
      kind: request.kind,
      hasNotes: Boolean(data.reviewNotes),
    },
    
  });

  return platformOk({ requestId: request.id, status: data.decision, subjectState });
}

/**
 * Asks the applicant for something, without deciding.
 *
 * The request stays `PENDING`: nothing has been decided, and moving it to a
 * pseudo-state would hide it from the queue that has to keep waiting on it. The
 * message is stored on the request so the next reviewer can see what was asked
 * and whether it was answered.
 */
export async function requestVerificationInfo(input: {
  context: PlatformContext;
  data: VerificationInfoRequestInput;
}): Promise<PlatformResult<{ requestId: string }>> {
  const { context, data } = input;

  const request = await prisma.verificationRequest.findUnique({
    where: { id: data.requestId },
    select: { id: true, status: true, subjectType: true, subjectId: true },
  });
  if (!request) return platformFail("not_found", "That verification request was not found.");
  if (request.status !== "PENDING") {
    return platformFail("request_not_pending", "This request has already been decided.");
  }

  const stamped = `[${new Date().toISOString().slice(0, 10)} · information requested]\n${data.message}`;
  await prisma.verificationRequest.update({
    where: { id: request.id },
    data: { reviewNotes: stamped },
  });

  await recordPlatformAction({
    context,
    action: "platform.verification_info_requested",
    entityType: "verification_request",
    entityId: request.id,
    metadata: { subjectType: request.subjectType, subjectId: request.subjectId },
    
  });

  return platformOk({ requestId: request.id });
}

// ---------------------------------------------------------------------------
// Partner applications
// ---------------------------------------------------------------------------

export type PartnerApplicationQueueItem = {
  id: string;
  partnerType: PartnerType;
  organizationName: string;
  registrationNumber: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  state: string;
  website: string | null;
  documentCount: number;
  status: PartnerApplicationStatus;
  reviewNotes: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  applicant: { fullName: string; email: string } | null;
};

/**
 * Partner applications, submitted first.
 *
 * A draft is the applicant's own unfinished work and is not a thing to review;
 * the default filter is therefore "everything except a draft", because a queue
 * that shows drafts is a queue a reviewer cannot act on. Only the file *names*
 * and keys of the uploaded evidence are selected — never the document contents,
 * which are fetched through the document service with its own access log.
 */
export async function listPartnerApplications(input: {
  context: PlatformContext;
  filter: PartnerApplicationFilterInput;
  /** Restricts the queue to the partner types a reviewer is authorised for. */
  allowedTypes?: readonly PartnerType[];
}): Promise<PlatformResult<{ items: PartnerApplicationQueueItem[]; total: number }>> {
  const { filter } = input;

  const allowed = input.allowedTypes?.length ? input.allowedTypes : undefined;
  if (allowed && filter.partnerType && !allowed.includes(filter.partnerType)) {
    return platformFail("not_permitted", "That partner type is not in your review queue.");
  }

  const where = {
    ...(filter.status ? { status: filter.status } : { status: { not: "DRAFT" as PartnerApplicationStatus } }),
    ...(filter.partnerType
      ? { partnerType: filter.partnerType }
      : allowed
        ? { partnerType: { in: [...allowed] } }
        : {}),
    ...(filter.city ? { city: { contains: filter.city, mode: "insensitive" as const } } : {}),
    ...(filter.query
      ? {
          OR: [
            { organizationName: { contains: filter.query, mode: "insensitive" as const } },
            { contactName: { contains: filter.query, mode: "insensitive" as const } },
            { contactEmail: { contains: filter.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.partnerApplication.findMany({
      where,
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        partnerType: true,
        organizationName: true,
        registrationNumber: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        city: true,
        state: true,
        website: true,
        documentKeys: true,
        status: true,
        reviewNotes: true,
        submittedAt: true,
        reviewedAt: true,
        createdAt: true,
        applicant: { select: { fullName: true, email: true } },
      },
    }),
    prisma.partnerApplication.count({ where }),
  ]);

  return platformOk({
    items: rows.map(({ documentKeys, ...row }) => ({ ...row, documentCount: documentKeys.length })),
    total,
  });
}

/**
 * Decides a partner application.
 *
 * On approval the matching partner profile — if the applicant has one — is moved
 * to `APPROVED` as well, in the same transaction. The profile is discovered by
 * `ownerUserId`, which is the only link the two rows share; when no profile
 * exists yet the application is still approved, because the profile is created by
 * the partner's own onboarding flow and its absence is not a reason to block a
 * decision the applicant is waiting on.
 */
export async function decidePartnerApplication(input: {
  context: PlatformContext;
  data: PartnerApplicationDecisionInput;
  allowedTypes?: readonly PartnerType[];
}): Promise<PlatformResult<{ applicationId: string; status: PartnerApplicationStatus }>> {
  const { context, data } = input;

  if (data.decision === "REJECTED" && (data.reviewNotes ?? "").trim().length < 10) {
    return platformFail("validation", "A rejection needs a written reason of at least 10 characters.");
  }

  const application = await prisma.partnerApplication.findUnique({
    where: { id: data.applicationId },
    select: { id: true, status: true, partnerType: true, applicantUserId: true },
  });
  if (!application) return platformFail("not_found", "That partner application was not found.");
  if (input.allowedTypes?.length && !input.allowedTypes.includes(application.partnerType)) {
    return platformFail("not_permitted", "That partner type is not in your review queue.");
  }
  if (application.status === "APPROVED" || application.status === "REJECTED") {
    return platformFail("already_decided", `This application was already ${application.status.toLowerCase()}.`);
  }
  if (application.status === "WITHDRAWN") {
    return platformFail("invalid_state", "The applicant withdrew this application.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.partnerApplication.update({
      where: { id: application.id },
      data: {
        status: data.decision,
        reviewNotes: data.reviewNotes ?? null,
        reviewedById: context.user.id,
        reviewedAt: data.decision === "UNDER_REVIEW" ? null : now,
      },
    });

    if (data.decision !== "UNDER_REVIEW") {
      await promotePartnerProfile(tx, application.id, data.decision, {
        reviewerId: context.user.id,
        notes: data.reviewNotes ?? null,
      });
    }
  });

  await recordPlatformAction({
    context,
    action: "platform.partner_application_decided",
    entityType: "partner_application",
    entityId: application.id,
    metadata: {
      decision: data.decision,
      partnerType: application.partnerType,
      previousStatus: application.status,
    },
    
  });

  return platformOk({ applicationId: application.id, status: data.decision });
}

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Moves the partner profile behind an application, when one exists.
 *
 * A pharmacy, laboratory, ambulance operator and insurer each keep a regulated
 * profile in a different table, so this is a switch rather than a generic update
 * — which is also what keeps an application of one type from touching a profile
 * of another.
 */
async function promotePartnerProfile(
  tx: TransactionClient,
  applicationId: string,
  decision: "APPROVED" | "REJECTED",
  review: { reviewerId: string; notes: string | null },
) {
  const application = await tx.partnerApplication.findUnique({
    where: { id: applicationId },
    select: { applicantUserId: true, partnerType: true },
  });
  if (!application) return;

  const verificationStatus: VerificationState = decision === "APPROVED" ? "VERIFIED" : "REJECTED";
  const now = new Date();

  if (application.partnerType === "PHARMACY") {
    await tx.pharmacyPartnerProfile.updateMany({
      where: { ownerUserId: application.applicantUserId },
      data: {
        status: decision,
        verificationStatus,
        verificationNotes: review.notes,
        verifiedAt: decision === "APPROVED" ? now : null,
        verifiedById: decision === "APPROVED" ? review.reviewerId : null,
        dataProvenance: decision === "APPROVED" ? "PLATFORM_VERIFIED" : "PROVIDER_SUBMITTED",
      },
    });
    return;
  }

  if (application.partnerType === "LABORATORY" || application.partnerType === "DIAGNOSTIC_CENTER") {
    await tx.labPartnerProfile.updateMany({
      where: { ownerUserId: application.applicantUserId },
      data: {
        status: decision,
        verificationStatus,
        verificationNotes: review.notes,
        verifiedAt: decision === "APPROVED" ? now : null,
        verifiedById: decision === "APPROVED" ? review.reviewerId : null,
        dataProvenance: decision === "APPROVED" ? "PLATFORM_VERIFIED" : "PROVIDER_SUBMITTED",
      },
    });
    return;
  }

  if (application.partnerType === "AMBULANCE") {
    await tx.ambulancePartnerProfile.updateMany({
      where: { userId: application.applicantUserId },
      data: {
        verificationStatus,
        verificationNotes: review.notes,
        verifiedAt: decision === "APPROVED" ? now : null,
        verifiedById: decision === "APPROVED" ? review.reviewerId : null,
        // A newly verified operator is still not taking calls until it opts in.
        acceptingRequests: false,
      },
    });
    return;
  }

  if (application.partnerType === "INSURANCE") {
    await tx.insurerPartnerProfile.updateMany({
      where: { ownerUserId: application.applicantUserId },
      data: {
        status: decision,
        verificationStatus,
        verificationNotes: review.notes,
        verifiedAt: decision === "APPROVED" ? now : null,
        verifiedById: decision === "APPROVED" ? review.reviewerId : null,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Suspension
// ---------------------------------------------------------------------------

export type PartnerSuspensionRecord = {
  kind: ManagedPartnerKind;
  id: string;
  label: string;
  verificationStatus: VerificationState;
  updatedAt: Date;
};

/**
 * Suspends a verified partner, or lifts a suspension.
 *
 * The capability flags are the reason this is more than a status write. A
 * suspended laboratory may not publish a report, a suspended pharmacy may not
 * dispense a prescription medicine, a suspended insurer may not record a claim
 * decision. Clearing them here means a suspension takes effect in the one place
 * the capability is actually checked, rather than only in a queue's filter.
 *
 * Lifting a suspension restores `VERIFIED` and does not restore those flags: the
 * reviewer who lifts it must re-grant them deliberately. That asymmetry is the
 * point — restoring the right to publish a clinical document should never be a
 * side effect of an undo.
 */
export async function setPartnerSuspension(input: {
  context: PlatformContext;
  data: PartnerSuspensionInput;
}): Promise<PlatformResult<PartnerSuspensionRecord>> {
  const { context, data } = input;

  const record = await findPartnerForSuspension(data.partnerKind, data.partnerId);
  if (!record) return platformFail("partner_not_found", "That partner record was not found.");

  const isSuspending = data.suspended;

  if (isSuspending && record.verificationStatus === "SUSPENDED") {
    return platformFail("partner_already_suspended", "That partner is already suspended.");
  }
  if (!isSuspending && record.verificationStatus !== "SUSPENDED") {
    return platformFail("partner_not_suspended", "That partner is not suspended.");
  }
  if (isSuspending && record.verificationStatus !== "VERIFIED") {
    return platformFail(
      "suspension_needs_verification_first",
      "Only a verified partner can be suspended. Reject the pending application instead.",
    );
  }

  const now = new Date();
  const nextState: VerificationState = isSuspending ? "SUSPENDED" : "VERIFIED";

  await prisma.$transaction(async (tx) => {
    const stamp = `[${now.toISOString().slice(0, 10)} · ${isSuspending ? "suspended" : "suspension lifted"}] ${data.reason}`;

    if (data.partnerKind === "HOSPITAL") {
      await tx.hospital.update({
        where: { id: data.partnerId },
        data: {
          verificationStatus: nextState,
          verificationNotes: stamp,
          verifiedAt: isSuspending ? record.verifiedAt : now,
          verifiedById: isSuspending ? record.verifiedById : context.user.id,
        },
      });
    } else if (data.partnerKind === "DOCTOR") {
      await tx.doctorProfile.update({
        where: { id: data.partnerId },
        data: {
          verificationStatus: nextState,
          verificationNotes: stamp,
          verifiedAt: isSuspending ? record.verifiedAt : now,
          verifiedById: isSuspending ? record.verifiedById : context.user.id,
          // A suspended clinician cannot keep taking new patients.
          acceptingNewPatients: isSuspending ? false : record.acceptingNewPatients,
          teleconsultEnabled: isSuspending ? false : record.teleconsultEnabled,
        },
      });
    } else if (data.partnerKind === "PHARMACY") {
      await tx.pharmacyPartnerProfile.update({
        where: { id: data.partnerId },
        data: {
          verificationStatus: nextState,
          verificationNotes: stamp,
          verifiedAt: isSuspending ? record.verifiedAt : now,
          verifiedById: isSuspending ? record.verifiedById : context.user.id,
          canDispensePrescriptionMedicines: isSuspending ? false : record.canDispensePrescriptionMedicines,
          canDispenseControlledMedicines: isSuspending ? false : record.canDispenseControlledMedicines,
        },
      });
    } else if (data.partnerKind === "LABORATORY") {
      await tx.labPartnerProfile.update({
        where: { id: data.partnerId },
        data: {
          verificationStatus: nextState,
          verificationNotes: stamp,
          verifiedAt: isSuspending ? record.verifiedAt : now,
          verifiedById: isSuspending ? record.verifiedById : context.user.id,
          canPublishReports: isSuspending ? false : record.canPublishReports,
        },
      });
    } else if (data.partnerKind === "AMBULANCE") {
      await tx.ambulancePartnerProfile.update({
        where: { id: data.partnerId },
        data: {
          verificationStatus: nextState,
          verificationNotes: stamp,
          verifiedAt: isSuspending ? record.verifiedAt : now,
          verifiedById: isSuspending ? record.verifiedById : context.user.id,
          // A suspended operator must stop receiving dispatch requests.
          acceptingRequests: false,
        },
      });
    } else {
      await tx.insurerPartnerProfile.update({
        where: { id: data.partnerId },
        data: {
          verificationStatus: nextState,
          verificationNotes: stamp,
          verifiedAt: isSuspending ? record.verifiedAt : now,
          verifiedById: isSuspending ? record.verifiedById : context.user.id,
          canRecordDecisions: isSuspending ? false : record.canRecordDecisions,
          canManageNetwork: isSuspending ? false : record.canManageNetwork,
          canManageProducts: isSuspending ? false : record.canManageProducts,
        },
      });
    }
  });

  await recordPlatformAction({
    context,
    action: "platform.partner_suspended",
    entityType: suspensionEntityType(data.partnerKind),
    entityId: data.partnerId,
    metadata: {
      suspended: isSuspending,
      partnerKind: data.partnerKind,
      label: record.label,
      previousState: record.verificationStatus,
      // The reason is a decision record, not a secret; it is stored on the
      // partner row itself. The audit row keeps only that it was given.
      reasonGiven: true,
      operator: actingOperatorLabel(context),
    },
    
  });

  return platformOk({
    kind: data.partnerKind,
    id: data.partnerId,
    label: record.label,
    verificationStatus: nextState,
    updatedAt: now,
  });
}

type PartnerSuspensionLookup = {
  label: string;
  verificationStatus: VerificationState;
  verifiedAt: Date | null;
  verifiedById: string | null;
  acceptingNewPatients: boolean;
  teleconsultEnabled: boolean;
  canDispensePrescriptionMedicines: boolean;
  canDispenseControlledMedicines: boolean;
  canPublishReports: boolean;
  canRecordDecisions: boolean;
  canManageNetwork: boolean;
  canManageProducts: boolean;
};

/**
 * Looks a partner up by kind and id.
 *
 * The kind and the id are both required, so an id from one table can never be
 * applied to another — which is the whole reason the console takes a kind at all.
 * Every capability flag is read back so a suspension can restore the ones a lift
 * is allowed to restore.
 */
async function findPartnerForSuspension(
  kind: ManagedPartnerKind,
  id: string,
): Promise<PartnerSuspensionLookup | null> {
  const empty = {
    acceptingNewPatients: false,
    teleconsultEnabled: false,
    canDispensePrescriptionMedicines: false,
    canDispenseControlledMedicines: false,
    canPublishReports: false,
    canRecordDecisions: false,
    canManageNetwork: false,
    canManageProducts: false,
  };

  if (kind === "HOSPITAL") {
    const row = await prisma.hospital.findUnique({
      where: { id },
      select: { name: true, verificationStatus: true, verifiedAt: true, verifiedById: true },
    });
    return row ? { ...empty, ...row, label: row.name } : null;
  }

  if (kind === "DOCTOR") {
    const row = await prisma.doctorProfile.findUnique({
      where: { id },
      select: {
        verificationStatus: true,
        verifiedAt: true,
        verifiedById: true,
        acceptingNewPatients: true,
        teleconsultEnabled: true,
        user: { select: { fullName: true } },
      },
    });
    return row
      ? {
          ...empty,
          ...row,
          label: `Dr ${row.user.fullName}`,
        }
      : null;
  }

  if (kind === "PHARMACY") {
    const row = await prisma.pharmacyPartnerProfile.findUnique({
      where: { id },
      select: {
        legalName: true,
        verificationStatus: true,
        verifiedAt: true,
        verifiedById: true,
        canDispensePrescriptionMedicines: true,
        canDispenseControlledMedicines: true,
      },
    });
    return row ? { ...empty, ...row, label: row.legalName } : null;
  }

  if (kind === "LABORATORY") {
    const row = await prisma.labPartnerProfile.findUnique({
      where: { id },
      select: {
        legalName: true,
        verificationStatus: true,
        verifiedAt: true,
        verifiedById: true,
        canPublishReports: true,
      },
    });
    return row ? { ...empty, ...row, label: row.legalName } : null;
  }

  if (kind === "AMBULANCE") {
    const row = await prisma.ambulancePartnerProfile.findUnique({
      where: { id },
      select: {
        organizationName: true,
        verificationStatus: true,
        verifiedAt: true,
        verifiedById: true,
      },
    });
    return row ? { ...empty, ...row, label: row.organizationName } : null;
  }

  const row = await prisma.insurerPartnerProfile.findUnique({
    where: { id },
    select: {
      organisationName: true,
      verificationStatus: true,
      verifiedAt: true,
      verifiedById: true,
      canRecordDecisions: true,
      canManageNetwork: true,
      canManageProducts: true,
    },
  });
  return row ? { ...empty, ...row, label: row.organisationName } : null;
}

function suspensionEntityType(kind: ManagedPartnerKind) {
  switch (kind) {
    case "HOSPITAL":
      return "hospital" as const;
    case "DOCTOR":
      return "doctor_profile" as const;
    case "PHARMACY":
      return "pharmacy_partner_profile" as const;
    case "LABORATORY":
      return "lab_partner_profile" as const;
    case "AMBULANCE":
      return "ambulance_partner_profile" as const;
    default:
      return "insurer_partner_profile" as const;
  }
}
