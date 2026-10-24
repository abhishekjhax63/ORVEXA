import "server-only";

import type { CaregiverScope, HealthRecordSource, MedicationDoseStatus, MedicationScheduleStatus } from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { provenanceForSubject, requireScope, resolveCareSubject, type CareSubject } from "@/lib/care/access";
import { careFail, careOk, type CareResult } from "@/lib/care/errors";
import { parseLocalMinuteOfDay, zonedDayKey } from "@/lib/care/scheduling";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import type { MedicationDoseLogInput, MedicationScheduleCreateInput } from "@/lib/validation/care";

/**
 * Medicine schedules and the doses logged against them.
 *
 * ## Two records, two owners
 *
 * A `MedicationSchedule` is a claim about what somebody is *supposed* to take;
 * a `MedicationDoseLog` is a claim about what actually happened. They are kept
 * apart because they are answered by different people and carry different
 * weight: the schedule may be the prescriber's, while the log is almost always
 * the person's own record of their day. Nothing here ever infers one from the
 * other.
 *
 * ## The safety rule this file exists to hold
 *
 * A schedule whose `source` is `CLINICIAN_RECORDED` belongs to the prescriber,
 * and this module will not let the person or a caregiver rewrite it. Changing a
 * prescribed dose, frequency or time is a clinical decision, so
 * `updateMedicationSchedule` refuses and *records the refusal*
 * (`care.medication_schedule_edit_denied`) rather than merely blocking it — a
 * denied attempt to rewrite a prescription is exactly the kind of event that
 * should be provable afterwards.
 *
 * Stopping is deliberately the exception. `stopMedicationSchedule` works even
 * on a clinician's schedule, because "I have stopped taking this" is a fact
 * about the person and not a change to the prescription: it sets only the status
 * and the reason and touches nothing about the dose.
 *
 * ## Adherence is counted, never scored
 *
 * `adherenceSummary` returns raw counts. It computes no percentage and no single
 * adherence number, because such a figure reads as an assessment of the person,
 * and because a skipped dose and a missed dose are different events — a
 * deliberate decision and an omission — that one number would merge. The caller
 * renders the counts and does not grade the person.
 */

export type MedicationScheduleSummary = {
  id: string;
  ownerUserId: string;
  familyMemberId: string | null;
  medicineName: string;
  strengthLabel: string | null;
  dosageForm: string | null;
  doseLabel: string;
  frequencyLabel: string;
  /** Local times of day, as minutes past midnight. */
  localTimesOfDay: number[];
  timezone: string;
  startOn: Date;
  endOn: Date | null;
  instructions: string | null;
  prescriberLabel: string | null;
  source: HealthRecordSource;
  status: MedicationScheduleStatus;
  stoppedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MedicationDoseLogSummary = {
  id: string;
  scheduleId: string;
  scheduledFor: Date;
  status: MedicationDoseStatus;
  takenAt: Date | null;
  actualDoseLabel: string | null;
  recordedById: string | null;
  source: HealthRecordSource;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const SCHEDULE_SELECT = {
  id: true,
  ownerUserId: true,
  familyMemberId: true,
  medicineName: true,
  strengthLabel: true,
  dosageForm: true,
  doseLabel: true,
  frequencyLabel: true,
  localTimesOfDay: true,
  timezone: true,
  startOn: true,
  endOn: true,
  instructions: true,
  prescriberLabel: true,
  source: true,
  status: true,
  stoppedReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DOSE_LOG_SELECT = {
  id: true,
  scheduleId: true,
  scheduledFor: true,
  status: true,
  takenAt: true,
  actualDoseLabel: true,
  recordedById: true,
  source: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Resolves whose record the operation is about and checks the caregiver scope,
 * returning the failure rather than throwing it.
 *
 * Every entry point goes through here before it reads or writes a row, so a
 * caregiver who has not been granted `MANAGE_MEDICATIONS` is refused on each
 * call rather than only once at the door.
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

/** Parses `"09:30"` strings into minutes past midnight, or null if any is invalid. */
function parseTimesOfDay(values: readonly string[]): number[] | null {
  if (values.length === 0) return null;
  const parsed = values.map(parseLocalMinuteOfDay);
  if (parsed.some((value) => value === null)) return null;
  return parsed as number[];
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/** The medicine list for one record, active schedules first. */
export async function listMedicationSchedules(input: {
  user: AuthenticatedUser;
  ownerUserId?: string | null;
  familyMemberId?: string | null;
  includeInactive?: boolean;
}): Promise<CareResult<MedicationScheduleSummary[]>> {
  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: input.ownerUserId,
    familyMemberId: input.familyMemberId,
    scope: "MANAGE_MEDICATIONS",
  });
  if (!subject.ok) return subject;

  const rows = await prisma.medicationSchedule.findMany({
    where: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      ...(input.includeInactive ? {} : { status: "ACTIVE" as MedicationScheduleStatus }),
    },
    // The enum's declaration order puts ACTIVE first, so this is "taking" before
    // "stopped" without a second sort key.
    orderBy: [{ status: "asc" }, { startOn: "desc" }],
    select: SCHEDULE_SELECT,
  });

  return careOk(rows);
}

export async function createMedicationSchedule(input: {
  user: AuthenticatedUser;
  data: MedicationScheduleCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ scheduleId: string }>> {
  const localTimesOfDay = parseTimesOfDay(input.data.localTimes);
  if (input.data.localTimes.length === 0) {
    return careFail("invalid_schedule", "Add at least one time of day.");
  }
  if (localTimesOfDay === null) {
    return careFail("invalid_schedule", "Use a 24-hour time, for example 09:30.");
  }

  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: input.data.ownerUserId,
    familyMemberId: input.data.familyMemberId,
    scope: "MANAGE_MEDICATIONS",
  });
  if (!subject.ok) return subject;

  const schedule = await prisma.medicationSchedule.create({
    data: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      medicineName: input.data.medicineName,
      strengthLabel: input.data.strengthLabel ?? null,
      dosageForm: input.data.dosageForm ?? null,
      doseLabel: input.data.doseLabel,
      frequencyLabel: input.data.frequencyLabel,
      localTimesOfDay,
      timezone: input.data.timezone ?? "Asia/Kolkata",
      startOn: input.data.startOn,
      endOn: input.data.endOn ?? null,
      instructions: input.data.instructions ?? null,
      prescriberLabel: input.data.prescriberLabel ?? null,
      // Who established this schedule is decided here, never by the caller.
      source: provenanceForSubject(subject.data),
      status: "ACTIVE",
      createdById: input.user.id,
    },
    select: { id: true, source: true },
  });

  await recordAuditEvent({
    action: "care.medication_schedule_created",
    entityType: "medication_schedule",
    entityId: schedule.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      medicineName: input.data.medicineName,
      source: schedule.source,
      times: localTimesOfDay.length,
    },
  });

  return careOk({ scheduleId: schedule.id });
}

