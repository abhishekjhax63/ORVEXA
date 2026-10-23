/**
 * Money helpers for the insurance surface.
 *
 * This module is deliberately client-safe — no `server-only`, no environment
 * access, no Prisma value import — because every coverage figure and claim
 * amount is rendered in the browser and the formatting must be identical on
 * both sides of the boundary.
 *
 * ## The two units, and why
 *
 * Money reaches the server as **paise** (the smallest whole unit, so no value is
 * ever a rounded float), and it is stored in the database as **whole rupees** in
 * the columns named `...Inr`. Those columns are `Int`, and an insurer's product
 * can carry a sum insured of several crore: `₹2,00,00,000` is 2,000,000,000 paise,
 * which overflows a 32-bit integer, while the same figure in whole rupees fits
 * comfortably. The conversion therefore lives here, in one place, so no module
 * has to remember which unit it is holding.
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

/** `₹1,85,000.00`. Returns an em dash for a value that is not a finite number. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return "—";
  return inrTwoDecimals.format(paise / PAISE_PER_RUPEE);
}

/** Whole rupees without decimals, for a figure read back from a `...Inr` column. */
export function formatRupees(rupees: number | null | undefined): string {
  if (rupees === null || rupees === undefined || !Number.isFinite(rupees)) return "—";
  return inrWhole.format(rupees);
}

/**
 * A sum insured, written the way Indian policies are quoted: `₹5 lakh`,
 * `₹1 crore`, `₹1.5 crore`. Falls back to the plain rupee format below a lakh.
 */
export function formatSumInsured(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return "—";
  const rupees = paise / PAISE_PER_RUPEE;

  if (rupees >= 1_00_00_000) {
    const crore = rupees / 1_00_00_000;
    return `₹${trimTrailingZero(crore)} crore`;
  }
  if (rupees >= 1_00_000) {
    const lakh = rupees / 1_00_000;
    return `₹${trimTrailingZero(lakh)} lakh`;
  }
  return inrWhole.format(Math.round(rupees));
}

function trimTrailingZero(value: number): string {
  const fixed = value.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/**
 * A share of a sum insured, in basis points.
 *
 * `percentOf(sumInsuredPaise, 2000)` is 20%, returned **in paise**. Basis points
 * are used rather than a float percentage so a co-payment or sub-limit never
 * suffers a rounding surprise.
 */
export function percentOf(sumInsuredPaise: number, bps: number): number {
  if (!Number.isFinite(sumInsuredPaise) || !Number.isFinite(bps)) return 0;
  return Math.round((sumInsuredPaise * bps) / 10_000);
}

/** `2000` → `20%`; `1250` → `12.5%`. */
export function formatBpsAsPercent(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps)) return "—";
  const percent = bps / 100;
  return `${trimTrailingZero(percent)}%`;
}

/**
 * A coarse band used only for duplicate suppression. Two submissions of the same
 * policy, hospital and admission date whose claimed amounts fall in the same
 * band are treated as the same claim; the band is deliberately wide so that a
 * second attempt typed with a slightly different number is still caught.
 */
export function amountBandRupees(rupees: number): string {
  if (!Number.isFinite(rupees) || rupees <= 0) return "unknown";
  const band = 10_000;
  return `${Math.floor(rupees / band) * band}`;
}
