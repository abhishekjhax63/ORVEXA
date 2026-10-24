/**
 * Date and time formatting for the diagnostics surface.
 *
 * CLIENT-SAFE: no `server-only`, no Prisma, no environment access, so a Server
 * or Client Component can both render the same instant identically.
 *
 * A sample-collection slot is an instant and the person attending may be in a
 * different place from the laboratory, so every time is shown in IST with the
 * zone stated — an unqualified clock time is the kind of ambiguity that makes
 * somebody miss a collection. Follows the telemedicine surface's convention
 * without importing from it.
 */

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

const DATE_ONLY = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const TIME_ONLY = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `24 Oct 2026 · 3:30 pm IST`, or null when there is no usable instant. */
export function formatDiagnosticInstant(value: Date | string | null | undefined): string | null {
  const date = toDate(value);
  if (!date) return null;
  return `${DATE_TIME.format(date)} IST`;
}

/** `Sat, 24 Oct 2026`. */
export function formatDiagnosticDate(value: Date | string | null | undefined): string | null {
  const date = toDate(value);
  if (!date) return null;
  return DATE_ONLY.format(date);
}

/** `Sat, 24 Oct 2026 · 3:30 pm – 4:30 pm IST`, or a single instant when equal. */
export function formatDiagnosticWindow(
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
