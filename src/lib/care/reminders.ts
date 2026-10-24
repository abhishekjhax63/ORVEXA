import "server-only";

import {
  Prisma,
  type CareReminderChannel,
  type CareReminderStatus,
  type ReminderDispatchOutcome,
  type ReminderKind,
  type ReminderScheduleKind,
} from "@prisma/client";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { requireScope, resolveCareSubject } from "@/lib/care/access";
import { careFail, careOk, type CareResult } from "@/lib/care/errors";
import {
  assertValidTimeZone,
  buildReminderDedupeKey,
  decideOccurrence,
  formatLocalMinuteOfDay,
  isWithinQuietHours,
  localMinuteOfDay as minuteOfDayOf,
  parseLocalMinuteOfDay,
  truncateToMinute,
  validateScheduleSpec,
  type ReminderScheduleSpec,
} from "@/lib/care/scheduling";
import { prisma } from "@/lib/db/prisma";
import { sendNotification, type NotificationChannel } from "@/lib/notifications/provider";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import {
  reminderUpdateSchema,
  type ReminderCreateInput,
  type ReminderPreferenceUpdateInput,
} from "@/lib/validation/care";

type ReminderUpdateInput = z.infer<typeof reminderUpdateSchema>;

/**
 * Reminders: the standing schedules a person owns, and the sweep that delivers
 * them.
 *
 * ## Where the thinking lives
 *
 * The one genuinely hard question — "is this occurrence due, missed, or not yet
 * owed, in the person's own time zone" — is answered entirely in
 * `src/lib/care/scheduling.ts`, which is pure and testable. Nothing here
 * re-implements that arithmetic; this file only loads rows, applies the answer,
 * records what happened, and writes the trail. Every schedule decision is made
 * by calling into that module (`validateScheduleSpec`, `decideOccurrence`,
 * `isWithinQuietHours`, `localMinuteOfDay`, `buildReminderDedupeKey`), so the two
 * can never drift.
 *
 * ## Why a `NOT_CONFIGURED` transport is a failure, not a delivery
 *
 * `sendNotification` reports `NOT_CONFIGURED` whenever this deployment has no
 * transport for the channel — which, today, is every channel. A suppression is
 * the platform choosing not to send; `NOT_CONFIGURED` is the platform being
 * *unable* to send. The two must not be conflated, and neither may be recorded
 * as `SENT`, because a dispatch row saying `SENT` is the platform asserting that
 * a reminder reached somebody. So `NOT_CONFIGURED` is written as `FAILED` with
 * the provider's own reason in `detail`. That is what stops the platform
 * implying a reminder arrived when nothing carried it.
 *
 * ## The two duplicate guards
 *
 * `decideOccurrence`'s `occurrence > lastFiredAt` stops an ordinary repeat, and
 * `ReminderDispatch.@@unique([reminderId, scheduledFor])` stops two workers
 * racing over the same due reminder. The second is the one that matters at
 * scale: the insert is attempted *first* and a unique violation is recorded as
 * `SUPPRESSED_DUPLICATE` rather than as a second send.
 */

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export type ReminderPreferenceView = {
  userId: string;
  timezone: string;
  channels: CareReminderChannel[];
  quietHoursStartMinute: number | null;
  quietHoursEndMinute: number | null;
  defaultLeadMinutes: number;
  remindersEnabled: boolean;
};

/**
 * The values a person who has never opened the preferences screen is treated as
 * having chosen. Exported as documentation: the database applies the same
 * defaults on the first upsert, so this object describes a row that does not
 * exist yet rather than the absence of one.
 */
export const DEFAULT_REMINDER_PREFERENCE = {
  timezone: "Asia/Kolkata",
  channels: ["IN_APP"] as CareReminderChannel[],
  quietHoursStartMinute: null,
  quietHoursEndMinute: null,
  defaultLeadMinutes: 15,
  remindersEnabled: true,
} as const;

