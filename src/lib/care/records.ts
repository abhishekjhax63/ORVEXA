import "server-only";

import type {
  AllergySeverity,
  CaregiverScope,
  HealthDocumentKind,
  HealthDocumentStatus,
  HealthRecordSource,
  HealthTimelineEventKind,
  MedicalHistoryCategory,
} from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  provenanceForSubject,
  recordCareRecordRead,
  requireScope,
  resolveCareSubject,
  type CareSubject,
} from "@/lib/care/access";
import { careFail, careOk, type CareResult } from "@/lib/care/errors";
import { appendTimelineEvent } from "@/lib/care/timeline";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import type {
  AllergyCreateInput,
  HealthDocumentCreateInput,
  ImmunizationCreateInput,
  MedicalHistoryCreateInput,
} from "@/lib/validation/care";

/**
 * Medical history, allergies, immunisations and the document vault.
 *
 * ## What this module is
 *
 * Four registers of the same idea — things that are true about a person's body
 * and that a clinician or a laboratory would recognise — plus the private vault
 * that holds the paperwork behind them. They live together because they share
 * one access rule and one provenance rule, and splitting them would mean writing
 * both rules four times and getting one of them subtly wrong.
 *
 * ## The provenance rule this module holds
 *
 * A row is either something a person (or their caregiver) typed, or something a
 * clinician recorded, and the two are never blurred. Every row written through
 * these functions is `USER_ENTERED`: the caller cannot send a `source`,
 * `verifiedById`, `verifiedAt`, `recordedById` or `createdById`, because a
 * client that could choose its own provenance could label a guess as
 * clinician-verified. A row whose stored `source` is `CLINICIAN_RECORDED` is
 * *locked* — trying to edit it here returns `clinician_source_locked` rather
 * than quietly rewriting what a clinician said.
 *
 * ## The vault rule this module holds
 *
 * `HealthDocument.storageKey` is the private object key, and it is the only way
 * to reach the bytes. It is never selected by a list or a detail read, and it
 * leaves this module through exactly one function, `resolveDocumentForDownload`,
 * which has already checked the caller's scope and written a
 * `care.document_downloaded` audit row before it returns the key. Adding a
 * document is a separate capability from reading the vault: `UPLOAD_DOCUMENTS`
 * lets a caregiver file something and deliberately does not let them open the
 * rest, so the create path checks that scope and nothing more.
 *
 * ## The timeline rule this module holds
 *
 * The personal health timeline is a derived, append-only *view*; it is never a
 * second copy of a record. So nothing here writes a timeline row itself — every
 * clinical write calls `appendTimelineEvent`, which stores a `refType`/`refId`
 * pointing back at the row that is the source of truth. The event is appended in
 * the same `prisma.$transaction` as the write it describes, so a record and its
 * place on the timeline either both exist or neither does.
 */

// ---------------------------------------------------------------------------
// Update payloads
// ---------------------------------------------------------------------------

/**
 * The shapes an edit may take.
 *
 * Reuse the create inputs, made partial, so a field can only ever be edited to
 * something the create path would also have accepted. The target fields
 * (`ownerUserId`, `familyMemberId`) are carried over from the create schema but
 * are ignored on update: an edit cannot move a row to another person's record.
 */
