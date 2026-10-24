import "server-only";

import type {
  CaregiverScope,
  HealthDeviceConnectionStatus,
  HealthDeviceIntegrationMode,
  HealthDeviceProvider,
  HealthDeviceSyncStatus,
  HealthRecordSource,
  WellnessCategory,
  WellnessGoalCadence,
  WellnessGoalStatus,
  WellnessUnit,
} from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { provenanceForSubject, requireScope, resolveCareSubject, type CareSubject } from "@/lib/care/access";
import { requireConsent } from "@/lib/care/consent";
import { careFail, careOk, type CareResult } from "@/lib/care/errors";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import type { DeviceImportInput, WellnessEntryCreateInput, WellnessGoalCreateInput } from "@/lib/validation/care";

/**
 * Wellness observations, goals and health device connections.
 *
 * ## What a reading is, and what it is not
 *
 * A `WellnessEntry` is a person's own observation: a value and a unit, with the
 * source saying who wrote it down. There is deliberately no derived score and no
 * per-person index anywhere in this file. `wellnessCategorySummary` returns raw
 * values, counts and the ordered readings and refuses to average or grade them,
 * because a single "wellness index" reads as a clinical finding about a person
 * and ORVEXA is not in a position to make one. Two readings a week apart are two
 * facts, not a trend verdict.
 *
 * ## The first safety rule: provenance is not interchangeable
 *
 * A device reading and a clinician's confirmed reading are not the same claim, so
 * they are stored differently and cannot be promoted into one another. A person
 * cannot edit a row they did not enter, and a device value is never shown as
 * verified. `verifyWellnessEntry` is the only path that can mark a reading
 * verified, only a clinician may call it, and it sets `verifiedById` and
 * `verifiedAt` together — never one without the other.
 *
 * ## The second safety rule: a connection is not a credential
 *
 * A device connection names a provider and a label and nothing more. There is no
 * field for a token or a refresh secret and none will be added, because ORVEXA
 * stores nothing that could be used to act as the person somewhere else.
 * `importDeviceMeasurements` is the one path in this module that *throws*: it
 * cannot proceed without `HEALTH_DEVICE_DATA_IMPORT` consent, so the
 * `ConsentRequiredFailure` propagates rather than being turned into a result.
 * That is deliberate — a request that reaches an import without consent was
 * illegitimate before it arrived, exactly like a caregiver acting outside their
 * scopes, which is why neither is a `CareResult`.
 */

export type WellnessEntrySummary = {
  id: string;
  ownerUserId: string;
  familyMemberId: string | null;
  category: WellnessCategory;
  unit: WellnessUnit;
  valueNumeric: number | null;
  valueText: string | null;
  recordedAt: Date;
  source: HealthRecordSource;
  deviceConnectionId: string | null;
  deviceSyncRecordId: string | null;
  verifiedById: string | null;
  verifiedAt: Date | null;
  notes: string | null;
  createdAt: Date;
};

