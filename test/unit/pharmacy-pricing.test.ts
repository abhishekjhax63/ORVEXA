import { describe, expect, it } from "vitest";

import {
  DELIVERY_PRICING,
  assertTotalsReconcile,
  computeOrderTotals,
  estimateDeliveryFeeInPaise,
  type OrderLineInput,
} from "@/lib/pharmacy/pricing";

/** A valid order line; override only the field a test cares about. */
function line(overrides: Partial<OrderLineInput> = {}): OrderLineInput {
  return {
    offerId: "offer-1",
    productId: "product-1",
    productName: "Paracetamol 500mg",
    genericName: "Paracetamol",
    strengthLabel: "500 mg",
    dosageForm: "TABLET",
    packSizeLabel: "15 tablets",
    manufacturer: "Acme",
    scheduleClass: "OTC",
    prescriptionRequired: false,
    isControlled: false,
    pharmacyName: "Acme Pharmacy",
    unitPricePaise: 1000,
    quantity: 1,
    taxRateBps: 500,
    ...overrides,
  };
}

describe("computeOrderTotals", () => {
  it("rounds tax per line, not on the order sum", () => {
    // Each line: 333 * 5% = 16.65 -> 17 paise, so 34 in total.
    // Rounding the sum instead (666 * 5% = 33.3 -> 33) would undercharge by one paise.
    const totals = computeOrderTotals({
      lines: [line({ offerId: "a", unitPricePaise: 333 }), line({ offerId: "b", unitPricePaise: 333 })],
      deliveryFeeInPaise: 0,
      discountInPaise: 0,
      discountCode: null,
    });

    expect(totals.lineResults.map((result) => result.lineTaxPaise)).toEqual([17, 17]);
    expect(totals.taxInPaise).toBe(34);
    expect(totals.taxInPaise).not.toBe(Math.round((666 * 500) / 10000));
  });

  it("computes the total as itemsSubtotal - discount + deliveryFee + tax, exactly", () => {
    const totals = computeOrderTotals({
      lines: [line({ unitPricePaise: 1000, quantity: 2, taxRateBps: 500 })],
      deliveryFeeInPaise: 4900,
      discountInPaise: 500,
      discountCode: "SAVE5",
    });

    expect(totals.itemsSubtotalInPaise).toBe(2000);
    expect(totals.taxInPaise).toBe(100); // 2000 paise at 5%
    expect(totals.totalInPaise).toBe(
      totals.itemsSubtotalInPaise - totals.discountInPaise + totals.deliveryFeeInPaise + totals.taxInPaise,
    );
    expect(totals.totalInPaise).toBe(2000 - 500 + 4900 + 100);
    expect(totals.discountCode).toBe("SAVE5");
  });

  it("charges no tax on a line whose taxRateBps is null", () => {
    const totals = computeOrderTotals({
      lines: [line({ taxRateBps: null })],
      deliveryFeeInPaise: 0,
      discountInPaise: 0,
      discountCode: null,
    });

    expect(totals.lineResults[0].lineTaxPaise).toBe(0);
    expect(totals.taxInPaise).toBe(0);
  });

  it("clamps a discount larger than the items subtotal to the subtotal", () => {
    const totals = computeOrderTotals({
      lines: [line({ unitPricePaise: 1000, quantity: 1, taxRateBps: null })],
      deliveryFeeInPaise: 0,
      discountInPaise: 5000,
      discountCode: "FREE",
    });

    expect(totals.discountInPaise).toBe(1000);
    expect(totals.totalInPaise).toBe(0);
    expect(totals.totalInPaise).toBeGreaterThanOrEqual(0);
  });

  it("throws for a non-integer unit price", () => {
    expect(() =>
      computeOrderTotals({
        lines: [line({ unitPricePaise: 10.5 })],
        deliveryFeeInPaise: 0,
        discountInPaise: 0,
        discountCode: null,
      }),
    ).toThrow();
  });

  it("throws for a negative unit price", () => {
    expect(() =>
      computeOrderTotals({
        lines: [line({ unitPricePaise: -100 })],
        deliveryFeeInPaise: 0,
        discountInPaise: 0,
        discountCode: null,
      }),
    ).toThrow();
  });

  it("throws for a quantity below one", () => {
    for (const quantity of [0, -1, 1.5]) {
      expect(() =>
        computeOrderTotals({
          lines: [line({ quantity })],
          deliveryFeeInPaise: 0,
          discountInPaise: 0,
          discountCode: null,
        }),
      ).toThrow();
    }
  });
});

describe("assertTotalsReconcile", () => {
  it("resolves for a reconciled object", () => {
    // 1000 - 100 + 50 + 45 = 995
    expect(() =>
      assertTotalsReconcile({
        itemsSubtotalInPaise: 1000,
        discountInPaise: 100,
        deliveryFeeInPaise: 50,
        taxInPaise: 45,
        totalInPaise: 995,
      }),
    ).not.toThrow();
  });

  it("throws when the total is off by one paise", () => {
    expect(() =>
      assertTotalsReconcile({
        itemsSubtotalInPaise: 1000,
        discountInPaise: 100,
        deliveryFeeInPaise: 50,
        taxInPaise: 45,
        totalInPaise: 996,
      }),
    ).toThrow();
  });
});

describe("estimateDeliveryFeeInPaise", () => {
  it("is zero for a zero subtotal", () => {
    expect(estimateDeliveryFeeInPaise({ subtotalInPaise: 0, deliveryEtaMinutes: null })).toBe(0);
  });

  it("is zero at and above the free-delivery threshold", () => {
    expect(
      estimateDeliveryFeeInPaise({
        subtotalInPaise: DELIVERY_PRICING.freeAboveSubtotalInPaise,
        deliveryEtaMinutes: null,
      }),
    ).toBe(0);
    expect(
      estimateDeliveryFeeInPaise({
        subtotalInPaise: DELIVERY_PRICING.freeAboveSubtotalInPaise + 10000,
        deliveryEtaMinutes: null,
      }),
    ).toBe(0);
  });

  it("charges the base fee below the threshold", () => {
    expect(estimateDeliveryFeeInPaise({ subtotalInPaise: 10000, deliveryEtaMinutes: null })).toBe(
      DELIVERY_PRICING.baseFeeInPaise,
    );
  });

  it("does not add the long-ETA surcharge at exactly the threshold", () => {
    expect(
      estimateDeliveryFeeInPaise({
        subtotalInPaise: 10000,
        deliveryEtaMinutes: DELIVERY_PRICING.longEtaThresholdMinutes,
      }),
    ).toBe(DELIVERY_PRICING.baseFeeInPaise);
  });

  it("adds the long-ETA surcharge only when the ETA strictly exceeds the threshold", () => {
    expect(
      estimateDeliveryFeeInPaise({
        subtotalInPaise: 10000,
        deliveryEtaMinutes: DELIVERY_PRICING.longEtaThresholdMinutes + 1,
      }),
    ).toBe(DELIVERY_PRICING.baseFeeInPaise + DELIVERY_PRICING.longEtaSurchargeInPaise);
  });
});