export type AllergyUpdateInput = Partial<AllergyCreateInput> & { isActive?: boolean };
export type ImmunizationUpdateInput = Partial<ImmunizationCreateInput>;
export type MedicalHistoryUpdateInput = Partial<MedicalHistoryCreateInput>;
export type HealthDocumentUpdateInput = {
  title?: string;
  description?: string;
  kind?: HealthDocumentKind;
  issuedByLabel?: string;
  issuedOn?: Date;
};

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export type AllergySummary = {
  id: string;
  substance: string;
  reaction: string | null;
  severity: AllergySeverity;
  source: HealthRecordSource;
  isActive: boolean;
  notes: string | null;
  verifiedById: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ImmunizationSummary = {
  id: string;
  vaccineName: string;
  doseLabel: string | null;
  administeredOn: Date;
  administeredByLabel: string | null;
  facilityLabel: string | null;
  batchNumber: string | null;
  source: HealthRecordSource;
  documentId: string | null;
  notes: string | null;
  verifiedById: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MedicalHistorySummary = {
  id: string;
  category: MedicalHistoryCategory;
  label: string;
  details: string | null;
  onsetOn: Date | null;
  resolvedOn: Date | null;
  source: HealthRecordSource;
  verifiedById: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A vault row as it is shown in a list.
 *
 * Carries everything a card needs and *not* `storageKey`, which is the whole
 * point of the type: a caller can only obtain the key through the single
 * download resolver below.
 */
export type HealthDocumentSummary = {
  id: string;
  kind: HealthDocumentKind;
  status: HealthDocumentStatus;
  title: string;
  description: string | null;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number;
  source: HealthRecordSource;
  issuedByLabel: string | null;
  issuedOn: Date | null;
  isSensitive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TimelineEventSummary = {
  id: string;
  kind: HealthTimelineEventKind;
  source: HealthRecordSource;
  title: string;
  summary: string | null;
  occurredAt: Date;
  refType: string | null;
  refId: string | null;
  documentId: string | null;
  createdAt: Date;
};

/** The only shape in which a private object key is ever returned. */
export type DocumentDownload = {
  id: string;
  title: string;
  storageKey: string;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number;
};

export const DEFAULT_TIMELINE_LIMIT = 50;
export const MAX_TIMELINE_LIMIT = 200;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Resolves whose record is being acted on and confirms the caller holds the
 * scope this operation needs.
 *
 * A `self` subject is always allowed; a caregiver is checked against the live
 * grant on every call, never once at the door.
 */
async function resolveScopedSubject(input: {
  viewerUserId: string;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
  scope: CaregiverScope;
}): Promise<CareResult<CareSubject>> {
  const subject = await resolveCareSubject({
    viewerUserId: input.viewerUserId,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
  });
  if (!subject.ok) return subject;
  return requireScope(subject.data, input.scope);
}

/**
 * Records that a caregiver opened a whole set of clinical rows at once.
 *
 * A list has no single row, so the owner's id stands in as the identifier of the
 * record that was opened. `recordCareRecordRead` returns early for the owner's
 * own reads, so a self-read never fills the trail with the person's own
 * activity.
 */
async function recordCaregiverListRead(
  subject: CareSubject,
  entityType: "health_document" | "medical_history_item" | "allergy_record" | "immunization_record",
): Promise<void> {
  await recordCareRecordRead({ subject, entityType, entityId: subject.ownerUserId });
}

/**
 * Records a caregiver opening the timeline.
 *
 * The shared read helper only knows the four clinical row types, and the
 * timeline is a view rather than one of them, so this mirrors what that helper
 * does — a `care.record_read` naming the record owner and the grant — using the
 * `health_timeline_event` entity type that already exists in the audit
 * vocabulary.
 */
async function recordCaregiverTimelineRead(subject: CareSubject): Promise<void> {
  if (subject.kind === "self") return;
  await recordAuditEvent({
    action: "care.record_read",
    entityType: "health_timeline_event",
    entityId: subject.ownerUserId,
    actorUserId: null,
    metadata: {
      ownerUserId: subject.ownerUserId,
      accessId: subject.accessId,
      familyMemberId: subject.familyMemberId,
    },
  });
}

/** The names of the fields an edit actually supplied, for the audit row. */
function suppliedFieldNames(data: object): string[] {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

// ---------------------------------------------------------------------------
// Reads — medical history, allergies, immunisations and the vault
// ---------------------------------------------------------------------------

/** Active allergies by default; an inactive one is kept but hidden. */
export async function listAllergies(input: {
  user: AuthenticatedUser;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
  includeInactive?: boolean;
}): Promise<CareResult<AllergySummary[]>> {
  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const rows = await prisma.allergyRecord.findMany({
    where: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      ...(input.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      substance: true,
      reaction: true,
      severity: true,
      source: true,
      isActive: true,
      notes: true,
      verifiedById: true,
      verifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await recordCaregiverListRead(subject.data, "allergy_record");
  return careOk(rows);
}

export async function listImmunizations(input: {
  user: AuthenticatedUser;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
}): Promise<CareResult<ImmunizationSummary[]>> {
  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const rows = await prisma.immunizationRecord.findMany({
    where: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
    },
    orderBy: { administeredOn: "desc" },
    select: {
      id: true,
      vaccineName: true,
      doseLabel: true,
      administeredOn: true,
      administeredByLabel: true,
      facilityLabel: true,
      batchNumber: true,
      source: true,
      documentId: true,
      notes: true,
      verifiedById: true,
      verifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await recordCaregiverListRead(subject.data, "immunization_record");
  return careOk(rows);
}

/** Newest onset first, with items that have no onset date last. */
export async function listMedicalHistory(input: {
  user: AuthenticatedUser;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
  category?: MedicalHistoryCategory;
}): Promise<CareResult<MedicalHistorySummary[]>> {
  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const rows = await prisma.medicalHistoryItem.findMany({
    where: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      ...(input.category ? { category: input.category } : {}),
    },
    orderBy: [{ onsetOn: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: {
      id: true,
      category: true,
      label: true,
      details: true,
      onsetOn: true,
      resolvedOn: true,
      source: true,
      verifiedById: true,
      verifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await recordCaregiverListRead(subject.data, "medical_history_item");
  return careOk(rows);
}

/** Active documents by default. `storageKey` is deliberately never selected. */
export async function listHealthDocuments(input: {
  user: AuthenticatedUser;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
  kind?: HealthDocumentKind;
  includeArchived?: boolean;
}): Promise<CareResult<HealthDocumentSummary[]>> {
  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const rows = await prisma.healthDocument.findMany({
    where: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      ...(input.kind ? { kind: input.kind } : {}),
      // Archived rows are hidden unless asked for; a removed row is never listed.
      ...(input.includeArchived ? { status: { not: "REMOVED" } } : { status: "ACTIVE" }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      status: true,
      title: true,
      description: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      source: true,
      issuedByLabel: true,
      issuedOn: true,
      isSensitive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await recordCaregiverListRead(subject.data, "health_document");
  return careOk(rows);
}

/**
 * The single function in the platform that returns a private object key.
 *
 * It checks the scope, records the read, and writes the download to the audit
 * trail *before* handing back `storageKey`, so every use of the key is
 * accounted for. A row that is missing, removed or archived returns
 * `not_found`: an archived or deleted document is not downloadable, and saying
 * so as a 404 keeps the three cases indistinguishable to a caller.
 */
export async function resolveDocumentForDownload(input: {
  user: AuthenticatedUser;
  documentId: string;
  context?: RequestContext;
}): Promise<CareResult<DocumentDownload>> {
  const document = await prisma.healthDocument.findUnique({
    where: { id: input.documentId },
    select: {
      id: true,
      ownerUserId: true,
      familyMemberId: true,
      status: true,
      storageKey: true,
      title: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
    },
  });
  if (!document || document.status !== "ACTIVE") {
    return careFail("not_found", "That document is not available.");
  }

  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: document.ownerUserId,
    familyMemberId: document.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  await recordCareRecordRead({
    subject: subject.data,
    entityType: "health_document",
    entityId: document.id,
  });

  await recordAuditEvent({
    action: "care.document_downloaded",
    entityType: "health_document",
    entityId: document.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: document.ownerUserId,
      familyMemberId: document.familyMemberId,
    },
  });

  return careOk({
    id: document.id,
    title: document.title,
    storageKey: document.storageKey,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
  });
}

export async function listTimeline(input: {
  user: AuthenticatedUser;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
  from?: Date;
  to?: Date;
  kinds?: HealthTimelineEventKind[];
  limit?: number;
}): Promise<CareResult<TimelineEventSummary[]>> {
  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_TIMELINE_LIMIT, 1), MAX_TIMELINE_LIMIT);

  const rows = await prisma.healthTimelineEvent.findMany({
    where: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      ...(input.kinds && input.kinds.length > 0 ? { kind: { in: input.kinds } } : {}),
      ...(input.from || input.to
        ? {
            occurredAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      source: true,
      title: true,
      summary: true,
      occurredAt: true,
      refType: true,
      refId: true,
      documentId: true,
      createdAt: true,
    },
  });

  await recordCaregiverTimelineRead(subject.data);
  return careOk(rows);
}

// ---------------------------------------------------------------------------
// Writes to the clinical record
// ---------------------------------------------------------------------------

export async function createAllergy(input: {
  user: AuthenticatedUser;
  data: AllergyCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ allergyId: string }>> {
  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.data.ownerUserId,
    familyMemberId: input.data.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const severity = input.data.severity ?? "UNKNOWN";

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.allergyRecord.create({
      data: {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        substance: input.data.substance,
        reaction: input.data.reaction ?? null,
        severity,
        source: provenanceForSubject(subject.data),
        recordedById: input.user.id,
        notes: input.data.notes ?? null,
      },
      select: { id: true, substance: true },
    });

    await appendTimelineEvent(
      {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        kind: "ALLERGY_RECORDED",
        source: "USER_ENTERED",
        title: row.substance,
        summary: input.data.reaction ?? null,
        occurredAt: new Date(),
        refType: "AllergyRecord",
        refId: row.id,
      },
      tx,
    );

    return row;
  });

  await recordAuditEvent({
    action: "care.record_written",
    entityType: "allergy_record",
    entityId: created.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      operation: "create",
      severity,
    },
  });

  return careOk({ allergyId: created.id });
}

export async function updateAllergy(input: {
  user: AuthenticatedUser;
  allergyId: string;
  data: AllergyUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ allergyId: string }>> {
  const existing = await prisma.allergyRecord.findUnique({
    where: { id: input.allergyId },
    select: { id: true, ownerUserId: true, familyMemberId: true, source: true, substance: true },
  });
  if (!existing) return careFail("not_found", "That allergy was not found.");

  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  if (existing.source === "CLINICIAN_RECORDED") {
    return careFail("clinician_source_locked", "This allergy was recorded by a clinician and cannot be changed here.");
  }

  const effectiveSubstance = input.data.substance ?? existing.substance;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.allergyRecord.update({
      where: { id: existing.id },
      data: {
        substance: input.data.substance,
        reaction: input.data.reaction,
        severity: input.data.severity,
        notes: input.data.notes,
        isActive: input.data.isActive,
      },
      select: { id: true },
    });

    await appendTimelineEvent(
      {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        kind: "ALLERGY_RECORDED",
        source: "USER_ENTERED",
        title: effectiveSubstance,
        occurredAt: new Date(),
        refType: "AllergyRecord",
        refId: row.id,
      },
      tx,
    );

    return row;
  });

  await recordAuditEvent({
    action: "care.record_written",
    entityType: "allergy_record",
    entityId: updated.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      operation: "update",
      fields: suppliedFieldNames(input.data),
    },
  });

  return careOk({ allergyId: updated.id });
}

export async function createImmunization(input: {
  user: AuthenticatedUser;
  data: ImmunizationCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ immunizationId: string }>> {
  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.data.ownerUserId,
    familyMemberId: input.data.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.immunizationRecord.create({
      data: {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        vaccineName: input.data.vaccineName,
        doseLabel: input.data.doseLabel ?? null,
        administeredOn: input.data.administeredOn,
        administeredByLabel: input.data.administeredByLabel ?? null,
        facilityLabel: input.data.facilityLabel ?? null,
        batchNumber: input.data.batchNumber ?? null,
        source: provenanceForSubject(subject.data),
        documentId: input.data.documentId ?? null,
        notes: input.data.notes ?? null,
      },
      select: { id: true, vaccineName: true, administeredOn: true },
    });

    await appendTimelineEvent(
      {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        kind: "VACCINATION",
        source: "USER_ENTERED",
        title: row.vaccineName,
        summary: input.data.doseLabel ?? null,
        occurredAt: row.administeredOn,
        refType: "ImmunizationRecord",
        refId: row.id,
      },
      tx,
    );

    return row;
  });

  await recordAuditEvent({
    action: "care.record_written",
    entityType: "immunization_record",
    entityId: created.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      operation: "create",
      vaccineName: created.vaccineName,
    },
  });

  return careOk({ immunizationId: created.id });
}

export async function updateImmunization(input: {
  user: AuthenticatedUser;
  immunizationId: string;
  data: ImmunizationUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ immunizationId: string }>> {
  const existing = await prisma.immunizationRecord.findUnique({
    where: { id: input.immunizationId },
    select: { id: true, ownerUserId: true, familyMemberId: true, source: true, vaccineName: true, administeredOn: true },
  });
  if (!existing) return careFail("not_found", "That immunisation was not found.");

  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  if (existing.source === "CLINICIAN_RECORDED") {
    return careFail("clinician_source_locked", "This immunisation was recorded by a clinician and cannot be changed here.");
  }

  const effectiveName = input.data.vaccineName ?? existing.vaccineName;
  const effectiveDate = input.data.administeredOn ?? existing.administeredOn;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.immunizationRecord.update({
      where: { id: existing.id },
      data: {
        vaccineName: input.data.vaccineName,
        doseLabel: input.data.doseLabel,
        administeredOn: input.data.administeredOn,
        administeredByLabel: input.data.administeredByLabel,
        facilityLabel: input.data.facilityLabel,
        batchNumber: input.data.batchNumber,
        documentId: input.data.documentId,
        notes: input.data.notes,
      },
      select: { id: true },
    });

    await appendTimelineEvent(
      {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        kind: "VACCINATION",
        source: "USER_ENTERED",
        title: effectiveName,
        occurredAt: effectiveDate,
        refType: "ImmunizationRecord",
        refId: row.id,
      },
      tx,
    );

    return row;
  });

  await recordAuditEvent({
    action: "care.record_written",
    entityType: "immunization_record",
    entityId: updated.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      operation: "update",
      fields: suppliedFieldNames(input.data),
    },
  });

  return careOk({ immunizationId: updated.id });
}

/** A condition lands on the timeline as a diagnosis; anything else is "other". */
function historyTimelineKind(category: MedicalHistoryCategory): HealthTimelineEventKind {
  return category === "CONDITION" ? "DIAGNOSIS_RECORDED" : "OTHER";
}

export async function createMedicalHistoryItem(input: {
  user: AuthenticatedUser;
  data: MedicalHistoryCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ medicalHistoryItemId: string }>> {
  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.data.ownerUserId,
    familyMemberId: input.data.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.medicalHistoryItem.create({
      data: {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        category: input.data.category,
        label: input.data.label,
        details: input.data.details ?? null,
        onsetOn: input.data.onsetOn ?? null,
        resolvedOn: input.data.resolvedOn ?? null,
        source: provenanceForSubject(subject.data),
        recordedById: input.user.id,
      },
      select: { id: true, label: true, onsetOn: true },
    });

    await appendTimelineEvent(
      {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        kind: historyTimelineKind(input.data.category),
        source: "USER_ENTERED",
        title: row.label,
        summary: input.data.details ?? null,
        occurredAt: row.onsetOn ?? new Date(),
        refType: "MedicalHistoryItem",
        refId: row.id,
      },
      tx,
    );

    return row;
  });

  await recordAuditEvent({
    action: "care.record_written",
    entityType: "medical_history_item",
    entityId: created.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      operation: "create",
      category: input.data.category,
    },
  });

  return careOk({ medicalHistoryItemId: created.id });
}

export async function updateMedicalHistoryItem(input: {
  user: AuthenticatedUser;
  medicalHistoryItemId: string;
  data: MedicalHistoryUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ medicalHistoryItemId: string }>> {
  const existing = await prisma.medicalHistoryItem.findUnique({
    where: { id: input.medicalHistoryItemId },
    select: {
      id: true,
      ownerUserId: true,
      familyMemberId: true,
      source: true,
      category: true,
      label: true,
      onsetOn: true,
    },
  });
  if (!existing) return careFail("not_found", "That history item was not found.");

  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  if (existing.source === "CLINICIAN_RECORDED") {
    return careFail(
      "clinician_source_locked",
      "This history item was recorded by a clinician and cannot be changed here.",
    );
  }

  const effectiveCategory = input.data.category ?? existing.category;
  const effectiveLabel = input.data.label ?? existing.label;
  const effectiveOnset = input.data.onsetOn ?? existing.onsetOn;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.medicalHistoryItem.update({
      where: { id: existing.id },
      data: {
        category: input.data.category,
        label: input.data.label,
        details: input.data.details,
        onsetOn: input.data.onsetOn,
        resolvedOn: input.data.resolvedOn,
      },
      select: { id: true },
    });

    await appendTimelineEvent(
      {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        kind: historyTimelineKind(effectiveCategory),
        source: "USER_ENTERED",
        title: effectiveLabel,
        occurredAt: effectiveOnset ?? new Date(),
        refType: "MedicalHistoryItem",
        refId: row.id,
      },
      tx,
    );

    return row;
  });

  await recordAuditEvent({
    action: "care.record_written",
    entityType: "medical_history_item",
    entityId: updated.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      operation: "update",
      fields: suppliedFieldNames(input.data),
    },
  });

  return careOk({ medicalHistoryItemId: updated.id });
}

// ---------------------------------------------------------------------------
// Document vault writes
// ---------------------------------------------------------------------------

/**
 * Filing a document.
 *
 * Requires `UPLOAD_DOCUMENTS` and *not* `VIEW_RECORDS`: a caregiver trusted to
 * archive somebody's paperwork is not thereby trusted to read the paperwork
 * that is already there.
 */
export async function createHealthDocument(input: {
  user: AuthenticatedUser;
  data: HealthDocumentCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ documentId: string }>> {
  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.data.ownerUserId,
    familyMemberId: input.data.familyMemberId,
    scope: "UPLOAD_DOCUMENTS",
  });
  if (!subject.ok) return subject;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.healthDocument.create({
      data: {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        kind: input.data.kind,
        status: "ACTIVE",
        title: input.data.title,
        description: input.data.description ?? null,
        storageKey: input.data.storageKey,
        fileName: input.data.fileName ?? null,
        mimeType: input.data.mimeType,
        sizeBytes: input.data.sizeBytes,
        source: "DOCUMENT_UPLOADED",
        issuedByLabel: input.data.issuedByLabel ?? null,
        issuedOn: input.data.issuedOn ?? null,
        isSensitive: input.data.isSensitive ?? true,
        uploadedById: input.user.id,
      },
      select: { id: true, title: true },
    });

    await appendTimelineEvent(
      {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        kind: "DOCUMENT_ADDED",
        source: "DOCUMENT_UPLOADED",
        title: row.title,
        occurredAt: new Date(),
        refType: "HealthDocument",
        refId: row.id,
        documentId: row.id,
      },
      tx,
    );

    return row;
  });

  await recordAuditEvent({
    action: "care.document_uploaded",
    entityType: "health_document",
    entityId: created.id,
    actorUserId: input.user.id,
    context: input.context,
    // The private object key is never part of an audit row.
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      kind: input.data.kind,
      sizeBytes: input.data.sizeBytes,
    },
  });

  return careOk({ documentId: created.id });
}

