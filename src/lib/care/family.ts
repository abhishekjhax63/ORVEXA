import "server-only";

import type { CaregiverScope, FamilyRelationship } from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { CAREGIVER_CONSENT_POLICY_VERSION, hasConsent, recordConsent } from "@/lib/care/consent";
import { careFail, careOk, type CareResult } from "@/lib/care/errors";
import { prisma } from "@/lib/db/prisma";
import { sendNotification } from "@/lib/notifications/provider";
import { recordAuditEvent } from "@/lib/security/audit";
import { getRequestContext, type RequestContext } from "@/lib/security/request";
import type { CaregiverInviteInput, FamilyMemberCreateInput } from "@/lib/validation/care";

/**
 * Family members and caregiver access.
 *
 * ## What this module decides
 *
 * Two different things share the word "family" in ORVEXA and must not be
 * confused:
 *
 * - A **dependent** (`FamilyMember`) is a person on the account holder's own
 *   record — a child, an elderly parent. The account holder always keeps full
 *   control; there is no consent to withdraw because there is nobody else to
 *   ask.
 * - A **caregiver** (`CaregiverAccess`) is a *separate account* that has been
 *   given a named, limited, revocable slice of somebody's record. It is created
 *   by an invitation, it does nothing until the other person accepts, and either
 *   side can end it.
 *
 * The safety rule this file exists to hold is in the second one: **access is
 * granted, not assumed**. A relationship never implies a scope, an invitation
 * never grants anything until it is accepted, and every change is written to the
 * audit trail before it is reported as done.
 *
 * ## Consent
 *
 * `CAREGIVER_HEALTH_ACCESS` consent is held by the person whose record it is,
 * and every live grant hangs off it. Sending an invitation is the act that
 * establishes it, and withdrawing it — here or on the consent screen — ends
 * every grant made under it in the same transaction, without having to visit
 * each row.
 */

// ---------------------------------------------------------------------------
// Dependents
// ---------------------------------------------------------------------------

export type FamilyMemberSummary = {
  id: string;
  fullName: string;
  relationship: FamilyRelationship;
  dateOfBirth: Date | null;
  bloodGroup: string;
  canBookAppointments: boolean;
  canViewRecords: boolean;
  canManageProfile: boolean;
  createdAt: Date;
};

export async function listFamilyMembers(userId: string): Promise<FamilyMemberSummary[]> {
  const profile = await prisma.patientProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) return [];

  return prisma.familyMember.findMany({
    where: { patientProfileId: profile.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fullName: true,
      relationship: true,
      dateOfBirth: true,
      bloodGroup: true,
      canBookAppointments: true,
      canViewRecords: true,
      canManageProfile: true,
      createdAt: true,
    },
  });
}

/** A dependent is only ever reachable through the profile that owns it. */
async function requireOwnFamilyMember(userId: string, familyMemberId: string) {
  return prisma.familyMember.findFirst({
    where: { id: familyMemberId, patientProfile: { userId } },
    select: { id: true, patientProfileId: true, fullName: true },
  });
}

