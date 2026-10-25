import { describe, expect, it } from "vitest";

import { formatPaise, formatTaxRateBps, parseRupeesToPaise, percentageOf } from "@/lib/pharmacy/money";

describe("formatPaise", () => {
  it("formats whole paise as rupees with two decimals", () => {
    expect(formatPaise(4550)).toBe("₹45.50");
  });

  it("formats zero", () => {
    expect(formatPaise(0)).toBe("₹0.00");
  });

  it("pads a single-digit paise fraction", () => {
    expect(formatPaise(5)).toBe("₹0.05");
  });

  it("groups large rupee values using Indian digit grouping", () => {
    // 123456789 paise = ₹12,34,567.89
    expect(formatPaise(123456789)).toBe("₹12,34,567.89");
  });

  it("keeps the sign for a negative value", () => {
    expect(formatPaise(-4550)).toBe("-₹45.50");
  });
});

describe("parseRupeesToPaise", () => {
  it("accepts the shapes a partner types", () => {
    expect(parseRupeesToPaise("45")).toBe(4500);
    expect(parseRupeesToPaise("45.5")).toBe(4550);
    expect(parseRupeesToPaise("45.50")).toBe(4550);
    expect(parseRupeesToPaise("₹45.50")).toBe(4550);
    expect(parseRupeesToPaise("1,499.00")).toBe(149900);
  });

  it("rejects more than two decimals", () => {
    expect(parseRupeesToPaise("45.123")).toBeNull();
  });

  it("rejects a negative sign", () => {
    expect(parseRupeesToPaise("-45")).toBeNull();
  });

  it("rejects letters", () => {
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(parseRupeesToPaise("45abc")).toBeNull();
  });

  it("rejects an empty or whitespace-only string", () => {
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("   ")).toBeNull();
  });
});

describe("formatTaxRateBps", () => {
  it("formats basis points as a percentage", () => {
    expect(formatTaxRateBps(500)).toBe("5%");
  });

  it("formats a fractional percentage", () => {
    expect(formatTaxRateBps(1250)).toBe("12.5%");
  });

  it("formats zero", () => {
    expect(formatTaxRateBps(0)).toBe("0%");
  });
});

describe("percentageOf", () => {
  it("returns the exact basis-points amount when it is whole", () => {
    // 10000 paise at 500 bps (5%) is 500 paise.
    expect(percentageOf(10000, 500)).toBe(500);
  });

  it("rounds to the nearest paise", () => {
    // 333 * 500 / 10000 = 16.65 paise, which rounds up to 17.
    expect(percentageOf(333, 500)).toBe(17);
    // 101 * 500 / 10000 = 5.05 paise, which rounds down to 5.
    expect(percentageOf(101, 500)).toBe(5);
  });
});