/**
 * Editing the metadata of a filed document.
 *
 * Only the labels around the document change here — the bytes and the object key
 * are fixed at upload. A removed row cannot be edited. This is a vault
 * operation, so it needs `UPLOAD_DOCUMENTS`.
 */
export async function updateHealthDocument(input: {
  user: AuthenticatedUser;
  documentId: string;
  data: HealthDocumentUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ documentId: string }>> {
  const existing = await prisma.healthDocument.findUnique({
    where: { id: input.documentId },
    select: { id: true, ownerUserId: true, familyMemberId: true, status: true },
  });
  if (!existing || existing.status === "REMOVED") {
    return careFail("not_found", "That document is not in the vault.");
  }

  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "UPLOAD_DOCUMENTS",
  });
  if (!subject.ok) return subject;

  const updated = await prisma.healthDocument.update({
    where: { id: existing.id },
    data: {
      title: input.data.title,
      description: input.data.description,
      kind: input.data.kind,
      issuedByLabel: input.data.issuedByLabel,
      issuedOn: input.data.issuedOn,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "care.record_written",
    entityType: "health_document",
    entityId: updated.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      operation: "update",
      fields: suppliedFieldNames(input.data),
    },
  });

  return careOk({ documentId: updated.id });
}

/**
 * Taking a document out of the default list without destroying it.
 *
 * The row and its bytes both stay, so an archive can be undone. Already-archived
 * is not an error and is not re-audited, because nothing changed.
 */