export type MedicationScheduleUpdateInput = Partial<MedicationScheduleCreateInput> & {
  status?: "ACTIVE" | "PAUSED" | "COMPLETED";
};

/**
 * Edits a schedule the person owns, unless a clinician recorded it.
 *
 * A `CLINICIAN_RECORDED` row is the prescriber's: changing the dose, the
 * frequency or the times is a clinical decision the app will not make on the
 * person's behalf. The refusal is audited before it is returned, so an attempt
 * to rewrite a prescription leaves a trace even though nothing changed.
 */
export async function updateMedicationSchedule(input: {
  user: AuthenticatedUser;
  scheduleId: string;
  data: MedicationScheduleUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ scheduleId: string }>> {
  const existing = await prisma.medicationSchedule.findUnique({
    where: { id: input.scheduleId },
    select: { id: true, ownerUserId: true, familyMemberId: true, source: true },
  });
  if (!existing) return careFail("not_found", "That medicine schedule was not found.");

  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "MANAGE_MEDICATIONS",
  });
  if (!subject.ok) return subject;

  if (existing.source === "CLINICIAN_RECORDED") {
    await recordAuditEvent({
      action: "care.medication_schedule_edit_denied",
      entityType: "medication_schedule",
      entityId: existing.id,
      outcome: "DENIED",
      actorUserId: input.user.id,
      context: input.context,
      metadata: { reason: "clinician_source_locked", ownerUserId: existing.ownerUserId },
    });
    return careFail(
      "clinician_source_locked",
      "This schedule was recorded by a clinician. Changing or stopping it is a clinical decision — talk to your prescriber.",
    );
  }

  let localTimesOfDay: number[] | undefined;
  if (input.data.localTimes !== undefined) {
    if (input.data.localTimes.length === 0) {
      return careFail("invalid_schedule", "Add at least one time of day.");
    }
    const parsed = parseTimesOfDay(input.data.localTimes);
    if (parsed === null) {
      return careFail("invalid_schedule", "Use a 24-hour time, for example 09:30.");
    }
    localTimesOfDay = parsed;
  }

  await prisma.medicationSchedule.update({
    where: { id: existing.id },
    data: {
      medicineName: input.data.medicineName,
      strengthLabel: input.data.strengthLabel,
      dosageForm: input.data.dosageForm,
      doseLabel: input.data.doseLabel,
      frequencyLabel: input.data.frequencyLabel,
      localTimesOfDay,
      timezone: input.data.timezone,
      startOn: input.data.startOn,
      endOn: input.data.endOn,
      instructions: input.data.instructions,
      prescriberLabel: input.data.prescriberLabel,
      status: input.data.status,
    },
  });

  await recordAuditEvent({
    action: "care.medication_schedule_updated",
    entityType: "medication_schedule",
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

  return careOk({ scheduleId: existing.id });
}

/**
 * Records that the person has stopped taking a medicine.
 *
 * This is allowed *even when the schedule is `CLINICIAN_RECORDED`*, and that is
 * the whole point of the function existing separately from
 * `updateMedicationSchedule`: recording that somebody has stopped taking a
 * medicine is a statement about what the person is doing, not a rewrite of what
 * the prescriber wrote. So it sets the status to `STOPPED` and the
 * `stoppedReason` and changes nothing else — not the dose, not the frequency,
 * not the times. The prescription stands; the fact that it is no longer being
 * followed is recorded beside it.
 */
export async function stopMedicationSchedule(input: {
  user: AuthenticatedUser;
  scheduleId: string;
  reason?: string | null;
  context?: RequestContext;
}): Promise<CareResult<{ scheduleId: string }>> {
  const existing = await prisma.medicationSchedule.findUnique({
    where: { id: input.scheduleId },
    select: { id: true, ownerUserId: true, familyMemberId: true, source: true },
  });
  if (!existing) return careFail("not_found", "That medicine schedule was not found.");

  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: existing.ownerUserId,
    familyMemberId: existing.familyMemberId,
    scope: "MANAGE_MEDICATIONS",
  });
  if (!subject.ok) return subject;

  await prisma.medicationSchedule.update({
    where: { id: existing.id },
    data: { status: "STOPPED", stoppedReason: input.reason ?? null },
  });

  await recordAuditEvent({
    action: "care.medication_schedule_stopped",
    entityType: "medication_schedule",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      ownerUserId: existing.ownerUserId,
      source: existing.source,
      clinicianAuthored: existing.source === "CLINICIAN_RECORDED",
      reason: input.reason ?? null,
    },
  });

  return careOk({ scheduleId: existing.id });
}

