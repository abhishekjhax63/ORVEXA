import "server-only";

import { cache } from "react";
import type { CaregiverScope } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import { CaregiverScopeError, careFail, careOk, type CareResult } from "@/lib/care/errors";
import { hasConsent } from "@/lib/care/consent";

/**
 * Who is allowed to see and write a person's health information.
 *
 * ## Why this is not a permission
 *
 * Every other boundary in ORVEXA is role-based: a nurse holds
 * `hospital.records_read` and may read the ward's patients. Family access cannot
 * work that way. A husband who may book his wife's appointments is not thereby
 * allowed to read her pathology report, and no platform role can express that,
 * because the same person may have different arrangements with different
 * relatives.
 *
 * So the grant is a *row* — `CaregiverAccess` — owned by the person whose record
 * it is, carrying an explicit `scopes` array. This module is the only place that
 * row is consulted.
 *
 * ## The three conditions that must all hold
 *
 * A caregiver reaches a record only when, at the moment of the request:
 *
 * 1. the `CaregiverAccess` row is `ACTIVE` and not past `expiresAt`, and
 * 2. the owner still holds a granted `CAREGIVER_HEALTH_ACCESS` consent, and
 * 3. the row's `scopes` contains the scope this particular operation needs.
 *
 * All three are re-read per request, never cached across requests, so a
 * revocation is effective on the caregiver's very next action rather than at the
 * end of a session.
 */

export type CareSubject =
  | {
      kind: "self";
      /** The account whose record this is. */
      ownerUserId: string;
      /** The dependent whose record this is, when it is not the account holder's own. */
      familyMemberId: string | null;
      ownerLabel: string;
    }
  | {
      kind: "caregiver";
      ownerUserId: string;
      familyMemberId: string | null;
      ownerLabel: string;
      accessId: string;
      relationshipLabel: string;
      scopes: ReadonlySet<CaregiverScope>;
    };

export const CAREGIVER_SCOPE_LABELS: Record<CaregiverScope, string> = {
  VIEW_PROFILE: "See the health profile",
  BOOK_APPOINTMENTS: "Book and manage appointments",
  VIEW_RECORDS: "See medical history and reports",
  MANAGE_MEDICATIONS: "Manage medicine schedules",
  MANAGE_REMINDERS: "Manage reminders",
  UPLOAD_DOCUMENTS: "Add documents to the vault",
  MANAGE_WELLNESS: "Record wellness measurements",
};

/**
 * What each scope means, written for the person doing the granting rather than
 * for a developer. Shown next to the toggle, because "VIEW_RECORDS" is not a
 * sentence anybody can consent to.
 */
export const CAREGIVER_SCOPE_DESCRIPTIONS: Record<CaregiverScope, string> = {
  VIEW_PROFILE: "Name, date of birth, blood group, emergency contacts.",
  BOOK_APPOINTMENTS:
    "Book, reschedule and cancel appointments. This does not include seeing any of the medical record.",
  VIEW_RECORDS:
    "Medical history, allergies, immunisations, prescriptions, reports and the timeline. This is the most sensitive scope.",
  MANAGE_MEDICATIONS: "Add and update medicine schedules and log doses. A clinician's schedule stays locked.",
  MANAGE_REMINDERS: "Create, change and pause reminders.",
  UPLOAD_DOCUMENTS: "Add documents to the vault. Uploading does not grant the right to read the rest of it.",
  MANAGE_WELLNESS: "Record measurements such as blood pressure, weight or sleep.",
};

/** Scopes that expose clinical content, called out separately in the UI. */
export const SENSITIVE_CAREGIVER_SCOPES: readonly CaregiverScope[] = ["VIEW_RECORDS"] as const;

type AccessRow = {
  id: string;
  ownerUserId: string;
  caregiverUserId: string | null;
  status: string;
  scopes: CaregiverScope[];
  consentRecordId: string | null;
  expiresAt: Date | null;
  relationship: string;
  owner: { fullName: string; email: string };
};

/**
 * The caregiver's live grant over one owner, or null.
 *
 * Memoised per request: a page that renders four sections over the same
 * relative should not read the same row four times. It is *not* memoised across
 * requests, which is what makes revocation immediate.
 */
const loadCaregiverAccess = cache(
  async (ownerUserId: string, caregiverUserId: string): Promise<AccessRow | null> =>
    prisma.caregiverAccess.findUnique({
      where: { ownerUserId_caregiverUserId: { ownerUserId, caregiverUserId } },
      select: {
        id: true,
        ownerUserId: true,
        caregiverUserId: true,
        status: true,
        scopes: true,
        consentRecordId: true,
        expiresAt: true,
        relationship: true,
        owner: { select: { fullName: true, email: true } },
      },
    }),
);