const PREFERENCE_SELECT = {
  id: true,
  timezone: true,
  channels: true,
  quietHoursStartMinute: true,
  quietHoursEndMinute: true,
  defaultLeadMinutes: true,
  remindersEnabled: true,
} as const;

type PreferenceRow = {
  timezone: string;
  channels: CareReminderChannel[];
  quietHoursStartMinute: number | null;
  quietHoursEndMinute: number | null;
  defaultLeadMinutes: number;
  remindersEnabled: boolean;
};

function toPreferenceView(userId: string, row: PreferenceRow): ReminderPreferenceView {
  return {
    userId,
    timezone: row.timezone,
    channels: row.channels,
    quietHoursStartMinute: row.quietHoursStartMinute,
    quietHoursEndMinute: row.quietHoursEndMinute,
    defaultLeadMinutes: row.defaultLeadMinutes,
    remindersEnabled: row.remindersEnabled,
  };
}

/** The stored preference row, or the documented default. Never writes. */
export async function getReminderPreference(userId: string): Promise<ReminderPreferenceView> {
  const row = await prisma.reminderPreference.findUnique({
    where: { userId },
    select: PREFERENCE_SELECT,
  });
  if (!row) {
    return { userId, ...DEFAULT_REMINDER_PREFERENCE, channels: [...DEFAULT_REMINDER_PREFERENCE.channels] };
  }
  return toPreferenceView(userId, row);
}

/**
 * Changes how reminders are delivered for this account.
 *
 * The quiet window arrives as `"HH:MM"` strings and is stored as minutes past
 * local midnight, using the same `parseLocalMinuteOfDay` the scheduler resolves
 * occurrences with, so what the person typed and what the sweep compares against
 * cannot disagree. The time zone is validated here rather than trusted, because
 * an unrecognised name would otherwise throw deep inside the scheduler instead
 * of failing at the boundary.
 */
export async function updateReminderPreference(input: {
  user: AuthenticatedUser;
  data: ReminderPreferenceUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<ReminderPreferenceView>> {
  const { user, data } = input;

  if (data.timezone !== undefined) {
    try {
      assertValidTimeZone(data.timezone);
    } catch {
      return careFail("invalid_timezone", "Choose a recognised time zone, for example Asia/Kolkata.");
    }
  }

  // `undefined` means "leave as it is"; `null` means "no quiet window". The
  // distinction is preserved all the way into the upsert.
  let quietStart: number | null | undefined;
  if (data.quietHoursStart !== undefined) {
    if (data.quietHoursStart === null) {
      quietStart = null;
    } else {
      const parsed = parseLocalMinuteOfDay(data.quietHoursStart);
      if (parsed === null) return careFail("validation", "Use a 24-hour time, for example 22:00.");
      quietStart = parsed;
    }
  }

  let quietEnd: number | null | undefined;
  if (data.quietHoursEnd !== undefined) {
    if (data.quietHoursEnd === null) {
      quietEnd = null;
    } else {
      const parsed = parseLocalMinuteOfDay(data.quietHoursEnd);
      if (parsed === null) return careFail("validation", "Use a 24-hour time, for example 07:00.");
      quietEnd = parsed;
    }
  }

  const row = await prisma.reminderPreference.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.channels !== undefined ? { channels: data.channels } : {}),
      ...(quietStart !== undefined ? { quietHoursStartMinute: quietStart } : {}),
      ...(quietEnd !== undefined ? { quietHoursEndMinute: quietEnd } : {}),
      ...(data.defaultLeadMinutes !== undefined ? { defaultLeadMinutes: data.defaultLeadMinutes } : {}),
      ...(data.remindersEnabled !== undefined ? { remindersEnabled: data.remindersEnabled } : {}),
    },
    update: {
      timezone: data.timezone,
      channels: data.channels,
      quietHoursStartMinute: quietStart,
      quietHoursEndMinute: quietEnd,
      defaultLeadMinutes: data.defaultLeadMinutes,
      remindersEnabled: data.remindersEnabled,
    },
    select: PREFERENCE_SELECT,
  });

  await recordAuditEvent({
    action: "care.reminder_preferences_changed",
    entityType: "care_reminder_preference",
    entityId: user.id,
    actorUserId: user.id,
    context: input.context,
    metadata: {
      timezone: row.timezone,
      channels: row.channels,
      quietHoursStartMinute: row.quietHoursStartMinute,
      quietHoursEndMinute: row.quietHoursEndMinute,
      remindersEnabled: row.remindersEnabled,
    },
  });

  return careOk(toPreferenceView(user.id, row));
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export type ReminderSummary = {
  id: string;
  familyMemberId: string | null;
  kind: ReminderKind;
  title: string;
  notes: string | null;
  scheduleKind: ReminderScheduleKind;
  startAt: Date;
  localMinuteOfDay: number | null;
  daysOfWeek: number[];
  intervalMinutes: number | null;
  timezone: string;
  nextDueAt: Date;
  lastFiredAt: Date | null;
  status: CareReminderStatus;
  channel: CareReminderChannel;
  dedupeKey: string | null;
  createdAt: Date;
  /** The most recent delivery attempt, where one exists. Cheap: one row. */
  latestDispatch: {
    outcome: ReminderDispatchOutcome;
    attemptedAt: Date;
    scheduledFor: Date;
    localTimeLabel: string | null;
    detail: string | null;
  } | null;
};