// ---------------------------------------------------------------------------
// Doses
// ---------------------------------------------------------------------------

/**
 * Records what happened to one dose.
 *
 * The `(scheduleId, scheduledFor)` unique index is what makes this idempotent:
 * a double tap on "taken" updates the same row instead of logging twice, which
 * is also what keeps the adherence counts from being inflated by repeated taps.
 *
 * A client may only ever claim `TAKEN`, `TAKEN_LATE` or `SKIPPED` — the three
 * things a person can truthfully report about their own dose. `SCHEDULED` and
 * `MISSED` describe the platform's own view of an untouched dose and are not a
 * client's to assert, so they are rejected.
 */
export async function logDose(input: {
  user: AuthenticatedUser;
  scheduleId: string;
  data: MedicationDoseLogInput;
  context?: RequestContext;
}): Promise<CareResult<{ doseLogId: string; status: MedicationDoseStatus }>> {
  if (input.data.status !== "TAKEN" && input.data.status !== "TAKEN_LATE" && input.data.status !== "SKIPPED") {
    return careFail("validation", "Log a dose as taken, taken late or skipped.");
  }

  const schedule = await prisma.medicationSchedule.findUnique({
    where: { id: input.scheduleId },
    select: { id: true, ownerUserId: true, familyMemberId: true },
  });
  if (!schedule) return careFail("not_found", "That medicine schedule was not found.");

  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: schedule.ownerUserId,
    familyMemberId: schedule.familyMemberId,
    scope: "MANAGE_MEDICATIONS",
  });
  if (!subject.ok) return subject;

  const takenStatus = input.data.status === "TAKEN" || input.data.status === "TAKEN_LATE";
  const takenAt = takenStatus ? (input.data.takenAt ?? new Date()) : null;

  const row = await prisma.medicationDoseLog.upsert({
    where: { scheduleId_scheduledFor: { scheduleId: schedule.id, scheduledFor: input.data.scheduledFor } },
    create: {
      scheduleId: schedule.id,
      scheduledFor: input.data.scheduledFor,
      status: input.data.status,
      takenAt,
      actualDoseLabel: input.data.actualDoseLabel ?? null,
      recordedById: input.user.id,
      source: "USER_ENTERED",
      notes: input.data.notes ?? null,
    },
    update: {
      status: input.data.status,
      takenAt,
      actualDoseLabel: input.data.actualDoseLabel ?? null,
      recordedById: input.user.id,
      source: "USER_ENTERED",
      notes: input.data.notes ?? null,
    },
    select: { id: true, status: true },
  });

  await recordAuditEvent({
    action: "care.medication_dose_logged",
    entityType: "medication_dose_log",
    entityId: row.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      scheduleId: schedule.id,
      ownerUserId: schedule.ownerUserId,
      status: row.status,
      scheduledFor: input.data.scheduledFor.toISOString(),
    },
  });

  return careOk({ doseLogId: row.id, status: row.status });
}