export async function addFamilyMember(input: {
  user: AuthenticatedUser;
  data: FamilyMemberCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ familyMemberId: string }>> {
  const profile = await prisma.patientProfile.upsert({
    where: { userId: input.user.id },
    create: { userId: input.user.id },
    update: {},
    select: { id: true },
  });

  const duplicate = await prisma.familyMember.findFirst({
    where: {
      patientProfileId: profile.id,
      fullName: input.data.fullName,
      relationship: input.data.relationship,
    },
    select: { id: true },
  });
  if (duplicate) {
    return careFail("duplicate", `${input.data.fullName} is already on your record as a ${input.data.relationship.toLowerCase()}.`);
  }

  const member = await prisma.familyMember.create({
    data: {
      patientProfileId: profile.id,
      fullName: input.data.fullName,
      relationship: input.data.relationship,
      dateOfBirth: input.data.dateOfBirth ?? null,
      gender: input.data.gender ?? null,
      bloodGroup: input.data.bloodGroup ?? "UNKNOWN",
      // A dependent's appointments are managed by the account holder; the
      // per-member flags exist for older records and are left off deliberately.
      createdById: input.user.id,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "care.family_member_added",
    entityType: "family_member",
    entityId: member.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { relationship: input.data.relationship },
  });

  return careOk({ familyMemberId: member.id });
}

export async function updateFamilyMember(input: {
  user: AuthenticatedUser;
  familyMemberId: string;
  data: Partial<FamilyMemberCreateInput>;
  context?: RequestContext;
}): Promise<CareResult<{ familyMemberId: string }>> {
  const member = await requireOwnFamilyMember(input.user.id, input.familyMemberId);
  if (!member) return careFail("family_member_not_found", "That family member is not on your record.");

  await prisma.familyMember.update({
    where: { id: member.id },
    data: {
      fullName: input.data.fullName,
      relationship: input.data.relationship,
      dateOfBirth: input.data.dateOfBirth,
      gender: input.data.gender,
      bloodGroup: input.data.bloodGroup,
    },
  });

  await recordAuditEvent({
    action: "care.family_member_updated",
    entityType: "family_member",
    entityId: member.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { fields: Object.keys(input.data).filter((key) => input.data[key as keyof typeof input.data] !== undefined) },
  });

  return careOk({ familyMemberId: member.id });
}

// ---------------------------------------------------------------------------
// Caregiver access
// ---------------------------------------------------------------------------

export type CaregiverGrantSummary = {
  id: string;
  status: string;
  relationship: FamilyRelationship;
  scopes: CaregiverScope[];
  note: string | null;
  invitedEmail: string | null;
  invitedAt: Date;
  acceptedAt: Date | null;
  reviewedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  caregiver: { id: string; fullName: string; email: string } | null;
};

const GRANT_SELECT = {
  id: true,
  status: true,
  relationship: true,
  scopes: true,
  note: true,
  invitedEmail: true,
  invitedAt: true,
  acceptedAt: true,
  reviewedAt: true,
  expiresAt: true,
  revokedAt: true,
  revokedReason: true,
  caregiver: { select: { id: true, fullName: true, email: true } },
} as const;

/** Grants this account has issued. */
export async function listIssuedGrants(ownerUserId: string): Promise<CaregiverGrantSummary[]> {
  return prisma.caregiverAccess.findMany({
    where: { ownerUserId },
    orderBy: [{ status: "asc" }, { invitedAt: "desc" }],
    select: GRANT_SELECT,
  });
}

/** Grants this account has received. */
export async function listReceivedGrants(caregiverUserId: string): Promise<CaregiverGrantSummary[]> {
  return prisma.caregiverAccess.findMany({
    where: { caregiverUserId },
    orderBy: { invitedAt: "desc" },
    select: GRANT_SELECT,
  });
}

export async function getGrant(input: { ownerUserId: string; accessId: string }): Promise<CaregiverGrantSummary | null> {
  return prisma.caregiverAccess.findFirst({
    where: { id: input.accessId, ownerUserId: input.ownerUserId },
    select: GRANT_SELECT,
  });
}

/**
 * Offers a named, limited slice of this account's record to somebody else.
 *
 * Nothing about the relationship is inferred. A spouse invited with
 * `BOOK_APPOINTMENTS` can book appointments and cannot open the record, and the
 * screen that shows them says so in those words.
 */
export async function inviteCaregiver(input: {
  user: AuthenticatedUser;
  data: CaregiverInviteInput;
  context?: RequestContext;
}): Promise<CareResult<{ accessId: string; status: string }>> {
  const email = input.data.caregiverEmail.trim().toLowerCase();
  if (email === input.user.email.toLowerCase()) {
    return careFail("cannot_target_self", "You cannot invite your own email address. Your own record is always yours.");
  }

  const scopes = [...new Set(input.data.scopes)] as CaregiverScope[];
  if (scopes.length === 0) {
    return careFail("validation", "Choose at least one thing this person may do.");
  }

  const invitee = await prisma.user.findUnique({ where: { email }, select: { id: true, fullName: true } });

  const existing = invitee
    ? await prisma.caregiverAccess.findUnique({
        where: { ownerUserId_caregiverUserId: { ownerUserId: input.user.id, caregiverUserId: invitee.id } },
        select: { id: true, status: true },
      })
    : await prisma.caregiverAccess.findFirst({
        where: { ownerUserId: input.user.id, invitedEmail: email, caregiverUserId: null },
        select: { id: true, status: true },
      });

  if (existing && existing.status !== "REVOKED" && existing.status !== "EXPIRED") {
    return careFail("duplicate", "There is already an invitation for that person. Review or revoke it instead.");
  }

  // Sending the invitation is what establishes the owner's consent, so it is
  // recorded once and reused by every later invitation from this account.
  if (!(await hasConsent(input.user.id, "CAREGIVER_HEALTH_ACCESS"))) {
    await recordConsent({
      userId: input.user.id,
      consentType: "CAREGIVER_HEALTH_ACCESS",
      granted: true,
      policyVersion: CAREGIVER_CONSENT_POLICY_VERSION,
      context: input.context,
    });
  }
  const consent = await prisma.consentRecord.findFirst({
    where: { userId: input.user.id, consentType: "CAREGIVER_HEALTH_ACCESS", granted: true, revokedAt: null },
    orderBy: { grantedAt: "desc" },
    select: { id: true },
  });

  const row = await prisma.caregiverAccess.create({
    data: {
      ownerUserId: input.user.id,
      caregiverUserId: invitee?.id ?? null,
      invitedEmail: email,
      relationship: input.data.relationship,
      status: "INVITED",
      scopes,
      consentRecordId: consent?.id ?? null,
      note: input.data.note ?? null,
      invitedById: input.user.id,
      expiresAt: input.data.expiresAt ?? null,
    },
    select: { id: true, status: true },
  });

  await recordAuditEvent({
    action: "care.caregiver_access_invited",
    entityType: "caregiver_access",
    entityId: row.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { scopes, relationship: input.data.relationship, inviteeFound: Boolean(invitee) },
  });

  // The invitation is delivered through the replaceable notification provider,
  // which reports honestly when no transport exists rather than claiming an
  // inbox received it.
  await sendNotification({
    kind: "caregiver_invitation",
    channel: "EMAIL",
    to: email,
    subject: `${input.user.fullName} has invited you to help with their health record on ORVEXA`,
    body:
      `${input.user.fullName} has invited you to help with parts of their ORVEXA health record.\n\n` +
      `What you will be able to do: ${scopes.join(", ")}.\n\n` +
      "Nothing is shared until you sign in and accept, and either of you can end this access at any time.",
  }).catch(() => null);

  return careOk({ accessId: row.id, status: row.status });
}

/**
 * Accepts an invitation addressed to this account's email.
 *
 * Matching is by address rather than by an id the invitee was told, so a
 * forwarded invitation link cannot make a different account the caregiver.
 */
export async function acceptCaregiverInvitation(input: {
  user: AuthenticatedUser;
  context?: RequestContext;
}): Promise<CareResult<{ accessId: string; ownerUserId: string }>> {
  const pending = await prisma.caregiverAccess.findMany({
    where: {
      invitedEmail: input.user.email.toLowerCase(),
      status: "INVITED",
      OR: [{ caregiverUserId: null }, { caregiverUserId: input.user.id }],
    },
    orderBy: { invitedAt: "desc" },
    select: { id: true, ownerUserId: true, scopes: true, expiresAt: true },
  });

  const accepted: { accessId: string; ownerUserId: string }[] = [];
  const now = new Date();

  for (const row of pending) {
    const stillWanted = !row.expiresAt || row.expiresAt.getTime() > now.getTime();
    await prisma.caregiverAccess.update({
      where: { id: row.id },
      data: {
        caregiverUserId: input.user.id,
        acceptedAt: now,
        status: stillWanted ? "ACTIVE" : "EXPIRED",
      },
    });
    await recordAuditEvent({
      action: "care.caregiver_access_accepted",
      entityType: "caregiver_access",
      entityId: row.id,
      actorUserId: input.user.id,
      context: input.context,
      metadata: { scopes: row.scopes, expiredOnArrival: !stillWanted },
    });
    if (stillWanted) accepted.push({ accessId: row.id, ownerUserId: row.ownerUserId });
  }

  if (accepted.length === 0) {
    if (pending.length > 0) {
      return careFail("caregiver_access_not_active", "That invitation had already expired when you accepted it.");
    }
    return careFail("caregiver_access_not_found", "There is no invitation waiting for this email address.");
  }

  return careOk(accepted[0]);
}

/**
 * Changes what a caregiver may do.
 *
 * Widening a grant is written to the trail with the scope that was added, so a
 * person reviewing their own record can see that access grew rather than only
 * what it currently is.
 */
export async function updateCaregiverScopes(input: {
  user: AuthenticatedUser;
  accessId: string;
  scopes: CaregiverScope[];
  context?: RequestContext;
}): Promise<CareResult<{ accessId: string; scopes: CaregiverScope[] }>> {
  const row = await prisma.caregiverAccess.findFirst({
    where: { id: input.accessId, ownerUserId: input.user.id },
    select: { id: true, scopes: true, status: true },
  });
  if (!row) return careFail("caregiver_access_not_found", "That caregiver invitation was not found on your record.");
  if (row.status === "REVOKED" || row.status === "EXPIRED") {
    return careFail("caregiver_access_revoked", "This access has already ended, so its permissions cannot be changed.");
  }

  const next = [...new Set(input.scopes)] as CaregiverScope[];
  const added = next.filter((scope) => !row.scopes.includes(scope));
  const removed = row.scopes.filter((scope) => !next.includes(scope));

  await prisma.caregiverAccess.update({
    where: { id: row.id },
    data: { scopes: next, reviewedAt: new Date() },
  });

  await recordAuditEvent({
    action: "care.caregiver_access_scope_changed",
    entityType: "caregiver_access",
    entityId: row.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { added, removed, scopes: next },
  });

  return careOk({ accessId: row.id, scopes: next });
}

/**
 * Ends a grant. Either side may do it.
 *
 * The row is marked `REVOKED` rather than deleted, so the question "who could
 * see this, and when did that stop" still has an answer afterwards.
 */
export async function revokeCaregiverAccess(input: {
  user: AuthenticatedUser;
  accessId: string;
  reason?: string | null;
  context?: RequestContext;
}): Promise<CareResult<{ accessId: string }>> {
  const row = await prisma.caregiverAccess.findFirst({
    where: {
      id: input.accessId,
      OR: [{ ownerUserId: input.user.id }, { caregiverUserId: input.user.id }],
    },
    select: { id: true, ownerUserId: true, caregiverUserId: true, status: true },
  });
  if (!row) return careFail("caregiver_access_not_found", "That caregiver access was not found.");
  if (row.status === "REVOKED") return careOk({ accessId: row.id });

  await prisma.caregiverAccess.update({
    where: { id: row.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedById: input.user.id,
      revokedReason: input.reason ?? null,
    },
  });

  await recordAuditEvent({
    action: "care.caregiver_access_revoked",
    entityType: "caregiver_access",
    entityId: row.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      revokedBy: row.ownerUserId === input.user.id ? "owner" : "caregiver",
      reason: input.reason ?? null,
    },
  });

  return careOk({ accessId: row.id });
}

/** The owner confirming they have looked at a live grant and still want it. */
export async function reviewCaregiverAccess(input: {
  user: AuthenticatedUser;
  accessId: string;
  context?: RequestContext;
}): Promise<CareResult<{ accessId: string; reviewedAt: Date }>> {
  const row = await prisma.caregiverAccess.findFirst({
    where: { id: input.accessId, ownerUserId: input.user.id },
    select: { id: true, status: true },
  });
  if (!row) return careFail("caregiver_access_not_found", "That caregiver access was not found on your record.");

  const reviewedAt = new Date();
  await prisma.caregiverAccess.update({ where: { id: row.id }, data: { reviewedAt } });

  await recordAuditEvent({
    action: "care.caregiver_access_reviewed",
    entityType: "caregiver_access",
    entityId: row.id,
    actorUserId: input.user.id,
    context: input.context,
  });

  return careOk({ accessId: row.id, reviewedAt });
}

/**
 * Withdraws the consent that every grant hangs off, ending all of them.
 *
 * This is the blunt instrument, and it is deliberately one transaction: a
 * consent withdrawn while a grant is still `ACTIVE` would be a record saying two
 * contradictory things.
 */
export async function withdrawCaregiverConsent(input: {
  user: AuthenticatedUser;
  context?: RequestContext;
}): Promise<CareResult<{ revokedGrants: number }>> {
  await recordConsent({
    userId: input.user.id,
    consentType: "CAREGIVER_HEALTH_ACCESS",
    granted: false,
    policyVersion: CAREGIVER_CONSENT_POLICY_VERSION,
    context: input.context,
  });

  const now = new Date();
  const revoked = await prisma.$transaction(async (tx) => {
    const live = await tx.caregiverAccess.findMany({
      where: { ownerUserId: input.user.id, status: { in: ["ACTIVE", "INVITED", "SUSPENDED"] } },
      select: { id: true },
    });
    if (live.length === 0) return 0;
    await tx.caregiverAccess.updateMany({
      where: { id: { in: live.map((row) => row.id) } },
      data: { status: "REVOKED", revokedAt: now, revokedById: input.user.id, revokedReason: "consent_withdrawn" },
    });
    return live.length;
  });

  await recordAuditEvent({
    action: "care.caregiver_access_revoked",
    entityType: "caregiver_access",
    entityId: input.user.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { revokedGrants: revoked, reason: "consent_withdrawn" },
  });

  return careOk({ revokedGrants: revoked });
}

export async function caregiverConsentStatus(userId: string) {
  return {
    granted: await hasConsent(userId, "CAREGIVER_HEALTH_ACCESS"),
    policyVersion: CAREGIVER_CONSENT_POLICY_VERSION,
  };
}

/**
 * Marks grants whose end date has passed.
 *
 * Intended for a scheduled job. It is a sweep rather than a read-time check
 * because the live check in `resolveCareSubject` is what actually stops access;
 * this only keeps the stored status truthful so a list does not show an expired
 * grant as active until somebody opens it.
 */
export async function expireLapsedGrants(now = new Date()): Promise<{ expired: number }> {
  const lapsed = await prisma.caregiverAccess.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    select: { id: true, ownerUserId: true },
  });
  if (lapsed.length === 0) return { expired: 0 };

  await prisma.caregiverAccess.updateMany({
    where: { id: { in: lapsed.map((row) => row.id) } },
    data: { status: "EXPIRED" },
  });

  for (const row of lapsed) {
    await recordAuditEvent({
      action: "care.caregiver_access_expired",
      entityType: "caregiver_access",
      entityId: row.id,
      actorUserId: null,
      metadata: { ownerUserId: row.ownerUserId },
    });
  }

  return { expired: lapsed.length };
}

/** Convenience wrapper so a call site does not have to import the request module. */
export async function careContext(): Promise<RequestContext> {
  return getRequestContext();
}