/** The reminder fields every operation here reads. */
const REMINDER_SELECT = {
  id: true,
  ownerUserId: true,
  familyMemberId: true,
  kind: true,
  title: true,
  notes: true,
  scheduleKind: true,
  startAt: true,
  localMinuteOfDay: true,
  daysOfWeek: true,
  intervalMinutes: true,
  timezone: true,
  nextDueAt: true,
  lastFiredAt: true,
  status: true,
  channel: true,
  dedupeKey: true,
} as const;

type ReminderRow = {
  id: string;
  ownerUserId: string;
  familyMemberId: string | null;
  kind: ReminderKind;
  title: string;
  notes: string | null;
  scheduleKind: ReminderScheduleKind;
  startAt: Date;
  localMinuteOfDay: number | null;
  daysOfWeek: number[];
  intervalMinutes: number | null;
  timezone: string;
  nextDueAt: Date;
  lastFiredAt: Date | null;
  status: CareReminderStatus;
  channel: CareReminderChannel;
  dedupeKey: string | null;
};

function specFromReminder(reminder: ReminderRow): ReminderScheduleSpec {
  return {
    scheduleKind: reminder.scheduleKind,
    timeZone: reminder.timezone,
    startAt: reminder.startAt,
    localMinuteOfDay: reminder.localMinuteOfDay,
    daysOfWeek: reminder.daysOfWeek,
    intervalMinutes: reminder.intervalMinutes,
  };
}

/** The instant a reminder should next be looked at, from a schedule decision. */
function nextDueAtFrom(
  spec: ReminderScheduleSpec,
  options: { now: Date; lastFiredAt?: Date | null },
): Date {
  const decision = decideOccurrence(spec, options);
  return decision.kind === "scheduled" ? decision.nextAt : decision.occurrence;
}

/** A reminder's time zone: the caller's choice, else the owner's, else the default. */
async function resolveReminderTimeZone(ownerUserId: string, requested?: string): Promise<string> {
  if (requested) return requested;
  const pref = await prisma.reminderPreference.findUnique({
    where: { userId: ownerUserId },
    select: { timezone: true },
  });
  return pref?.timezone ?? DEFAULT_REMINDER_PREFERENCE.timezone;
}

/**
 * Loads a reminder and confirms the acting user may manage it.
 *
 * Returns the same failures `resolveCareSubject` and `requireScope` would, so a
 * caregiver without `MANAGE_REMINDERS` is refused here rather than deeper in.
 */