export type WellnessGoalSummary = {
  id: string;
  ownerUserId: string;
  familyMemberId: string | null;
  category: WellnessCategory;
  unit: WellnessUnit;
  targetValue: number;
  cadence: WellnessGoalCadence;
  title: string;
  status: WellnessGoalStatus;
  startOn: Date;
  endOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DeviceConnectionSummary = {
  id: string;
  provider: HealthDeviceProvider;
  integrationMode: HealthDeviceIntegrationMode;
  status: HealthDeviceConnectionStatus;
  externalAccountLabel: string | null;
  scopes: string[];
  lastError: string | null;
  lastSyncedAt: Date | null;
  connectedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WellnessCategorySummaryRow = {
  category: WellnessCategory;
  count: number;
  latest: {
    valueNumeric: number | null;
    valueText: string | null;
    unit: WellnessUnit;
    source: HealthRecordSource;
    recordedAt: Date;
  } | null;
  /** The most recent readings, raw and in order. Never an average. */
  series: {
    recordedAt: Date;
    valueNumeric: number | null;
    valueText: string | null;
    unit: WellnessUnit;
    source: HealthRecordSource;
  }[];
};

/** How many raw readings the summary carries per category before it stops. */
const SERIES_LIMIT = 30;

/** The default and maximum number of entries one list call will return. */
const ENTRY_LIST_DEFAULT_LIMIT = 100;
const ENTRY_LIST_MAX_LIMIT = 200;

function decimalToNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/**
 * Resolves whose record the operation is about and checks the caregiver scope,
 * returning the failure rather than throwing it.
 *
 * A caregiver who may not read a record may not read its wellness history
 * either, which is why the list paths take `VIEW_RECORDS` rather than a wellness
 * scope: the sensitive scope gates the read.
 */
async function scopedSubject(input: {
  user: AuthenticatedUser;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
  scope: CaregiverScope;
}): Promise<CareResult<CareSubject>> {
  const subject = await resolveCareSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
  });
  if (!subject.ok) return subject;
  return requireScope(subject.data, input.scope);
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function listWellnessEntries(input: {
  user: AuthenticatedUser;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
  category?: WellnessCategory | null;
  from?: Date | null;
  to?: Date | null;
  limit?: number;
}): Promise<CareResult<WellnessEntrySummary[]>> {
  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const limit = Math.min(Math.max(input.limit ?? ENTRY_LIST_DEFAULT_LIMIT, 1), ENTRY_LIST_MAX_LIMIT);

  const rows = await prisma.wellnessEntry.findMany({
    where: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      ...(input.category ? { category: input.category } : {}),
      ...(input.from || input.to
        ? { recordedAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
        : {}),
    },
    orderBy: { recordedAt: "desc" },
    take: limit,
    select: {
      id: true,
      ownerUserId: true,
      familyMemberId: true,
      category: true,
      unit: true,
      valueNumeric: true,
      valueText: true,
      recordedAt: true,
      source: true,
      deviceConnectionId: true,
      deviceSyncRecordId: true,
      verifiedById: true,
      verifiedAt: true,
      notes: true,
      createdAt: true,
    },
  });

  return careOk(rows.map((row) => ({ ...row, valueNumeric: decimalToNumber(row.valueNumeric) })));
}

export async function createWellnessEntry(input: {
  user: AuthenticatedUser;
  data: WellnessEntryCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ entryId: string }>> {
  if (
    input.data.unit === "SELF_REPORT_SCALE" &&
    input.data.valueNumeric !== undefined &&
    (input.data.valueNumeric > 10 || input.data.valueNumeric < 0)
  ) {
    return careFail("validation", "A self-reported scale runs from 0 to 10.");
  }

  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: input.data.ownerUserId,
    familyMemberId: input.data.familyMemberId,
    scope: "MANAGE_WELLNESS",
  });
  if (!subject.ok) return subject;

  const entry = await prisma.wellnessEntry.create({
    data: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      category: input.data.category,
      unit: input.data.unit,
      valueNumeric: input.data.valueNumeric ?? null,
      valueText: input.data.valueText ?? null,
      recordedAt: input.data.recordedAt,
      // Who wrote this down is set here, never taken from the request.
      source: provenanceForSubject(subject.data),
      notes: input.data.notes ?? null,
      createdById: input.user.id,
    },
    select: { id: true, source: true },
  });

  await recordAuditEvent({
    action: "care.wellness_entry_recorded",
    entityType: "wellness_entry",
    entityId: entry.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      category: input.data.category,
      unit: input.data.unit,
      source: entry.source,
    },
  });

  return careOk({ entryId: entry.id });
}

export type WellnessEntryUpdateInput = {
  valueNumeric?: number;
  valueText?: string;
  notes?: string;
};

/**
 * Edits a reading the person entered themselves.
 *
 * A row that a device imported or a clinician recorded is not the person's to
 * change here. A device reading is corrected by re-importing or by adding a new
 * observation, and a clinician's reading is corrected by that clinician — so the
 * edit is refused and the row is left alone rather than silently rewritten.
 */