export async function listDoseLogs(input: {
  user: AuthenticatedUser;
  scheduleId: string;
  from?: Date | null;
  to?: Date | null;
}): Promise<CareResult<MedicationDoseLogSummary[]>> {
  const schedule = await prisma.medicationSchedule.findUnique({
    where: { id: input.scheduleId },
    select: { id: true, ownerUserId: true, familyMemberId: true },
  });
  if (!schedule) return careFail("not_found", "That medicine schedule was not found.");

  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: schedule.ownerUserId,
    familyMemberId: schedule.familyMemberId,
    scope: "MANAGE_MEDICATIONS",
  });
  if (!subject.ok) return subject;

  const rows = await prisma.medicationDoseLog.findMany({
    where: {
      scheduleId: schedule.id,
      ...(input.from || input.to
        ? { scheduledFor: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
        : {}),
    },
    orderBy: { scheduledFor: "desc" },
    select: DOSE_LOG_SELECT,
  });

  return careOk(rows);
}

export type AdherenceCounts = {
  taken: number;
  takenLate: number;
  skipped: number;
  missed: number;
  scheduled: number;
  /** Doses the person actually logged: taken, taken late or skipped. */
  logged: number;
  /** Doses the schedule implies for the window, from its own times of day. */
  expected: number;
  windowFrom: Date;
  windowTo: Date;
};

/**
 * How many doses of a schedule fell into each outcome over a window.
 *
 * Counts only — no percentage, no score, no verdict. A single adherence figure
 * would read as an assessment of the person, and it would merge events that are
 * not the same: a skipped dose is a deliberate decision the person recorded,
 * while a missed dose is an omission with no entry behind it. They are counted
 * separately and the caller shows them side by side.
 */
export async function adherenceSummary(input: {
  user: AuthenticatedUser;
  scheduleId: string;
  from: Date;
  to: Date;
}): Promise<CareResult<AdherenceCounts>> {
  const schedule = await prisma.medicationSchedule.findUnique({
    where: { id: input.scheduleId },
    select: {
      id: true,
      ownerUserId: true,
      familyMemberId: true,
      localTimesOfDay: true,
      timezone: true,
      startOn: true,
      endOn: true,
    },
  });
  if (!schedule) return careFail("not_found", "That medicine schedule was not found.");

  const subject = await scopedSubject({
    user: input.user,
    ownerUserId: schedule.ownerUserId,
    familyMemberId: schedule.familyMemberId,
    scope: "MANAGE_MEDICATIONS",
  });
  if (!subject.ok) return subject;

  const grouped = await prisma.medicationDoseLog.groupBy({
    by: ["status"],
    where: { scheduleId: schedule.id, scheduledFor: { gte: input.from, lte: input.to } },
    _count: { _all: true },
  });

  const countOf = (status: MedicationDoseStatus): number =>
    grouped.find((row) => row.status === status)?._count._all ?? 0;

  const taken = countOf("TAKEN");
  const takenLate = countOf("TAKEN_LATE");
  const skipped = countOf("SKIPPED");
  const missed = countOf("MISSED");
  const scheduled = countOf("SCHEDULED");

  return careOk({
    taken,
    takenLate,
    skipped,
    missed,
    scheduled,
    logged: taken + takenLate + skipped,
    expected: countExpectedDoses(schedule, input.from, input.to),
    windowFrom: input.from,
    windowTo: input.to,
  });
}

/**
 * How many doses the schedule implies for a window.
 *
 * Derived from the schedule's own times of day, counted per local day so a
 * daylight-saving change cannot make a day vanish or arrive twice, and clipped
 * to the schedule's own start and end dates. Day granularity is deliberate: the
 * window comes from a screen that picks dates.
 */
function countExpectedDoses(
  schedule: { localTimesOfDay: number[]; timezone: string; startOn: Date; endOn: Date | null },
  from: Date,
  to: Date,
): number {
  const perDay = schedule.localTimesOfDay.length;
  if (perDay === 0) return 0;

  const startMs = Math.max(from.getTime(), schedule.startOn.getTime());
  const endMs = schedule.endOn ? Math.min(to.getTime(), schedule.endOn.getTime()) : to.getTime();
  if (endMs < startMs) return 0;

  const days = new Set<string>();
  const dayMs = 86_400_000;
  for (let at = startMs; at <= endMs; at += dayMs) {
    days.add(zonedDayKey(new Date(at), schedule.timezone));
  }
  days.add(zonedDayKey(new Date(endMs), schedule.timezone));

  return days.size * perDay;
}
