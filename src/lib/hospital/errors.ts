import "server-only";

import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

/**
 * Shared result vocabulary for the hospital workspace.
 *
 * Every hospital service returns the same discriminated union shape, so a route
 * handler or a server action can turn a failure into a message without knowing
 * which module produced it:
 *
 * ```ts
 * const result = await registerOpdVisit(context, input);
 * if (!result.ok) return { error: result.message };
 * ```
 *
 * Nothing here throws for an expected condition. A bed that is already taken, a
 * quantity that exceeds stock and a discharge that is out of order are all
 * ordinary outcomes that the caller has to render, so they are returned rather
 * than thrown. The one exception is a tenant mismatch, which
 * `assertHospitalScope` throws, because by the time that fires the request was
 * already illegitimate.
 */

export type HospitalErrorCode =
  // Identity and lookup
  | "not_found"
  | "duplicate"
  | "validation"
  // Tenant
  | "tenant_mismatch"
  | "no_membership"
  // Workflow
  | "invalid_transition"
  | "conflict"
  | "already_finalised"
  | "not_finalised"
  | "separation_of_duties"
  // Inventory
  | "insufficient_stock"
  | "item_expired"
  | "duplicate_dispense"
  // Money
  | "invoice_not_open"
  | "overpayment"
  | "refund_exceeds_payment"
  | "no_charge_items";

export class HospitalFailure extends Error {
  readonly code: HospitalErrorCode;

  constructor(code: HospitalErrorCode, message: string) {
    super(message);
    this.name = "HospitalFailure";
    this.code = code;
  }
}

export type HospitalResult<T> = { ok: true; data: T } | { ok: false; code: HospitalErrorCode; message: string };

export function hospitalOk<T>(data: T): HospitalResult<T> {
  return { ok: true, data };
}

export function hospitalFail<T = never>(code: HospitalErrorCode, message: string): HospitalResult<T> {
  return { ok: false, code, message };
}

/**
 * Translates a Prisma unique-constraint violation into a typed conflict.
 *
 * The partial unique index that keeps one live admission per bed
 * (`Admission_bedId_active_key`) raises exactly this, so the service layer can
 * return "that bed was just taken" instead of a 500 when two requests race.
 */
export function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  if (!constraintName) return true;
  const target = error.meta?.target;
  const targets = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : [];
  return targets.some((entry) => entry.includes(constraintName));
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomReferenceBody(length = 6): string {
  const bytes = randomBytes(length);
  let body = "";
  for (const byte of bytes) body += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return body;
}

/** Reference prefixes, one per record type, so a reference is self-describing. */
export const HOSPITAL_REFERENCE_PREFIX = {
  mrn: "ORX-MR",
  admission: "ORX-IP",
  opdVisit: "ORX-OP",
  invoice: "ORX-INV",
  dispense: "ORX-DSP",
  labOrder: "ORX-HL",
  emergency: "ORX-ER",
  purchaseOrder: "ORX-PO",
  complaint: "ORX-CMP",
} as const;

export type HospitalReferenceKind = keyof typeof HOSPITAL_REFERENCE_PREFIX;

/** e.g. `ORX-IP-4M9K2P`. Six base32 characters, like the diagnostic references. */
export function generateHospitalReference(kind: HospitalReferenceKind): string {
  return `${HOSPITAL_REFERENCE_PREFIX[kind]}-${randomReferenceBody()}`;
}

/**
 * Allocates a reference that is unique inside one hospital.
 *
 * Uniqueness is per hospital rather than global, so two hospitals can never
 * collide over a reference and neither has to know about the other's numbering.
 */
export async function reserveHospitalReference(
  tx: Prisma.TransactionClient,
  kind: HospitalReferenceKind,
  exists: (candidate: string) => Promise<{ id: string } | null>,
): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateHospitalReference(kind);
    if (!(await exists(candidate))) return candidate;
  }
  throw new HospitalFailure("conflict", "A reference could not be allocated. Please try again.");
}

/** Sequential-looking numbers (MRN, invoice number) scoped to one hospital. */
export function formatScopedSequence(prefix: string, sequence: number, width = 5): string {
  return `${prefix}-${String(sequence).padStart(width, "0")}`;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Recomputes a line total from a quantity, a unit price and a tax rate.
 *
 * Called on the server for every line, always. A total that arrives from the
 * client is discarded and recomputed, so a tampered request cannot make an
 * invoice cheaper. Tax is rounded half-up per line, then summed, so the printed
 * invoice adds up to the stored total exactly.
 */
export function computeLineTotal(input: { quantity: number; unitPricePaise: number; taxRateBp: number }) {
  const netPaise = input.quantity * input.unitPricePaise;
  const taxPaise = Math.round((netPaise * input.taxRateBp) / 10_000);
  return { netPaise, taxPaise, totalPaise: netPaise + taxPaise };
}

export function sumPaise(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** UTC midnight of the day a timestamp falls in, for per-day sequence scoping. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
