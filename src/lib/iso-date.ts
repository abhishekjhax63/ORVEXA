/**
 * Date formatting for the fixed `YYYY-MM-DD` strings carried by the demo
 * patient data. The parts are read straight from the string instead of going
 * through `Date`, so the output is identical on the server and the client and
 * no clock value is ever read during render (Cache Components rejects that as
 * an unstable value).
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Turn `2026-10-24` into `24 Oct 2026`. Anything that is not a full ISO
 * calendar date is returned unchanged rather than mangled. */
export function formatIsoDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;

  const [, year, month, day] = match;
  const monthLabel = MONTHS[Number(month) - 1];
  if (!monthLabel) return iso;

  return `${day} ${monthLabel} ${year}`;
}