export async function updateWellnessEntry(input: {
  user: AuthenticatedUser;
  entryId: string;
  data: WellnessEntryUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ entryId: string }>> {
  const existing = await prisma.wellnessEntry.findUnique({
    where: { id: input.entryId },
    select: { id: true, ownerUserId: true, familyMemberId: true, source: true },
  });
  if (!existing) return careFail("not_found", "That wellness entry was not found.");

  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "MANAGE_WELLNESS",
  });
  if (!subject.ok) return subject;

  if (existing.source !== "USER_ENTERED") {
    return careFail("provenance_mismatch", "This reading came from a device or a clinician and cannot be edited here.");
  }

  await prisma.wellnessEntry.update({
    where: { id: existing.id },
    data: {
      valueNumeric: input.data.valueNumeric,
      valueText: input.data.valueText,
      notes: input.data.notes,
    },
  });

  await recordAuditEvent({
    action: "care.wellness_entry_updated",
    entityType: "wellness_entry",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: existing.ownerUserId,
      fields: Object.entries(input.data)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key),
    },
  });

  return careOk({ entryId: existing.id });
}

/**
 * A clinician confirming that a reading says what it says.
 *
 * This is the only path that can make a reading read as verified, and it is
 * restricted to a clinician. A device value is never promoted on its own: a
 * wristband measurement that nobody has looked at stays a device measurement,
 * and only this call sets both `verifiedById` and `verifiedAt` — together, never
 * one without the other, so a row can never claim verification without naming
 * who verified it or when.
 */
export async function verifyWellnessEntry(input: {
  user: AuthenticatedUser;
  entryId: string;
  context?: RequestContext;
}): Promise<CareResult<{ entryId: string; verifiedAt: Date }>> {
  if (!input.user.roles.includes("DOCTOR")) {
    return careFail("not_clinician_verifiable", "Only a clinician can confirm a reading.");
  }

  const existing = await prisma.wellnessEntry.findUnique({
    where: { id: input.entryId },
    select: { id: true, ownerUserId: true },
  });
  if (!existing) return careFail("not_found", "That wellness entry was not found.");

  const verifiedAt = new Date();
  await prisma.wellnessEntry.update({
    where: { id: existing.id },
    data: { verifiedById: input.user.id, verifiedAt },
  });

  await recordAuditEvent({
    action: "care.record_verified_by_clinician",
    entityType: "wellness_entry",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { ownerUserId: existing.ownerUserId },
  });

  return careOk({ entryId: existing.id, verifiedAt });
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export async function listWellnessGoals(input: {
  user: AuthenticatedUser;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
  status?: WellnessGoalStatus | null;
}): Promise<CareResult<WellnessGoalSummary[]>> {
  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const rows = await prisma.wellnessGoal.findMany({
    where: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: [{ status: "asc" }, { startOn: "desc" }],
    select: {
      id: true,
      ownerUserId: true,
      familyMemberId: true,
      category: true,
      unit: true,
      targetValue: true,
      cadence: true,
      title: true,
      status: true,
      startOn: true,
      endOn: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return careOk(rows.map((row) => ({ ...row, targetValue: Number(row.targetValue) })));
}

export async function createWellnessGoal(input: {
  user: AuthenticatedUser;
  data: WellnessGoalCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ goalId: string }>> {
  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: input.data.ownerUserId,
    familyMemberId: input.data.familyMemberId,
    scope: "MANAGE_WELLNESS",
  });
  if (!subject.ok) return subject;

  const goal = await prisma.wellnessGoal.create({
    data: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      category: input.data.category,
      unit: input.data.unit,
      targetValue: input.data.targetValue,
      cadence: input.data.cadence,
      title: input.data.title,
      status: "ACTIVE",
      startOn: input.data.startOn,
      endOn: input.data.endOn ?? null,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "care.wellness_goal_created",
    entityType: "wellness_goal",
    entityId: goal.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      category: input.data.category,
      cadence: input.data.cadence,
    },
  });

  return careOk({ goalId: goal.id });
}

export type WellnessGoalUpdateInput = {
  targetValue?: number;
  cadence?: WellnessGoalCadence;
  title?: string;
  status?: WellnessGoalStatus;
  endOn?: Date;
};

export async function updateWellnessGoal(input: {
  user: AuthenticatedUser;
  goalId: string;
  data: WellnessGoalUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ goalId: string }>> {
  const existing = await prisma.wellnessGoal.findUnique({
    where: { id: input.goalId },
    select: { id: true, ownerUserId: true, familyMemberId: true, status: true },
  });
  if (!existing) return careFail("not_found", "That wellness goal was not found.");

  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "MANAGE_WELLNESS",
  });
  if (!subject.ok) return subject;

  const status = input.data.status ?? existing.status;
  await prisma.wellnessGoal.update({
    where: { id: existing.id },
    data: {
      targetValue: input.data.targetValue,
      cadence: input.data.cadence,
      title: input.data.title,
      status: input.data.status,
      endOn: input.data.endOn,
    },
  });

  // The goal family has one write action besides its creation, and a change to a
  // goal is recorded against it so the trail stays on the goal's own vocabulary.
  await recordAuditEvent({
    action: "care.wellness_goal_status_changed",
    entityType: "wellness_goal",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: existing.ownerUserId,
      previousStatus: existing.status,
      status,
      fields: Object.entries(input.data)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key),
    },
  });

  return careOk({ goalId: existing.id });
}

