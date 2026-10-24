import "server-only";

import type { ReminderKind, ReminderScheduleKind } from "@prisma/client";

/**
 * Reminder scheduling, as pure functions.
 *
 * Everything here is synchronous and free of database and React access, which is
 * deliberate: the correctness of "when does this person get reminded, in their
 * own time zone, exactly once" is the part of this phase most likely to be
 * wrong, so it is kept in a module that can be tested directly rather than
 * through a screen.
 *
 * ## The rule this module exists to hold
 *
 * A reminder belongs to a *local wall-clock time*, not to a UTC instant. Somebody
 * who says "remind me at 9am" and then flies from Delhi to London should be
 * reminded at 9am in London. So the stored value is the zone name plus a minute
 * past local midnight, and the UTC instant is recomputed for every occurrence
 * instead of being stored once.
 *
 * The same argument makes daylight saving the caller's problem in exactly one
 * place. `resolveWallClock` documents what happens in a gap and in a repeat,
 * because a reminder that silently disappears once a year is a real defect.
 */

export const MINUTES_PER_DAY = 1440;
export const MS_PER_MINUTE = 60_000;

/** Sunday = 0, matching `Date.getUTCDay()`. */
export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

/**
 * Whether the runtime actually knows this zone.
 *
 * Checked rather than assumed: the zone name arrives from a form, and an
 * unrecognised one would otherwise make every later `Intl` call throw deep
 * inside the scheduler instead of failing at the boundary.
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function assertValidTimeZone(timeZone: string): string {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`"${timeZone}" is not a recognised IANA time zone.`);
  }
  return timeZone;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Sunday = 0. Derived from the zoned date, not from the locale. */
  weekday: number;
};