async function loadWritableReminder(
  user: AuthenticatedUser,
  reminderId: string,
): Promise<CareResult<ReminderRow>> {
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId }, select: REMINDER_SELECT });
  if (!reminder) return careFail("reminder_not_found", "That reminder was not found.");

  const subject = await resolveCareSubject({
    viewerUserId: user.id,
    ownerUserId: reminder.ownerUserId,
    familyMemberId: reminder.familyMemberId,
  });
  if (!subject.ok) return subject;

  const scoped = requireScope(subject.data, "MANAGE_REMINDERS");
  if (!scoped.ok) return scoped;

  return careOk(reminder);
}

/**
 * Creates a reminder.
 *
 * The schedule is validated by `validateScheduleSpec`, the first occurrence is
 * chosen by `decideOccurrence`, and the `dedupeKey` is derived from what the
 * reminder is *about* rather than from when it was made — so a retried submit, or
 * a second run of a generator, updates the existing reminder instead of adding
 * another. The database enforces that with `@@unique([ownerUserId, dedupeKey])`,
 * and a collision is returned as an ordinary `duplicate` outcome.
 */
export async function createReminder(input: {
  user: AuthenticatedUser;
  data: ReminderCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ reminderId: string }>> {
  const { user, data } = input;

  const subject = await resolveCareSubject({
    viewerUserId: user.id,
    ownerUserId: data.ownerUserId ?? null,
    familyMemberId: data.familyMemberId ?? null,
  });
  if (!subject.ok) return subject;

  const scoped = requireScope(subject.data, "MANAGE_REMINDERS");
  if (!scoped.ok) return scoped;

  const ownerUserId = subject.data.ownerUserId;
  const familyMemberId = subject.data.familyMemberId;

  let localMinute: number | null = null;
  if (data.localTime !== undefined) {
    localMinute = parseLocalMinuteOfDay(data.localTime);
    if (localMinute === null) return careFail("validation", "Use a 24-hour time, for example 09:30.");
  }

  const timeZone = await resolveReminderTimeZone(ownerUserId, data.timezone);

  const spec: ReminderScheduleSpec = {
    scheduleKind: data.scheduleKind,
    timeZone,
    startAt: data.startAt,
    localMinuteOfDay: localMinute,
    daysOfWeek: data.daysOfWeek ?? [],
    intervalMinutes: data.intervalMinutes ?? null,
  };
  const problem = validateScheduleSpec(spec);
  if (problem) return careFail("invalid_schedule", problem);

  const now = new Date();
  const nextDueAt = nextDueAtFrom(spec, { now, lastFiredAt: null });
  const dedupeKey = buildReminderDedupeKey({
    kind: data.kind,
    familyMemberId,
    label: data.dedupeKey ?? data.title,
  });

  let created: { id: string };
  try {
    created = await prisma.reminder.create({
      data: {
        ownerUserId,
        familyMemberId,
        kind: data.kind,
        title: data.title,
        notes: data.notes ?? null,
        scheduleKind: data.scheduleKind,
        startAt: data.startAt,
        localMinuteOfDay: localMinute,
        daysOfWeek: [...spec.daysOfWeek],
        intervalMinutes: spec.intervalMinutes,
        timezone: timeZone,
        nextDueAt,
        status: "ACTIVE",
        channel: data.channel ?? "IN_APP",
        dedupeKey,
        createdById: user.id,
      },
      select: { id: true },
    });
  } catch (error) {
    // The unique index on (ownerUserId, dedupeKey) is the idempotency guarantee.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return careFail("duplicate", "A reminder for this already exists.");
    }
    throw error;
  }

  await recordAuditEvent({
    action: "care.reminder_created",
    entityType: "care_reminder",
    entityId: created.id,
    actorUserId: user.id,
    context: input.context,
    metadata: { kind: data.kind, scheduleKind: data.scheduleKind, timezone: timeZone, dedupeKey },
  });

  return careOk({ reminderId: created.id });
}