function accessIsLive(row: AccessRow, now: Date): boolean {
  if (row.status !== "ACTIVE") return false;
  if (!row.caregiverUserId) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Resolves "whose record am I acting on, and by what right".
 *
 * `ownerUserId` defaults to the viewer, so a self-service call is the plain
 * case. When it names somebody else the caregiver grant is loaded and every
 * condition above is checked; a failure is returned rather than thrown, because
 * a screen has to be able to render "your access to this record has ended".
 */
export async function resolveCareSubject(input: {
  viewerUserId: string;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
}): Promise<CareResult<CareSubject>> {
  const ownerUserId = input.ownerUserId ?? input.viewerUserId;
  const familyMemberId = input.familyMemberId ?? null;

  if (ownerUserId === input.viewerUserId) {
    const familyMemberResult = await assertFamilyMemberOwnedBy(input.viewerUserId, familyMemberId);
    if (!familyMemberResult.ok) return familyMemberResult;
    const viewer = await prisma.user.findUnique({
      where: { id: input.viewerUserId },
      select: { fullName: true },
    });
    return careOk({
      kind: "self",
      ownerUserId,
      familyMemberId,
      ownerLabel: viewer?.fullName ?? "You",
    });
  }

  const row = await loadCaregiverAccess(ownerUserId, input.viewerUserId);
  if (!row) {
    return careFail("caregiver_access_not_found", "You do not have access to that health record.");
  }
  if (row.status === "REVOKED") {
    return careFail("caregiver_access_revoked", "Your access to that health record has been revoked.");
  }
  if (!accessIsLive(row, new Date())) {
    return careFail(
      "caregiver_access_not_active",
      row.status === "EXPIRED"
        ? "Your access to that health record has expired."
        : row.status === "SUSPENDED"
          ? "Your access to that health record is suspended."
          : "That caregiver invitation has not been accepted yet.",
    );
  }

  // Condition 2: the owner's own consent must still be in force. Withdrawing it
  // ends every grant made under it, without having to touch each row.
  if (!(await hasConsent(ownerUserId, "CAREGIVER_HEALTH_ACCESS"))) {
    return careFail(
      "consent_required",
      "The record owner has withdrawn consent for family access to this health record.",
    );
  }

  const familyMemberResult = await assertFamilyMemberOwnedBy(ownerUserId, familyMemberId);
  if (!familyMemberResult.ok) return familyMemberResult;

  return careOk({
    kind: "caregiver",
    ownerUserId,
    familyMemberId,
    ownerLabel: row.owner.fullName,
    accessId: row.id,
    relationshipLabel: row.relationship,
    scopes: new Set(row.scopes),
  });
}

/** A dependent must belong to the record owner, whoever that is. */
async function assertFamilyMemberOwnedBy(
  ownerUserId: string,
  familyMemberId: string | null,
): Promise<CareResult<null>> {
  if (!familyMemberId) return careOk(null);
  const member = await prisma.familyMember.findFirst({
    where: { id: familyMemberId, patientProfile: { userId: ownerUserId } },
    select: { id: true },
  });
  if (!member) {
    return careFail("family_member_not_found", "That family member is not on this health record.");
  }
  return careOk(null);
}

/**
 * Non-throwing scope check, for a screen deciding what to render.
 *
 * The acting user is always allowed: this only constrains caregivers, and it
 * constrains them on every single operation rather than once at the door.
 */
export function subjectHasScope(subject: CareSubject, scope: CaregiverScope): boolean {
  if (subject.kind === "self") return true;
  return subject.scopes.has(scope);
}

/** Throwing scope check, for the service layer. */
export function requireScope(subject: CareSubject, scope: CaregiverScope): CareResult<CareSubject> {
  if (subjectHasScope(subject, scope)) return careOk(subject);
  return careFail(
    "caregiver_scope_missing",
    `You have not been given permission to ${CAREGIVER_SCOPE_LABELS[scope].toLowerCase()}.`,
  );
}

/**
 * The same check, as a guard that records the denial before it throws.
 *
 * A caregiver reaching outside their scopes is precisely the event the owner
 * needs to be able to find later, so it is written to the audit trail before the
 * error is raised — the audit write is not allowed to be skipped by the throw.
 */
export async function assertCaregiverScope(input: {
  subject: CareSubject;
  scope: CaregiverScope;
  entityId?: string | null;
  context?: RequestContext;
}): Promise<CareSubject> {
  const result = requireScope(input.subject, input.scope);
  if (result.ok) return input.subject;

  if (input.subject.kind === "caregiver") {
    await recordAuditEvent({
      action: "care.caregiver_scope_denied",
      entityType: "caregiver_access",
      entityId: input.subject.accessId,
      outcome: "DENIED",
      actorUserId: null,
      context: input.context,
      metadata: {
        ownerUserId: input.subject.ownerUserId,
        requiredScope: input.scope,
        grantedScopes: [...input.subject.scopes],
      },
    });
  }

  throw new CaregiverScopeError(
    input.scope,
    input.subject.kind === "caregiver" ? input.subject.accessId : "self",
    result.message,
  );
}

/**
 * Records that somebody other than the owner opened a record.
 *
 * Kept separate from the read itself so a caller that legitimately reads
 * repeatedly (a page rendering a timeline) can record once, and so a self-read
 * does not fill the trail with the owner's own activity.
 */
export async function recordCareRecordRead(input: {
  subject: CareSubject;
  entityType: "health_document" | "medical_history_item" | "allergy_record" | "immunization_record";
  entityId: string;
}): Promise<void> {
  if (input.subject.kind === "self") return;
  await recordAuditEvent({
    action: "care.record_read",
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: null,
    metadata: {
      ownerUserId: input.subject.ownerUserId,
      accessId: input.subject.accessId,
      familyMemberId: input.subject.familyMemberId,
    },
  });
}

export type CareSubjectSummary = {
  ownerUserId: string;
  familyMemberId: string | null;
  label: string;
  kind: "self" | "caregiver";
  relationshipLabel: string | null;
};

/**
 * Everyone whose record this account can act on: itself, its dependents, and
 * the people who have granted it caregiver access.
 *
 * Drives the "whose record am I looking at" switcher. Only ACTIVE grants whose
 * consent is still held appear, so the switcher cannot offer a record the
 * caregiver would then be refused on.
 */
export async function listCareSubjects(viewerUserId: string): Promise<CareSubjectSummary[]> {
  const [viewer, dependents, granted, consentedOwners] = await Promise.all([
    prisma.user.findUnique({ where: { id: viewerUserId }, select: { fullName: true } }),
    prisma.familyMember.findMany({
      where: { patientProfile: { userId: viewerUserId } },
      select: { id: true, fullName: true, relationship: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.caregiverAccess.findMany({
      where: { caregiverUserId: viewerUserId, status: "ACTIVE" },
      select: {
        ownerUserId: true,
        relationship: true,
        expiresAt: true,
        owner: { select: { fullName: true } },
      },
      orderBy: { invitedAt: "asc" },
    }),
    prisma.consentRecord.findMany({
      where: { consentType: "CAREGIVER_HEALTH_ACCESS", granted: true, revokedAt: null },
      select: { userId: true },
    }),
  ]);

  const consented = new Set(consentedOwners.map((row) => row.userId));
  const self: CareSubjectSummary = {
    ownerUserId: viewerUserId,
    familyMemberId: null,
    label: viewer?.fullName ?? "You",
    kind: "self",
    relationshipLabel: null,
  };

  const dependentsForSelf: CareSubjectSummary[] = dependents.map((member) => ({
    ownerUserId: viewerUserId,
    familyMemberId: member.id,
    label: member.fullName,
    kind: "self",
    relationshipLabel: member.relationship,
  }));

  const now = Date.now();
  const caregiverFor: CareSubjectSummary[] = granted
    .filter((row) => row.ownerUserId !== viewerUserId)
    .filter((row) => !row.expiresAt || row.expiresAt.getTime() > now)
    .filter((row) => consented.has(row.ownerUserId))
    .map((row) => ({
      ownerUserId: row.ownerUserId,
      familyMemberId: null,
      label: row.owner.fullName,
      kind: "caregiver",
      relationshipLabel: row.relationship,
    }));

  const seen = new Set<string>();
  return [self, ...dependentsForSelf, ...caregiverFor].filter((entry) => {
    const key = `${entry.ownerUserId}:${entry.familyMemberId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The provenance a value written through this subject must carry.
 *
 * A caregiver typing a reading is not a clinician recording one, and the two
 * must be distinguishable in the database rather than in the UI. Everything a
 * person or their caregiver enters is `USER_ENTERED`; who actually typed it is
 * carried by the row's own `createdById`, so a caregiver's entry is attributable
 * without being dressed up as clinical data.
 */
export function provenanceForSubject(_subject: CareSubject): "USER_ENTERED" {
  return "USER_ENTERED";
}
