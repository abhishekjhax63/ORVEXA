import { emergencyConfig } from "@/lib/emergency/config";

/**
 * Time formatting for the emergency surfaces.
 *
 * Every timestamp here comes from a stored ISO string, never from `Date.now()`,
 * and the zone is pinned to the configured region. That keeps the server and the
 * client producing byte-identical output — Cache Components treats a clock read
 * during render as an unstable value — while still showing a responder a
 * wall-clock time they can act on.
 *
 * Anything that genuinely needs the current time (a countdown to expiry) takes
 * `now` as an argument, so the caller decides when reading the clock is safe.
 */

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: emergencyConfig.timeZone,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TIME_ONLY = new Intl.DateTimeFormat("en-IN", {
  timeZone: emergencyConfig.timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function parse(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `23 Oct 2026, 14:32` in the configured region's zone. */
export function formatIncidentTime(iso: string | null | undefined) {
  const date = parse(iso);
  return date ? DATE_TIME.format(date) : null;
}

/** `14:32` — used where the date is already established by context. */
export function formatIncidentClock(iso: string | null | undefined) {
  const date = parse(iso);
  return date ? TIME_ONLY.format(date) : null;
}

export function minutesUntil(iso: string, now: number) {
  const target = parse(iso);
  if (!target) return 0;
  return Math.round((target.getTime() - now) / 60_000);
}

/** `3h 20m`, `18m`, or `under a minute`. Never negative. */
export function formatCountdown(minutes: number) {
  const remaining = Math.max(0, Math.round(minutes));
  if (remaining < 1) return "under a minute";
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** `42 seconds ago`. Used for "last refreshed", which is not safety-critical. */
export function formatAgeSeconds(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  if (value < 5) return "just now";
  if (value < 60) return `${value} seconds ago`;
  const minutes = Math.round(value / 60);
  return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
}