export async function changeWellnessGoalStatus(input: {
  user: AuthenticatedUser;
  goalId: string;
  status: WellnessGoalStatus;
  context?: RequestContext;
}): Promise<CareResult<{ goalId: string; status: WellnessGoalStatus }>> {
  const existing = await prisma.wellnessGoal.findUnique({
    where: { id: input.goalId },
    select: { id: true, ownerUserId: true, familyMemberId: true, status: true },
  });
  if (!existing) return careFail("not_found", "That wellness goal was not found.");

  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "MANAGE_WELLNESS",
  });
  if (!subject.ok) return subject;

  await prisma.wellnessGoal.update({ where: { id: existing.id }, data: { status: input.status } });

  await recordAuditEvent({
    action: "care.wellness_goal_status_changed",
    entityType: "wellness_goal",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: existing.ownerUserId,
      previousStatus: existing.status,
      status: input.status,
    },
  });

  return careOk({ goalId: existing.id, status: input.status });
}

// ---------------------------------------------------------------------------
// Category summary
// ---------------------------------------------------------------------------

/**
 * What was recorded in each category over a window, as raw readings.
 *
 * No average, no trend verdict and no composite "wellness index" — ORVEXA does
 * not score a person's health. The caller renders the values, the unit and the
 * source exactly as they were stored, so a reading is never presented as more
 * than the observation it is.
 */
export async function wellnessCategorySummary(input: {
  user: AuthenticatedUser;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
  from: Date;
  to: Date;
}): Promise<CareResult<WellnessCategorySummaryRow[]>> {
  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
    scope: "VIEW_RECORDS",
  });
  if (!subject.ok) return subject;

  const rows = await prisma.wellnessEntry.findMany({
    where: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      recordedAt: { gte: input.from, lte: input.to },
    },
    orderBy: { recordedAt: "desc" },
    select: {
      category: true,
      unit: true,
      valueNumeric: true,
      valueText: true,
      recordedAt: true,
      source: true,
    },
  });

  const byCategory = new Map<WellnessCategory, WellnessCategorySummaryRow>();
  for (const row of rows) {
    const value = {
      recordedAt: row.recordedAt,
      valueNumeric: decimalToNumber(row.valueNumeric),
      valueText: row.valueText,
      unit: row.unit,
      source: row.source,
    };

    const summary = byCategory.get(row.category);
    if (!summary) {
      byCategory.set(row.category, { category: row.category, count: 1, latest: value, series: [value] });
      continue;
    }
    summary.count += 1;
    if (summary.series.length < SERIES_LIMIT) summary.series.push(value);
  }

  return careOk([...byCategory.values()]);
}

// ---------------------------------------------------------------------------
// Device connections
// ---------------------------------------------------------------------------

/**
 * The device connections on this account.
 *
 * Own record only: a device belongs to the account that authorised it, never to
 * a dependent, so a caregiver can never reach another person's connections.
 */
