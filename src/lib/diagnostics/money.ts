/**
 * Money helpers for the diagnostics surface.
 *
 * CLIENT-SAFE: no `server-only`, no environment access, no Prisma import, so a
 * Client Component can format the same integers the server froze onto a booking.
 *
 * ## The two units, and why
 *
 * A price reaches the server as **paise** (the smallest whole unit, so no value
 * is ever a rounded float) and is stored as **whole rupees** in the columns named
 * `...Inr`. Those columns are `Int`, and this conversion lives here, in one
 * place, so no module has to remember which unit it is holding. This mirrors
 * `src/lib/insurance/money.ts`.
 */

export const PAISE_PER_RUPEE = 100;

/** Whole rupees → paise. Used when reading a stored `...Inr` column for display. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

/** Paise → whole rupees, for writing a `...Inr` column. Rounds to the nearest rupee. */
export function paiseToRupees(paise: number): number {
  return Math.round(paise / PAISE_PER_RUPEE);
}

const inrTwoDecimals = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** `₹1,250.00`. Returns an em dash for a value that is not a finite number. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return "—";
  return inrTwoDecimals.format(paise / PAISE_PER_RUPEE);
}

/** Whole rupees without decimals, for a figure read back from a `...Inr` column. */
export function formatRupees(rupees: number | null | undefined): string {
  if (rupees === null || rupees === undefined || !Number.isFinite(rupees)) return "—";
  return inrWhole.format(rupees);
}

export function formatAtLeastRupees(rupees: number | null | undefined): string {
  if (rupees === null || rupees === undefined || !Number.isFinite(rupees)) return "Price not published";
  return `From ${inrWhole.format(rupees)}`;
}