/**
 * Edits a reminder and re-derives when it is next due.
 *
 * A change to the time of day, the days or the time zone is a change to the
 * *schedule*, so `nextDueAt` is recomputed from the new spec rather than left
 * pointing at an instant that no longer means anything.
 */
export async function updateReminder(input: {
  user: AuthenticatedUser;
  reminderId: string;
  data: ReminderUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ reminderId: string }>> {
  const loaded = await loadWritableReminder(input.user, input.reminderId);
  if (!loaded.ok) return loaded;
  const reminder = loaded.data;
  const { data } = input;

  let localMinute = reminder.localMinuteOfDay;
  if (data.localTime !== undefined) {
    const parsed = parseLocalMinuteOfDay(data.localTime);
    if (parsed === null) return careFail("validation", "Use a 24-hour time, for example 09:30.");
    localMinute = parsed;
  }

  const spec: ReminderScheduleSpec = {
    scheduleKind: reminder.scheduleKind,
    timeZone: data.timezone ?? reminder.timezone,
    startAt: reminder.startAt,
    localMinuteOfDay: localMinute,
    daysOfWeek: data.daysOfWeek ?? reminder.daysOfWeek,
    intervalMinutes: data.intervalMinutes ?? reminder.intervalMinutes,
  };
  const problem = validateScheduleSpec(spec);
  if (problem) return careFail("invalid_schedule", problem);

  const now = new Date();
  const nextDueAt = nextDueAtFrom(spec, { now, lastFiredAt: reminder.lastFiredAt });

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: {
      title: data.title,
      notes: data.notes,
      localMinuteOfDay: localMinute,
      daysOfWeek: data.daysOfWeek,
      intervalMinutes: data.intervalMinutes,
      timezone: data.timezone,
      channel: data.channel,
      status: data.status,
      nextDueAt,
    },
  });

  await recordAuditEvent({
    action: "care.reminder_updated",
    entityType: "care_reminder",
    entityId: reminder.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { scheduleKind: spec.scheduleKind, timezone: spec.timeZone },
  });

  return careOk({ reminderId: reminder.id });
}

export async function pauseReminder(input: {
  user: AuthenticatedUser;
  reminderId: string;
  context?: RequestContext;
}): Promise<CareResult<{ reminderId: string }>> {
  const loaded = await loadWritableReminder(input.user, input.reminderId);
  if (!loaded.ok) return loaded;
  const reminder = loaded.data;
  if (reminder.status === "CANCELLED") {
    return careFail("reminder_not_active", "This reminder has been cancelled.");
  }

  await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "PAUSED" } });

  await recordAuditEvent({
    action: "care.reminder_paused",
    entityType: "care_reminder",
    entityId: reminder.id,
    actorUserId: input.user.id,
    context: input.context,
  });

  return careOk({ reminderId: reminder.id });
}

export async function resumeReminder(input: {
  user: AuthenticatedUser;
  reminderId: string;
  context?: RequestContext;
}): Promise<CareResult<{ reminderId: string }>> {
  const loaded = await loadWritableReminder(input.user, input.reminderId);
  if (!loaded.ok) return loaded;
  const reminder = loaded.data;
  if (reminder.status === "CANCELLED") {
    return careFail("reminder_not_active", "This reminder has been cancelled.");
  }

  // Resuming re-derives the next occurrence from now, so a paused reminder does
  // not immediately owe every occurrence it missed while it was off.
  const spec = specFromReminder(reminder);
  const nextDueAt = nextDueAtFrom(spec, { now: new Date(), lastFiredAt: reminder.lastFiredAt });

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { status: "ACTIVE", nextDueAt },
  });

  await recordAuditEvent({
    action: "care.reminder_updated",
    entityType: "care_reminder",
    entityId: reminder.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { resumed: true },
  });

  return careOk({ reminderId: reminder.id });
}

