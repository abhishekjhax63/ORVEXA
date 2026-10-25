import { describe, expect, it } from "vitest";

import {
  SANDBOX_PAYMENT_OUTCOMES,
  cartAddItemSchema,
  cartUpdateItemSchema,
  checkoutSchema,
  indianPhoneSchema,
  indianPostalCodeSchema,
  inventoryAdjustSchema,
  offerUpsertSchema,
  orderDecisionSchema,
  orderReferenceSchema,
  paiseSchema,
  partnerProfileSchema,
  prescriptionReviewSchema,
  refundRequestSchema,
  sandboxOutcomeSchema,
} from "@/lib/validation/pharmacy";

describe("cartAddItemSchema", () => {
  it("parses a minimal payload and defaults quantity to 1", () => {
    const result = cartAddItemSchema.safeParse({ offerId: "offer_1" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantity).toBe(1);
  });

  it("fails without an offerId", () => {
    expect(cartAddItemSchema.safeParse({ quantity: 2 }).success).toBe(false);
  });

  it("fails for a quantity below one or above 999", () => {
    expect(cartAddItemSchema.safeParse({ offerId: "offer_1", quantity: 0 }).success).toBe(false);
    expect(cartAddItemSchema.safeParse({ offerId: "offer_1", quantity: 1000 }).success).toBe(false);
  });
});

describe("cartUpdateItemSchema", () => {
  it("fails for a non-integer quantity", () => {
    expect(cartUpdateItemSchema.safeParse({ offerId: "offer_1", quantity: 1.5 }).success).toBe(false);
  });
});

describe("checkoutSchema", () => {
  it("parses a valid checkout payload", () => {
    expect(checkoutSchema.safeParse({ addressId: "addr_1", idempotencyKey: "key_12345678" }).success).toBe(true);
  });

  it("fails without an idempotency key", () => {
    expect(checkoutSchema.safeParse({ addressId: "addr_1" }).success).toBe(false);
  });

  it("fails for a short idempotency key", () => {
    expect(checkoutSchema.safeParse({ addressId: "addr_1", idempotencyKey: "short" }).success).toBe(false);
  });
});

describe("indianPhoneSchema", () => {
  it("accepts the shapes Indian users type", () => {
    expect(indianPhoneSchema.safeParse("+91 98450 12093").success).toBe(true);
    expect(indianPhoneSchema.safeParse("9845012093").success).toBe(true);
    expect(indianPhoneSchema.safeParse("09845012093").success).toBe(true);
  });

  it("rejects a number that cannot be dialled", () => {
    expect(indianPhoneSchema.safeParse("12345").success).toBe(false);
    expect(indianPhoneSchema.safeParse("1234567890").success).toBe(false);
  });
});

describe("indianPostalCodeSchema", () => {
  it("accepts a six-digit PIN", () => {
    expect(indianPostalCodeSchema.safeParse("560038").success).toBe(true);
  });

  it("rejects a PIN starting with zero or of the wrong length", () => {
    expect(indianPostalCodeSchema.safeParse("012345").success).toBe(false);
    expect(indianPostalCodeSchema.safeParse("56003").success).toBe(false);
  });
});

describe("orderReferenceSchema", () => {
  it("accepts a valid order reference and uppercases it", () => {
    const result = orderReferenceSchema.safeParse("orx-ph-7k2m4q");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("ORX-PH-7K2M4Q");
  });

  it("rejects a malformed reference", () => {
    expect(orderReferenceSchema.safeParse("ORX-PH-000000").success).toBe(false);
  });
});

describe("paiseSchema", () => {
  it("accepts a whole non-negative amount", () => {
    expect(paiseSchema.safeParse(100).success).toBe(true);
  });

  it("rejects a negative or fractional amount", () => {
    expect(paiseSchema.safeParse(-1).success).toBe(false);
    expect(paiseSchema.safeParse(1.5).success).toBe(false);
  });
});

describe("inventoryAdjustSchema", () => {
  it("parses a valid adjustment", () => {
    expect(inventoryAdjustSchema.safeParse({ offerId: "offer_1", delta: 10, reason: "RESTOCK" }).success).toBe(true);
  });

  it("rejects a zero delta", () => {
    expect(inventoryAdjustSchema.safeParse({ offerId: "offer_1", delta: 0, reason: "RESTOCK" }).success).toBe(false);
  });

  it("rejects a reason a partner may not choose (SALE)", () => {
    expect(inventoryAdjustSchema.safeParse({ offerId: "offer_1", delta: 1, reason: "SALE" }).success).toBe(false);
  });
});

describe("offerUpsertSchema", () => {
  it("parses a valid offer and defaults the flags", () => {
    const result = offerUpsertSchema.safeParse({ productId: "prod_1", priceRupees: "45.50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pricePublished).toBe(false);
      expect(result.data.isActive).toBe(true);
    }
  });

  it("rejects a tax rate above 5000 basis points", () => {
    expect(offerUpsertSchema.safeParse({ productId: "prod_1", priceRupees: "45.50", taxRateBps: 5001 }).success).toBe(false);
  });
});

describe("orderDecisionSchema", () => {
  it("requires a reason when rejecting an order", () => {
    expect(orderDecisionSchema.safeParse({ orderId: "o1", decision: "REJECT" }).success).toBe(false);
    expect(orderDecisionSchema.safeParse({ orderId: "o1", decision: "REJECT", reason: "Out of stock" }).success).toBe(true);
  });

  it("allows accepting without a reason", () => {
    expect(orderDecisionSchema.safeParse({ orderId: "o1", decision: "ACCEPT" }).success).toBe(true);
  });
});

describe("refundRequestSchema", () => {
  it("requires a reason of at least four characters", () => {
    expect(refundRequestSchema.safeParse({ orderId: "o1", reason: "no" }).success).toBe(false);
    expect(refundRequestSchema.safeParse({ orderId: "o1", reason: "Damaged" }).success).toBe(true);
  });
});

describe("prescriptionReviewSchema", () => {
  it("parses a valid decision with notes", () => {
    expect(
      prescriptionReviewSchema.safeParse({
        prescriptionId: "p1",
        decision: "APPROVED",
        notes: "Looks valid, all required fields are present.",
      }).success,
    ).toBe(true);
  });

  it("rejects short notes and an unknown decision", () => {
    expect(
      prescriptionReviewSchema.safeParse({ prescriptionId: "p1", decision: "APPROVED", notes: "ok" }).success,
    ).toBe(false);
    expect(
      prescriptionReviewSchema.safeParse({
        prescriptionId: "p1",
        decision: "MAYBE",
        notes: "Looks valid, all required fields are present.",
      }).success,
    ).toBe(false);
  });
});

describe("sandboxOutcomeSchema", () => {
  it("parses a valid sandbox outcome", () => {
    expect(
      sandboxOutcomeSchema.safeParse({
        providerOrderId: "po_1",
        providerPaymentId: "pp_1",
        amountPaise: 4550,
        outcome: SANDBOX_PAYMENT_OUTCOMES[0],
        signature: "sig",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-positive amount and an unknown outcome", () => {
    expect(
      sandboxOutcomeSchema.safeParse({
        providerOrderId: "po_1",
        providerPaymentId: "pp_1",
        amountPaise: 0,
        outcome: "captured",
        signature: "sig",
      }).success,
    ).toBe(false);
    expect(
      sandboxOutcomeSchema.safeParse({
        providerOrderId: "po_1",
        providerPaymentId: "pp_1",
        amountPaise: 100,
        outcome: "refunded",
        signature: "sig",
      }).success,
    ).toBe(false);
  });
});

describe("partnerProfileSchema", () => {
  it("parses a minimal partner profile", () => {
    expect(partnerProfileSchema.safeParse({ legalName: "Acme Pharmacy" }).success).toBe(true);
  });

  it("fails without the required legal name", () => {
    expect(partnerProfileSchema.safeParse({ tradeName: "Acme" }).success).toBe(false);
  });
});