/**
 * The wall-clock reading of an instant in a zone.
 *
 * `hourCycle: "h23"` rather than `hour12: false`, because the latter can format
 * midnight as hour 24 in some locales and would then place a 9pm reminder at the
 * wrong end of the day.
 */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number.parseInt(found.value, 10) : 0;
  };
  const year = read("year");
  const month = read("month");
  const day = read("day");
  return {
    year,
    month,
    day,
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** `YYYY-MM-DD` in the given zone. Used to key "one reminder per local day". */
export function zonedDayKey(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Minutes past local midnight, 0–1439. */
export function localMinuteOfDay(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  return parts.hour * 60 + parts.minute;
}

/** The zone's offset from UTC at a given instant, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // Seconds precision on both sides, so the millisecond field cannot skew this.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export type WallClock = { year: number; month: number; day: number; minuteOfDay: number };

function wallClockMatches(instantMs: number, timeZone: string, target: WallClock): boolean {
  const parts = zonedParts(new Date(instantMs), timeZone);
  return (
    parts.year === target.year &&
    parts.month === target.month &&
    parts.day === target.day &&
    parts.hour * 60 + parts.minute === target.minuteOfDay
  );
}

/**
 * Turns a local wall-clock reading into a UTC instant.
 *
 * Two awkward cases, both documented because both are silent data bugs if
 * guessed at:
 *
 * - **A repeated hour** (clocks go back). The wall-clock time happens twice. The
 *   *earlier* instant is chosen, so a 1:30am reminder fires on the first pass
 *   rather than an hour after the person expected it.
 * - **A missing hour** (clocks go forward). The wall-clock time does not exist
 *   that day. The instant is shifted forward to the first moment that does, which
 *   is what a person means by "9am tomorrow" when 9am was skipped — they get it
 *   as soon as the clock catches up rather than not at all.
 */
export function resolveWallClock(target: WallClock, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  const naiveUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    Math.floor(target.minuteOfDay / 60),
    target.minuteOfDay % 60,
    0,
    0,
  );

  // Probing a day either side is enough to find every offset that could apply to
  // a wall-clock reading on this date.
  const candidates = new Set<number>();
  for (const probe of [naiveUtc - 86_400_000, naiveUtc, naiveUtc + 86_400_000]) {
    candidates.add(naiveUtc - zoneOffsetMs(new Date(probe), timeZone));
  }

  const matching = [...candidates].filter((instant) => wallClockMatches(instant, timeZone, target)).sort((a, b) => a - b);
  if (matching.length > 0) return new Date(matching[0]);

  // No instant on this date reads as that wall-clock time, so the hour was
  // skipped. Shift forward by the offset in force just before the transition.
  const before = zoneOffsetMs(new Date(naiveUtc - 86_400_000), timeZone);
  const after = zoneOffsetMs(new Date(naiveUtc + 86_400_000), timeZone);
  return new Date(naiveUtc - Math.max(before, after));
}

/** Reminders are dispatched at minute granularity; this is the shared rounding. */
export function truncateToMinute(instant: Date): Date {
  return new Date(Math.floor(instant.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE);
}

// ---------------------------------------------------------------------------
// Minute-of-day helpers
// ---------------------------------------------------------------------------

export function formatLocalMinuteOfDay(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** `"09:30"` → 570. Returns null for anything that is not a valid time of day. */
export function parseLocalMinuteOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Whether a local time falls inside a quiet window.
 *
 * `start === end` means *no* window rather than a 24-hour silence: that is the
 * interpretation the database CHECK constraint also encodes, so the stored row
 * and the runtime agree. A window that wraps midnight (`22:00`–`07:00`) is the
 * normal case, not the exception, which is why this is not a simple range test.
 */
export function isWithinQuietHours(minuteOfDay: number, startMinute: number | null, endMinute: number | null): boolean {
  if (startMinute === null || endMinute === null) return false;
  if (startMinute === endMinute) return false;
  if (startMinute < endMinute) return minuteOfDay >= startMinute && minuteOfDay < endMinute;
  return minuteOfDay >= startMinute || minuteOfDay < endMinute;
}

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------

/**
 * How stale a missed occurrence may be before it is dropped instead of sent.
 *
 * A reminder that was due at 08:00 and is only picked up at 23:00 must not be
 * delivered as if it were current — "take your morning tablet" arriving at
 * bedtime is worse than silence. Twelve hours is the window within which a
 * reminder is still actionable; past it the occurrence is reported as `missed`
 * so it can be logged as such with a reason rather than quietly vanishing.
 */
export const MISSED_AFTER_MINUTES = 720;

export type ReminderScheduleSpec = {
  scheduleKind: ReminderScheduleKind;
  timeZone: string;
  /** The first occurrence, as an absolute instant. */
  startAt: Date;
  /** Minutes past local midnight. Required for DAILY, WEEKLY and MONTHLY. */
  localMinuteOfDay: number | null;
  /** 0 = Sunday. Used by WEEKLY; ignored by the others. */
  daysOfWeek: readonly number[];
  /** Required for INTERVAL. */
  intervalMinutes: number | null;
};

export type OccurrenceDecision =
  /** Due now: the most recent occurrence is inside the catch-up window. */
  | { kind: "due"; occurrence: Date }
  /** Occurred, but so long ago that delivering it would be misleading. */
  | { kind: "missed"; occurrence: Date }
  /** Nothing owed yet; the next one is in the future. */
  | { kind: "scheduled"; nextAt: Date };

/**
 * Validates a schedule specification.
 *
 * Returns a message rather than throwing, because every caller is a form
 * submission or a generator and both have somewhere to put a message.
 */
export function validateScheduleSpec(spec: ReminderScheduleSpec): string | null {
  if (!isValidTimeZone(spec.timeZone)) return "Choose a recognised time zone.";
  switch (spec.scheduleKind) {
    case "ONE_OFF":
      return null;
    case "INTERVAL":
      if (!spec.intervalMinutes || spec.intervalMinutes <= 0)
        return "An interval reminder needs a positive number of minutes.";
      return null;
    case "DAILY":
      if (spec.localMinuteOfDay === null) return "Choose a time of day for this reminder.";
      return null;
    case "WEEKLY":
      if (spec.localMinuteOfDay === null) return "Choose a time of day for this reminder.";
      if (spec.daysOfWeek.length === 0) return "Choose at least one day of the week.";
      if (spec.daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
        return "Choose days of the week between Sunday and Saturday.";
      return null;
    case "MONTHLY":
      if (spec.localMinuteOfDay === null) return "Choose a time of day for this reminder.";
      return null;
    default:
      return "Choose how often this reminder should repeat.";
  }
}

/**
 * The occurrence this reminder owes, if any.
 *
 * `occurrence > lastFiredAt` is the duplicate guard at the scheduling layer, and
 * `ReminderDispatch.@@unique([reminderId, scheduledFor])` is the same guard at
 * the database layer. Both are needed: this one stops a normal repeat, the
 * unique index stops two concurrent workers.
 */
export function decideOccurrence(
  spec: ReminderScheduleSpec,
  options: { now: Date; lastFiredAt?: Date | null; catchUpMinutes?: number },
): OccurrenceDecision {
  const now = options.now;
  const lastFiredAt = options.lastFiredAt ?? null;
  const catchUpMs = (options.catchUpMinutes ?? MISSED_AFTER_MINUTES) * MS_PER_MINUTE;

  if (spec.scheduleKind === "INTERVAL") {
    const step = (spec.intervalMinutes ?? 0) * MS_PER_MINUTE;
    if (step <= 0) return { kind: "scheduled", nextAt: new Date(now.getTime() + MS_PER_MINUTE) };
    const base = lastFiredAt ?? spec.startAt;
    let due = base.getTime() + step;
    if (due > now.getTime()) return { kind: "scheduled", nextAt: new Date(due) };
    // Fast-forward to the most recent step, so a long outage produces one
    // decision rather than a queue of them.
    const elapsed = now.getTime() - due;
    due += Math.floor(elapsed / step) * step;
    if (now.getTime() - due > catchUpMs) return { kind: "missed", occurrence: new Date(due) };
    return { kind: "due", occurrence: new Date(due) };
  }

  if (spec.scheduleKind === "ONE_OFF") {
    const at = spec.startAt.getTime();
    if (lastFiredAt && lastFiredAt.getTime() >= at) return { kind: "scheduled", nextAt: new Date(Number.MAX_SAFE_INTEGER) };
    if (at > now.getTime()) return { kind: "scheduled", nextAt: spec.startAt };
    if (now.getTime() - at > catchUpMs) return { kind: "missed", occurrence: spec.startAt };
    return { kind: "due", occurrence: spec.startAt };
  }

  // DAILY, WEEKLY and MONTHLY all walk local calendar days, so the search is
  // expressed in the person's own calendar rather than in UTC arithmetic.
  const minuteOfDay = spec.localMinuteOfDay;
  if (minuteOfDay === null) return { kind: "scheduled", nextAt: new Date(now.getTime() + MS_PER_MINUTE) };

  const floor = Math.max(spec.startAt.getTime(), lastFiredAt ? lastFiredAt.getTime() : 0);
  const startParts = zonedParts(spec.startAt, spec.timeZone);
  const startDayOfMonth = startParts.day;

  let latestPast: Date | null = null;
  for (let offset = -1; offset <= 62; offset += 1) {
    const probe = new Date(now.getTime() + offset * 86_400_000);
    const parts = zonedParts(probe, spec.timeZone);

    if (spec.scheduleKind === "WEEKLY" && !spec.daysOfWeek.includes(parts.weekday)) continue;
    if (spec.scheduleKind === "MONTHLY" && parts.day !== startDayOfMonth) continue;

    const candidate = resolveWallClock(
      { year: parts.year, month: parts.month, day: parts.day, minuteOfDay },
      spec.timeZone,
    );
    const ms = candidate.getTime();
    if (ms <= floor) continue;
    if (ms > now.getTime()) {
      // The first future candidate is the answer when nothing is owed.
      return latestPast ? classifyPast(latestPast, now, catchUpMs) : { kind: "scheduled", nextAt: candidate };
    }
    latestPast = candidate;
  }

  if (latestPast) return classifyPast(latestPast, now, catchUpMs);
  return { kind: "scheduled", nextAt: new Date(now.getTime() + MS_PER_MINUTE) };
}

function classifyPast(occurrence: Date, now: Date, catchUpMs: number): OccurrenceDecision {
  if (now.getTime() - occurrence.getTime() > catchUpMs) return { kind: "missed", occurrence };
  return { kind: "due", occurrence };
}

/**
 * A stable key that makes a generated reminder idempotent.
 *
 * Running the vaccination planner twice must not produce two reminders, so the
 * generator derives a key from what the reminder is *about* rather than from
 * when it was created. Unique per owner in the database.
 */
export function buildReminderDedupeKey(input: {
  kind: ReminderKind;
  familyMemberId?: string | null;
  /** The thing this reminder was derived from, e.g. `preventive_plan` + id. */
  sourceType?: string | null;
  sourceId?: string | null;
  /** Free-text discriminator for hand-made reminders, e.g. "physio exercises". */
  label?: string | null;
}): string {
  const subject = input.familyMemberId ?? "self";
  const source = input.sourceType && input.sourceId ? `${input.sourceType}:${input.sourceId}` : "";
  const label = input.label ? input.label.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 64) : "";
  return [input.kind, subject, source, label].filter(Boolean).join("|");
}

/** A readable one-line description of a schedule, for a list row. */
export function describeSchedule(spec: ReminderScheduleSpec): string {
  const time = spec.localMinuteOfDay === null ? null : formatLocalMinuteOfDay(spec.localMinuteOfDay);
  switch (spec.scheduleKind) {
    case "ONE_OFF":
      return "Once";
    case "DAILY":
      return time ? `Every day at ${time}` : "Every day";
    case "WEEKLY": {
      const days = [...spec.daysOfWeek]
        .sort((a, b) => a - b)
        .map((day) => WEEKDAY_LABELS[day]?.slice(0, 3) ?? "?")
        .join(", ");
      return time ? `${days} at ${time}` : days;
    }
    case "MONTHLY":
      return time ? `Monthly on day ${zonedParts(spec.startAt, spec.timeZone).day} at ${time}` : "Monthly";
    case "INTERVAL": {
      const minutes = spec.intervalMinutes ?? 0;
      if (minutes % 1440 === 0) return `Every ${minutes / 1440} day(s)`;
      if (minutes % 60 === 0) return `Every ${minutes / 60} hour(s)`;
      return `Every ${minutes} minute(s)`;
    }
    default:
      return "Scheduled";
  }
}