export async function cancelReminder(input: {
  user: AuthenticatedUser;
  reminderId: string;
  context?: RequestContext;
}): Promise<CareResult<{ reminderId: string }>> {
  const loaded = await loadWritableReminder(input.user, input.reminderId);
  if (!loaded.ok) return loaded;
  const reminder = loaded.data;

  await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "CANCELLED" } });

  await recordAuditEvent({
    action: "care.reminder_cancelled",
    entityType: "care_reminder",
    entityId: reminder.id,
    actorUserId: input.user.id,
    context: input.context,
  });

  return careOk({ reminderId: reminder.id });
}

/**
 * The reminders for one subject, active first.
 *
 * `includeInactive` widens the list to paused, completed and cancelled
 * reminders; the default shows only what is currently on. Each row carries its
 * most recent dispatch so the screen can say "held for quiet hours" without a
 * second query per reminder.
 */
export async function listReminders(input: {
  user: AuthenticatedUser;
  ownerUserId?: string;
  familyMemberId?: string;
  includeInactive?: boolean;
}): Promise<CareResult<ReminderSummary[]>> {
  const subject = await resolveCareSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.ownerUserId ?? null,
    familyMemberId: input.familyMemberId ?? null,
  });
  if (!subject.ok) return subject;

  const scoped = requireScope(subject.data, "MANAGE_REMINDERS");
  if (!scoped.ok) return scoped;

  const rows = await prisma.reminder.findMany({
    where: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      ...(input.includeInactive ? {} : { status: "ACTIVE" }),
    },
    // `ACTIVE` sorts first among the statuses, which is the ordering a person
    // expects from "what have I got on".
    orderBy: [{ status: "asc" }, { nextDueAt: "asc" }],
    select: {
      ...REMINDER_SELECT,
      createdAt: true,
      dispatches: {
        orderBy: { attemptedAt: "desc" },
        take: 1,
        select: { outcome: true, attemptedAt: true, scheduledFor: true, localTimeLabel: true, detail: true },
      },
    },
  });

  return careOk(
    rows.map((row) => ({
      id: row.id,
      familyMemberId: row.familyMemberId,
      kind: row.kind,
      title: row.title,
      notes: row.notes,
      scheduleKind: row.scheduleKind,
      startAt: row.startAt,
      localMinuteOfDay: row.localMinuteOfDay,
      daysOfWeek: row.daysOfWeek,
      intervalMinutes: row.intervalMinutes,
      timezone: row.timezone,
      nextDueAt: row.nextDueAt,
      lastFiredAt: row.lastFiredAt,
      status: row.status,
      channel: row.channel,
      dedupeKey: row.dedupeKey,
      createdAt: row.createdAt,
      latestDispatch: row.dispatches[0] ?? null,
    })),
  );
}

// ---------------------------------------------------------------------------
// The dispatch sweep
// ---------------------------------------------------------------------------

export type ReminderDispatchSummary = {
  evaluated: number;
  due: number;
  sent: number;
  suppressed: number;
  failed: number;
  missed: number;
};

function notificationChannelFor(channel: CareReminderChannel): NotificationChannel {
  if (channel === "WHATSAPP" || channel === "SMS") return "SMS";
  if (channel === "EMAIL") return "EMAIL";
  return "IN_APP";
}

function recipientFor(channel: CareReminderChannel, owner: { email: string; phone: string | null }): string {
  const mapped = notificationChannelFor(channel);
  if (mapped === "SMS") return owner.phone ?? owner.email;
  return owner.email;
}

/**
 * The scheduler sweep.
 *
 * This takes no acting user: it is a job, run by the platform, that walks the
 * reminders whose `nextDueAt` has arrived. For each one it asks the pure
 * scheduling module what is owed, then does one of four things — sends it,
 * suppresses it for a reason it can explain later, records a missed occurrence
 * as a failure, or simply moves the next due time forward. Every suppression
 * writes both a `ReminderDispatch` row and a `care.reminder_suppressed` audit
 * row, because "we chose not to send this" is a decision the platform has to be
 * able to prove.
 */
