/**
 * Money helpers for the pharmacy storefront.
 *
 * CLIENT-SAFE: no `server-only`, no environment access, no database import, so
 * a Client Component can format the same integers the server froze onto an
 * order. Nothing here computes a price the server did not send: the browser
 * only ever formats a paise value it was given.
 *
 * Every value on this module is an integer number of paise. There is no
 * floating-point currency anywhere — `formatPaise` splits the integer into
 * rupees and paise rather than dividing a float, so ₹0.1 + ₹0.2 can never
 * render as ₹0.30000000000000004 and a rounded total can never drift from the
 * total the server charged.
 */

/** Formats whole paise as Indian rupees with two decimals, e.g. 4550 → "₹45.50". */
export function formatPaise(paise: number): string {
  const rounded = Math.round(paise);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  return `${sign}₹${rupees.toLocaleString("en-IN")}.${String(fraction).padStart(2, "0")}`;
}

/**
 * Parses a partner-typed rupee figure into paise.
 *
 * Accepts `45`, `45.5`, `45.50`, `₹45.50` and `1,499.00`. Rejects anything with
 * more than two decimals, a negative sign or stray characters, returning `null`
 * so the caller refuses the input instead of silently rounding it.
 */
export function parseRupeesToPaise(input: string): number | null {
  if (typeof input !== "string") return null;
  const cleaned = input.trim().replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [rupeesPart, fractionPart = ""] = cleaned.split(".");
  const rupees = Number.parseInt(rupeesPart, 10);
  const paise = Number.parseInt(fractionPart.padEnd(2, "0"), 10);
  const total = rupees * 100 + paise;
  return Number.isSafeInteger(total) ? total : null;
}

/**
 * Formats a basis-point tax rate as a percentage, e.g. 500 → "5%", 1250 → "12.5%".
 *
 * Basis points are the storage unit (500 = 5%) because a GST slab is a precise
 * ratio and `5.0` as a float invites the classic `0.05 * amount` rounding bug.
 */
export function formatTaxRateBps(bps: number): string {
  const rounded = Math.round(bps);
  const whole = Math.floor(rounded / 100);
  const remainder = rounded % 100;
  if (remainder === 0) return `${whole}%`;
  return `${whole}.${String(remainder).padStart(2, "0").replace(/0+$/, "")}%`;
}

/** Basis points of a paise amount, rounded to the nearest paise. */
export function percentageOf(amountPaise: number, bps: number): number {
  return Math.round((amountPaise * bps) / 10000);
}