export async function archiveHealthDocument(input: {
  user: AuthenticatedUser;
  documentId: string;
  context?: RequestContext;
}): Promise<CareResult<{ documentId: string }>> {
  const existing = await prisma.healthDocument.findUnique({
    where: { id: input.documentId },
    select: { id: true, ownerUserId: true, familyMemberId: true, status: true },
  });
  if (!existing || existing.status === "REMOVED") {
    return careFail("not_found", "That document is not in the vault.");
  }

  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "UPLOAD_DOCUMENTS",
  });
  if (!subject.ok) return subject;

  if (existing.status === "ARCHIVED") return careOk({ documentId: existing.id });

  await prisma.healthDocument.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED" },
  });

  await recordAuditEvent({
    action: "care.document_archived",
    entityType: "health_document",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
    },
  });

  return careOk({ documentId: existing.id });
}

/**
 * Removing a document for good.
 *
 * The row is marked `REMOVED` and stamped with `deletedAt`; the object itself is
 * deleted from private storage by a separate retention job. The row deliberately
 * survives both, because audit rows and timeline events already point at it and
 * a trail that stops resolving the moment a record is deleted is not a trail.
 * Removing is idempotent: a second call changes nothing and writes no second
 * audit row.
 */
export async function removeHealthDocument(input: {
  user: AuthenticatedUser;
  documentId: string;
  context?: RequestContext;
}): Promise<CareResult<{ documentId: string }>> {
  const existing = await prisma.healthDocument.findUnique({
    where: { id: input.documentId },
    select: { id: true, ownerUserId: true, familyMemberId: true, status: true },
  });
  if (!existing) return careFail("not_found", "That document was not found.");

  const subject = await resolveScopedSubject({
    viewerUserId: input.user.id,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "UPLOAD_DOCUMENTS",
  });
  if (!subject.ok) return subject;

  if (existing.status === "REMOVED") return careOk({ documentId: existing.id });

  await prisma.healthDocument.update({
    where: { id: existing.id },
    data: { status: "REMOVED", deletedAt: new Date() },
  });

  await recordAuditEvent({
    action: "care.record_written",
    entityType: "health_document",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      operation: "remove",
      removed: true,
    },
  });

  return careOk({ documentId: existing.id });
}
