const IST_TIME_ZONE = "Asia/Kolkata";

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const TIME_ONLY = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const DATE_ONLY = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Consultation times are always shown in IST with the zone stated, because the
 * clinician and the patient may be in different places and an unqualified
 * clock time is the kind of ambiguity that makes somebody miss a consultation.
 */
export function formatConsultInstant(value: Date | string | null | undefined): string | null {
  const date = toDate(value);
  if (!date) return null;
  return `${DATE_TIME.format(date)} IST`;
}

export function formatConsultDate(value: Date | string | null | undefined): string | null {
  const date = toDate(value);
  if (!date) return null;
  return DATE_ONLY.format(date);
}

export function formatConsultClock(value: Date | string | null | undefined): string | null {
  const date = toDate(value);
  if (!date) return null;
  return TIME_ONLY.format(date);
}

/** `YYYY-MM-DD` in IST, for grouping a list of instants into days. */
export function istDateKey(value: Date | string): string | null {
  const date = toDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TIME_ZONE }).format(date);
}

export function istTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TIME_ZONE }).format(new Date());
}

/** The heading for a `YYYY-MM-DD` key: `Sat, 24 Oct`. */
export function istDayHeading(dateKey: string): string {
  const midday = new Date(`${dateKey}T06:00:00Z`);
  if (Number.isNaN(midday.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(midday);
}

/** `Sat, 24 Oct 2026 · 3:30 pm – 4:00 pm IST`, or a single instant when equal. */
export function formatConsultWindow(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): string | null {
  const from = toDate(start);
  if (!from) return null;
  const day = DATE_ONLY.format(from);
  const fromClock = TIME_ONLY.format(from);
  const to = toDate(end);
  if (!to) return `${day} · ${fromClock} IST`;
  return `${day} · ${fromClock} – ${TIME_ONLY.format(to)} IST`;
}