export async function dispatchDueReminders(
  options: { now?: Date; limit?: number } = {},
): Promise<ReminderDispatchSummary> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 100;
  const counts: ReminderDispatchSummary = { evaluated: 0, due: 0, sent: 0, suppressed: 0, failed: 0, missed: 0 };

  const reminders = await prisma.reminder.findMany({
    where: { status: "ACTIVE", nextDueAt: { lte: now } },
    orderBy: { nextDueAt: "asc" },
    take: limit,
    select: { ...REMINDER_SELECT, owner: { select: { email: true, phone: true } } },
  });
  if (reminders.length === 0) return counts;

  const ownerIds = [...new Set(reminders.map((row) => row.ownerUserId))];
  const preferences = await prisma.reminderPreference.findMany({
    where: { userId: { in: ownerIds } },
    select: { userId: true, ...PREFERENCE_SELECT },
  });
  const preferenceByUser = new Map(preferences.map((row) => [row.userId, row]));

  for (const reminder of reminders) {
    const preference = preferenceByUser.get(reminder.ownerUserId);

    // 1. The account-wide off switch. Off means "leave everything alone", so the
    //    reminder is skipped untouched rather than advanced or logged.
    if (preference && !preference.remindersEnabled) continue;

    const channels: CareReminderChannel[] = preference?.channels ?? ["IN_APP"];
    const quietStart = preference?.quietHoursStartMinute ?? null;
    const quietEnd = preference?.quietHoursEndMinute ?? null;

    counts.evaluated += 1;
    const spec = specFromReminder(reminder);
    const decision = decideOccurrence(spec, { now, lastFiredAt: reminder.lastFiredAt });

    // 5. Nothing owed — the first occurrence is still ahead.
    if (decision.kind === "scheduled") {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { nextDueAt: decision.nextAt } });
      continue;
    }

    const occurrence = decision.occurrence;
    const scheduledFor = truncateToMinute(occurrence);

    // 3. Missed: the occurrence is older than the catch-up window, so delivering
    //    it now would be misleading. Recorded as FAILED with the reason, then
    //    advanced so it cannot be reconsidered.
    if (decision.kind === "missed") {
      counts.missed += 1;
      await prisma.reminderDispatch.create({
        data: {
          reminderId: reminder.id,
          scheduledFor,
          channel: reminder.channel,
          outcome: "FAILED",
          detail: "This occurrence was past the catch-up window, so it was not sent.",
        },
      });
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { nextDueAt: nextDueAtFrom(spec, { now, lastFiredAt: occurrence }) },
      });
      await recordAuditEvent({
        action: "care.reminder_suppressed",
        entityType: "care_reminder",
        entityId: reminder.id,
        actorUserId: null,
        metadata: { reason: "missed", occurrence: scheduledFor.toISOString(), outcome: "FAILED" },
      });
      continue;
    }

    // 4. Due.
    counts.due += 1;
    const minuteOfDay = minuteOfDayOf(occurrence, spec.timeZone);
    const localTimeLabel = formatLocalMinuteOfDay(minuteOfDay);

    if (isWithinQuietHours(minuteOfDay, quietStart, quietEnd)) {
      counts.suppressed += 1;
      await prisma.reminderDispatch.create({
        data: {
          reminderId: reminder.id,
          scheduledFor,
          channel: reminder.channel,
          outcome: "SUPPRESSED_QUIET_HOURS",
          localTimeLabel,
          detail: "Fell inside the quiet hours this person set.",
        },
      });
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { nextDueAt: nextDueAtFrom(spec, { now, lastFiredAt: occurrence }) },
      });
      await recordAuditEvent({
        action: "care.reminder_suppressed",
        entityType: "care_reminder",
        entityId: reminder.id,
        actorUserId: null,
        metadata: { reason: "quiet_hours", occurrence: scheduledFor.toISOString(), localTimeLabel },
      });
      continue;
    }

    // Claim the occurrence before doing anything observable. The unique index on
    // (reminderId, scheduledFor) is what makes "exactly once" true across workers.
    let dispatchId: string;
    try {
      const claimed = await prisma.reminderDispatch.create({
        data: { reminderId: reminder.id, scheduledFor, channel: reminder.channel, outcome: "QUEUED" },
        select: { id: true },
      });
      dispatchId = claimed.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Another worker already claimed this occurrence. No second row is
        // inserted; the existing one is stamped so the decision is visible.
        counts.suppressed += 1;
        await prisma.reminderDispatch.update({
          where: { reminderId_scheduledFor: { reminderId: reminder.id, scheduledFor } },
          data: { outcome: "SUPPRESSED_DUPLICATE", detail: "Another worker had already claimed this occurrence." },
        });
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { nextDueAt: nextDueAtFrom(spec, { now, lastFiredAt: occurrence }) },
        });
        await recordAuditEvent({
          action: "care.reminder_suppressed",
          entityType: "care_reminder",
          entityId: reminder.id,
          actorUserId: null,
          metadata: { reason: "duplicate", occurrence: scheduledFor.toISOString() },
        });
        continue;
      }
      throw error;
    }

    if (!channels.includes(reminder.channel)) {
      counts.suppressed += 1;
      await prisma.reminderDispatch.update({
        where: { id: dispatchId },
        data: {
          outcome: "SUPPRESSED_CHANNEL_DISABLED",
          detail: `The ${reminder.channel} channel is switched off in this person's reminder preferences.`,
        },
      });
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { nextDueAt: nextDueAtFrom(spec, { now, lastFiredAt: occurrence }) },
      });
      await recordAuditEvent({
        action: "care.reminder_suppressed",
        entityType: "care_reminder",
        entityId: reminder.id,
        actorUserId: null,
        metadata: { reason: "channel_disabled", channel: reminder.channel, occurrence: scheduledFor.toISOString() },
      });
      continue;
    }

    const outcome = await sendNotification({
      kind: "care_reminder_due",
      channel: notificationChannelFor(reminder.channel),
      to: recipientFor(reminder.channel, reminder.owner),
      subject: `Reminder: ${reminder.title}`,
      body:
        `This is the reminder you set: ${reminder.title}.\n\n` +
        (reminder.notes ? `${reminder.notes}\n\n` : "") +
        "You chose to receive this through ORVEXA. You can pause or change it at any time.",
      reference: reminder.id,
    });

    let dispatchOutcome: ReminderDispatchOutcome;
    let detail: string | null = null;
    if (outcome.status === "SENT") {
      dispatchOutcome = "SENT";
      counts.sent += 1;
    } else if (outcome.status === "NOT_CONFIGURED") {
      // An honest failure: no transport carried the message, so it must not be
      // recorded as delivered.
      dispatchOutcome = "FAILED";
      detail = outcome.reason;
      counts.failed += 1;
    } else {
      dispatchOutcome = "FAILED";
      detail = outcome.reason;
      counts.failed += 1;
    }

    await prisma.reminderDispatch.update({
      where: { id: dispatchId },
      data: { outcome: dispatchOutcome, detail },
    });
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        lastFiredAt: occurrence,
        nextDueAt: nextDueAtFrom(spec, { now, lastFiredAt: occurrence }),
      },
    });
    await recordAuditEvent({
      action: "care.reminder_dispatched",
      entityType: "care_reminder",
      entityId: reminder.id,
      actorUserId: null,
      metadata: {
        outcome: dispatchOutcome,
        channel: reminder.channel,
        occurrence: scheduledFor.toISOString(),
        ...(detail ? { detail } : {}),
      },
    });
  }

  return counts;
}
