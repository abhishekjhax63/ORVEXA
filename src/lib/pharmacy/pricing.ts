import "server-only";

import type { MedicineDosageForm, MedicineScheduleClass } from "@prisma/client";

import { percentageOf } from "@/lib/pharmacy/money";

/**
 * Order arithmetic.
 *
 * These are pure functions with no database access, so the exact same code
 * computes the cart preview, the checkout total and the frozen invoice. Every
 * value is an integer number of paise; a float never enters the money path.
 *
 * ## The rounding rule
 *
 * Tax is computed **per line** and rounded to the nearest paise:
 *
 *     lineTaxPaise = Math.round(lineSubtotalPaise * taxRateBps / 10000)
 *
 * Rounding per line (rather than once on the whole order) is the rule Indian
 * GST invoices are checked against: the tax printed against a line is the tax
 * charged for that line, and the invoice total is the sum of what is printed.
 * A line with no tax rate is charged no tax.
 *
 * The order total is then exact integer arithmetic — it is never re-rounded:
 *
 *     total = itemsSubtotal - discount + deliveryFee + tax
 *
 * `assertTotalsReconcile` re-derives the total from the parts and throws if the
 * two disagree, so a future edit that starts rounding somewhere cannot quietly
 * ship a mismatch between the charge and the invoice.
 */

export type OrderLineInput = {
  offerId: string;
  productId: string;
  productName: string;
  genericName: string;
  strengthLabel: string;
  dosageForm: MedicineDosageForm;
  packSizeLabel: string;
  manufacturer: string | null;
  scheduleClass: MedicineScheduleClass;
  prescriptionRequired: boolean;
  isControlled: boolean;
  pharmacyName: string;
  unitPricePaise: number;
  quantity: number;
  /** GST in basis points. `null` means no tax is charged on this line. */
  taxRateBps: number | null;
};

export type OrderLineResult = OrderLineInput & {
  lineSubtotalPaise: number;
  lineTaxPaise: number;
  lineTotalPaise: number;
};

export type OrderTotals = {
  lineResults: OrderLineResult[];
  itemsSubtotalInPaise: number;
  discountInPaise: number;
  deliveryFeeInPaise: number;
  taxInPaise: number;
  totalInPaise: number;
  discountCode: string | null;
};

export type ComputeOrderTotalsInput = {
  lines: OrderLineInput[];
  deliveryFeeInPaise: number;
  discountInPaise: number;
  discountCode: string | null;
};

/** Rejects a money value that is not a non-negative whole number of paise. */
function assertPaise(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative whole number of paise, received ${value}.`);
  }
}

export function computeOrderTotals(input: ComputeOrderTotalsInput): OrderTotals {
  assertPaise(input.deliveryFeeInPaise, "deliveryFeeInPaise");
  assertPaise(input.discountInPaise, "discountInPaise");

  const lineResults: OrderLineResult[] = input.lines.map((line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new Error(`Line quantity must be a whole number of at least one, received ${line.quantity}.`);
    }
    assertPaise(line.unitPricePaise, "unitPricePaise");

    const lineSubtotalPaise = line.unitPricePaise * line.quantity;
    const lineTaxPaise = line.taxRateBps === null ? 0 : percentageOf(lineSubtotalPaise, line.taxRateBps);
    return {
      ...line,
      lineSubtotalPaise,
      lineTaxPaise,
      lineTotalPaise: lineSubtotalPaise + lineTaxPaise,
    };
  });

  const itemsSubtotalInPaise = lineResults.reduce((sum, line) => sum + line.lineSubtotalPaise, 0);
  const taxInPaise = lineResults.reduce((sum, line) => sum + line.lineTaxPaise, 0);

  // A discount can never exceed the items it discounts: a "100% off" voucher on
  // a ₹0 cart must not turn into a negative charge and a payment gateway
  // rejection.
  const discountInPaise = Math.min(input.discountInPaise, itemsSubtotalInPaise);

  const totalInPaise = itemsSubtotalInPaise - discountInPaise + input.deliveryFeeInPaise + taxInPaise;

  return {
    lineResults,
    itemsSubtotalInPaise,
    discountInPaise,
    deliveryFeeInPaise: input.deliveryFeeInPaise,
    taxInPaise,
    totalInPaise,
    discountCode: input.discountCode,
  };
}

/** Throws if the stored parts do not add up to the stored total. */
export function assertTotalsReconcile(totals: {
  itemsSubtotalInPaise: number;
  discountInPaise: number;
  deliveryFeeInPaise: number;
  taxInPaise: number;
  totalInPaise: number;
}): void {
  const expected =
    totals.itemsSubtotalInPaise - totals.discountInPaise + totals.deliveryFeeInPaise + totals.taxInPaise;
  if (expected !== totals.totalInPaise) {
    throw new Error(
      `Order totals do not reconcile: parts sum to ${expected} paise but total is ${totals.totalInPaise} paise.`,
    );
  }
}

/**
 * The delivery-fee rule, in one place.
 *
 * This is an **estimate** shown at checkout, not a courier's quote. No delivery
 * partner is integrated, so the platform cannot promise a real price; it shows
 * a transparent, configurable estimate and labels it as one. Editing this
 * constant is the only place delivery pricing changes.
 */
export const DELIVERY_PRICING = {
  /** The fee charged below the free-delivery threshold. */
  baseFeeInPaise: 4900,
  /** Orders at or above this subtotal are delivered free. */
  freeAboveSubtotalInPaise: 50000,
  /** Added when the partner quotes a long delivery window, in whole rupees/100. */
  longEtaSurchargeInPaise: 2900,
  /** A window above this many minutes attracts the long-window surcharge. */
  longEtaThresholdMinutes: 24 * 60,
} as const;

export function estimateDeliveryFeeInPaise(input: {
  subtotalInPaise: number;
  deliveryEtaMinutes: number | null;
}): number {
  assertPaise(input.subtotalInPaise, "subtotalInPaise");

  if (input.subtotalInPaise <= 0) return 0;
  if (input.subtotalInPaise >= DELIVERY_PRICING.freeAboveSubtotalInPaise) return 0;

  const longEta =
    input.deliveryEtaMinutes !== null && input.deliveryEtaMinutes > DELIVERY_PRICING.longEtaThresholdMinutes;

  return DELIVERY_PRICING.baseFeeInPaise + (longEta ? DELIVERY_PRICING.longEtaSurchargeInPaise : 0);
}