export async function listDeviceConnections(input: {
  user: AuthenticatedUser;
}): Promise<CareResult<DeviceConnectionSummary[]>> {
  const rows = await prisma.healthDeviceConnection.findMany({
    where: { ownerUserId: input.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      integrationMode: true,
      status: true,
      externalAccountLabel: true,
      scopes: true,
      lastError: true,
      lastSyncedAt: true,
      connectedAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return careOk(rows);
}

/**
 * Starts a connection to a provider.
 *
 * `integrationMode` is derived, never accepted: a manual upload is a file import
 * and every other provider is honestly `NOT_CONFIGURED` until a real connector
 * is deployed. The row therefore cannot claim a working connection the platform
 * does not have. The status is `PENDING` in all cases — nothing here is
 * connected without a credential, and there is nowhere to put one.
 */
export async function createDeviceConnection(input: {
  user: AuthenticatedUser;
  data: { provider: HealthDeviceProvider; externalAccountLabel?: string; scopes: string[] };
  context?: RequestContext;
}): Promise<CareResult<{ connectionId: string; status: HealthDeviceConnectionStatus }>> {
  const integrationMode: HealthDeviceIntegrationMode =
    input.data.provider === "MANUAL_UPLOAD" ? "FILE_IMPORT" : "NOT_CONFIGURED";

  const existing = await prisma.healthDeviceConnection.findUnique({
    where: { ownerUserId_provider: { ownerUserId: input.user.id, provider: input.data.provider } },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== "REVOKED") {
    return careFail("duplicate", "You already have a connection for that provider. Disconnect it first to start again.");
  }

  const row = existing
    ? await prisma.healthDeviceConnection.update({
        where: { id: existing.id },
        data: {
          integrationMode,
          status: "PENDING",
          externalAccountLabel: input.data.externalAccountLabel ?? null,
          scopes: input.data.scopes,
          lastError: null,
          revokedAt: null,
        },
        select: { id: true, status: true },
      })
    : await prisma.healthDeviceConnection.create({
        data: {
          ownerUserId: input.user.id,
          provider: input.data.provider,
          integrationMode,
          status: "PENDING",
          externalAccountLabel: input.data.externalAccountLabel ?? null,
          scopes: input.data.scopes,
        },
        select: { id: true, status: true },
      });

  await recordAuditEvent({
    action: "care.device_connection_created",
    entityType: "health_device_connection",
    entityId: row.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { provider: input.data.provider, integrationMode, reconnected: Boolean(existing) },
  });

  return careOk({ connectionId: row.id, status: row.status });
}

/** Disconnects a source. The row is kept so the history of what was imported survives. */
export async function revokeDeviceConnection(input: {
  user: AuthenticatedUser;
  connectionId: string;
  context?: RequestContext;
}): Promise<CareResult<{ connectionId: string }>> {
  const existing = await prisma.healthDeviceConnection.findFirst({
    where: { id: input.connectionId, ownerUserId: input.user.id },
    select: { id: true, status: true },
  });
  if (!existing) return careFail("device_connection_not_found", "That device connection was not found.");
  if (existing.status === "REVOKED") return careOk({ connectionId: existing.id });

  await prisma.healthDeviceConnection.update({
    where: { id: existing.id },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  await recordAuditEvent({
    action: "care.device_connection_revoked",
    entityType: "health_device_connection",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { previousStatus: existing.status },
  });

  return careOk({ connectionId: existing.id });
}

export type DeviceImportResult = {
  syncRecordId: string;
  status: HealthDeviceSyncStatus;
  measurementsImported: number;
  measurementsSkipped: number;
};

/**
 * Writes an already-parsed device export onto the record.
 *
 * The consent is checked first and is not optional: without
 * `HEALTH_DEVICE_DATA_IMPORT` the `ConsentRequiredFailure` is allowed to
 * propagate, because a request that reaches an import without consent should
 * never have got this far. Every measurement is stamped `DEVICE_IMPORTED` and
 * linked to the sync row that brought it in, so an imported value is always
 * traceable and never mistaken for something a clinician recorded.
 *
 * A measurement that repeats an entry already on file for the same owner,
 * category and time is skipped rather than duplicated, which is what makes
 * re-importing an overlapping export safe.
 */
export async function importDeviceMeasurements(input: {
  user: AuthenticatedUser;
  data: DeviceImportInput;
  context?: RequestContext;
}): Promise<CareResult<DeviceImportResult>> {
  await requireConsent({
    userId: input.user.id,
    consentType: "HEALTH_DEVICE_DATA_IMPORT",
    message:
      "Importing measurements from a device needs your permission to bring health data from your devices into ORVEXA.",
  });

  const measurements = input.data.measurements;
  if (measurements.length === 0) {
    return careFail("device_import_empty", "That file contained no measurements.");
  }

  const connection = await prisma.healthDeviceConnection.findFirst({
    where: { id: input.data.connectionId, ownerUserId: input.user.id },
    select: { id: true, status: true },
  });
  if (!connection || connection.status === "REVOKED") {
    return careFail("device_connection_not_found", "That device connection is not available. Reconnect the device and try again.");
  }

  const categories = [...new Set(measurements.map((measurement) => measurement.category))];

  const sync = await prisma.healthDeviceSyncRecord.create({
    data: {
      connectionId: connection.id,
      status: "STARTED",
      windowStart: input.data.windowStart ?? null,
      windowEnd: input.data.windowEnd ?? null,
      categories,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "care.device_import_started",
    entityType: "health_device_sync_record",
    entityId: sync.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { connectionId: connection.id, measurementCount: measurements.length, categories },
  });

  // One read of what is already on file, keyed the way a duplicate is defined:
  // same owner, same category, same recorded time.
  const alreadyPresent = await prisma.wellnessEntry.findMany({
    where: {
      ownerUserId: input.user.id,
      category: { in: categories },
      recordedAt: { in: measurements.map((measurement) => measurement.recordedAt) },
    },
    select: { category: true, recordedAt: true },
  });
  const seen = new Set(alreadyPresent.map((row) => `${row.category}|${row.recordedAt.getTime()}`));

  let imported = 0;
  let skipped = 0;

  for (const measurement of measurements) {
    const key = `${measurement.category}|${measurement.recordedAt.getTime()}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }

    await prisma.wellnessEntry.create({
      data: {
        ownerUserId: input.user.id,
        familyMemberId: null,
        category: measurement.category,
        unit: measurement.unit,
        valueNumeric: measurement.valueNumeric ?? null,
        valueText: measurement.valueText ?? null,
        recordedAt: measurement.recordedAt,
        source: "DEVICE_IMPORTED",
        deviceConnectionId: connection.id,
        deviceSyncRecordId: sync.id,
        createdById: input.user.id,
      },
      select: { id: true },
    });

    seen.add(key);
    imported += 1;
  }

  const times = measurements.map((measurement) => measurement.recordedAt.getTime());
  const status: HealthDeviceSyncStatus = imported === 0 ? "FAILED" : skipped === 0 ? "SUCCEEDED" : "PARTIAL";

  await prisma.healthDeviceSyncRecord.update({
    where: { id: sync.id },
    data: {
      status,
      measurementsImported: imported,
      measurementsSkipped: skipped,
      windowStart: input.data.windowStart ?? new Date(Math.min(...times)),
      windowEnd: input.data.windowEnd ?? new Date(Math.max(...times)),
      categories,
      finishedAt: new Date(),
      errorCode: status === "FAILED" ? "no_measurements_imported" : null,
      errorMessage:
        status === "FAILED" ? "Every measurement in the file had already been recorded." : null,
    },
  });

  await recordAuditEvent({
    action: status === "FAILED" ? "care.device_import_failed" : "care.device_import_completed",
    entityType: "health_device_sync_record",
    entityId: sync.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      connectionId: connection.id,
      status,
      measurementsImported: imported,
      measurementsSkipped: skipped,
      categories,
    },
  });

  return careOk({ syncRecordId: sync.id, status, measurementsImported: imported, measurementsSkipped: skipped });
}
