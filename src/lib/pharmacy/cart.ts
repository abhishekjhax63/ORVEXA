import "server-only";

import type { MedicineDosageForm, MedicineScheduleClass, MedicineStockStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { computeOrderTotals, estimateDeliveryFeeInPaise, type OrderLineInput } from "@/lib/pharmacy/pricing";
import { isScheduleClassListable } from "@/lib/pharmacy/labels";
import { recordAuditEvent } from "@/lib/security/audit";

/**
 * The medicine basket.
 *
 * ## One pharmacy per order
 *
 * An order is fulfilled by exactly one pharmacy, because a single invoice, one
 * reservation of stock and one delivery acknowledgement cannot span two
 * dispensers. When a customer adds a medicine sold by a different pharmacy, this
 * module returns a typed `different_pharmacy` conflict. It never silently drops
 * the existing lines and never silently drops the new one — the UI has to show
 * the customer both options and let them choose.
 *
 * ## Nothing here trusts the client
 *
 * `getCartView` re-reads every price and stock level from the database on each
 * call. The client only ever names an offer and a quantity; it never sends a
 * price, a max-per-order or a total.
 */

export type CartLineView = {
  itemId: string;
  offerId: string;
  productId: string;
  slug: string;
  brandName: string;
  genericName: string;
  strengthLabel: string;
  dosageForm: MedicineDosageForm;
  packSizeLabel: string;
  manufacturer: string | null;
  scheduleClass: MedicineScheduleClass;
  prescriptionRequired: boolean;
  isControlled: boolean;
  pharmacyProfileId: string;
  pharmacyName: string;
  /** Null when the partner has not published a price. */
  unitPricePaise: number | null;
  maxPerOrder: number | null;
  stockStatus: MedicineStockStatus;
  stockQuantity: number | null;
  deliveryEtaMinutes: number | null;
  taxRateBps: number | null;
  quantity: number;
  lineSubtotalPaise: number;
  lineTaxPaise: number;
  lineTotalPaise: number;
  /** Reasons this line cannot be ordered as-is. Empty means it is orderable. */
  problems: string[];
  orderable: boolean;
};

export type CartView = {
  cartId: string;
  pharmacyProfileId: string | null;
  pharmacyName: string | null;
  lines: CartLineView[];
  itemCount: number;
  requiresPrescription: boolean;
  hasControlled: boolean;
  deliveryEstimateMinutes: number | null;
  totals: {
    itemsSubtotalInPaise: number;
    discountInPaise: number;
    deliveryFeeInPaise: number;
    taxInPaise: number;
    totalInPaise: number;
  };
  canCheckout: boolean;
  checkoutBlockers: string[];
};

export type CartError =
  | { kind: "different_pharmacy"; message: string; currentPharmacyName: string; incomingPharmacyName: string }
  | { kind: "not_orderable"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "quantity"; message: string };

export type CartMutation = { ok: true; view: CartView } | { ok: false; error: CartError };

// ---------------------------------------------------------------------------
// Cart lifecycle
// ---------------------------------------------------------------------------

/**
 * Returns the caller's active basket, resetting a converted one.
 *
 * `PharmacyCart.ownerUserId` is unique, so a customer keeps a single cart row
 * for their lifetime. At checkout it is marked `CONVERTED` rather than deleted
 * (so an abandoned basket can be told from one that produced an order); the
 * next add reuses that row with its items cleared.
 */
export async function getOrCreateCart(userId: string) {
  const existing = await prisma.pharmacyCart.findUnique({ where: { ownerUserId: userId } });
  if (existing && existing.status === "ACTIVE") return existing;

  if (existing) {
    const [, updated] = await prisma.$transaction([
      prisma.pharmacyCartItem.deleteMany({ where: { cartId: existing.id } }),
      prisma.pharmacyCart.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", convertedOrderId: null },
      }),
    ]);
    return updated;
  }

  return prisma.pharmacyCart.create({ data: { ownerUserId: userId } });
}

const CART_LINE_SELECT = {
  id: true,
  quantity: true,
  offer: {
    select: {
      id: true,
      productId: true,
      pharmacyProfileId: true,
      priceInPaise: true,
      pricePublished: true,
      taxRateBps: true,
      stockStatus: true,
      stockQuantity: true,
      maxPerOrder: true,
      deliveryEtaMinutes: true,
      isActive: true,
      product: {
        select: {
          id: true,
          slug: true,
          brandName: true,
          genericName: true,
          strengthLabel: true,
          dosageForm: true,
          packSizeLabel: true,
          manufacturer: true,
          scheduleClass: true,
          prescriptionRequired: true,
          isControlled: true,
          listable: true,
          deletedAt: true,
        },
      },
      pharmacy: {
        select: {
          id: true,
          tradeName: true,
          legalName: true,
          verificationStatus: true,
          status: true,
          canDispenseControlledMedicines: true,
        },
      },
    },
  },
} as const;

/** Loads the cart rows and turns each into a line with live problems and money. */
export async function getCartView(userId: string): Promise<CartView> {
  const cart = await getOrCreateCart(userId);
  const items = await prisma.pharmacyCartItem.findMany({
    where: { cartId: cart.id },
    orderBy: { createdAt: "asc" },
    select: CART_LINE_SELECT,
  });

  const orderLines: OrderLineInput[] = [];
  const lines: CartLineView[] = [];
  let pharmacyProfileId: string | null = null;
  let pharmacyName: string | null = null;
  let requiresPrescription = false;
  let hasControlled = false;
  let deliveryEstimateMinutes: number | null = null;

  for (const item of items) {
    const offer = item.offer;
    const product = offer.product;
    const pharmacyLive = offer.pharmacy.verificationStatus === "VERIFIED" && offer.pharmacy.status === "APPROVED";
    const name = offer.pharmacy.tradeName ?? offer.pharmacy.legalName;
    pharmacyProfileId ??= offer.pharmacyProfileId;
    pharmacyName ??= name;
    if (offer.deliveryEtaMinutes !== null) {
      deliveryEstimateMinutes = Math.max(deliveryEstimateMinutes ?? 0, offer.deliveryEtaMinutes);
    }

    const problems: string[] = [];
    if (!product.listable || product.deletedAt !== null || !isScheduleClassListable(product.scheduleClass)) {
      problems.push("This medicine cannot be sold on ORVEXA. Remove it from your cart.");
    }
    if (!offer.isActive) problems.push("This pharmacy has withdrawn this listing.");
    if (!pharmacyLive) problems.push("This pharmacy is not verified to sell on ORVEXA yet.");
    if (!offer.pricePublished) problems.push("Price on request — this pharmacy has not published a price, so it cannot be ordered.");
    if (offer.stockStatus === "OUT_OF_STOCK") problems.push("This pharmacy is out of stock.");
    if (offer.stockStatus === "DISCONTINUED") problems.push("This pharmacy has discontinued this medicine.");
    if (product.isControlled && !offer.pharmacy.canDispenseControlledMedicines) {
      problems.push("This pharmacy is not licensed to dispense controlled medicines.");
    }
    if (offer.maxPerOrder !== null && item.quantity > offer.maxPerOrder) {
      problems.push(`Only ${offer.maxPerOrder} can be ordered at a time. Adjust the quantity to continue.`);
    }

    const orderable = problems.length === 0;
    const unitPricePaise = offer.pricePublished ? offer.priceInPaise : null;

    const lineSubtotalPaise = 0;
    const lineTaxPaise = 0;
    const lineTotalPaise = 0;

    if (orderable && unitPricePaise !== null) {
      const lineInput: OrderLineInput = {
        offerId: offer.id,
        productId: product.id,
        productName: product.brandName,
        genericName: product.genericName,
        strengthLabel: product.strengthLabel,
        dosageForm: product.dosageForm,
        packSizeLabel: product.packSizeLabel,
        manufacturer: product.manufacturer,
        scheduleClass: product.scheduleClass,
        prescriptionRequired: product.prescriptionRequired,
        isControlled: product.isControlled,
        pharmacyName: name,
        unitPricePaise,
        quantity: item.quantity,
        taxRateBps: offer.taxRateBps,
      };
      orderLines.push(lineInput);
      requiresPrescription = requiresPrescription || product.prescriptionRequired;
      hasControlled = hasControlled || product.isControlled;
    }

    lines.push({
      itemId: item.id,
      offerId: offer.id,
      productId: product.id,
      slug: product.slug,
      brandName: product.brandName,
      genericName: product.genericName,
      strengthLabel: product.strengthLabel,
      dosageForm: product.dosageForm,
      packSizeLabel: product.packSizeLabel,
      manufacturer: product.manufacturer,
      scheduleClass: product.scheduleClass,
      prescriptionRequired: product.prescriptionRequired,
      isControlled: product.isControlled,
      pharmacyProfileId: offer.pharmacyProfileId,
      pharmacyName: name,
      unitPricePaise,
      maxPerOrder: offer.maxPerOrder,
      stockStatus: offer.stockStatus,
      stockQuantity: offer.stockQuantity,
      deliveryEtaMinutes: offer.deliveryEtaMinutes,
      taxRateBps: offer.taxRateBps,
      quantity: item.quantity,
      lineSubtotalPaise,
      lineTaxPaise,
      lineTotalPaise,
      problems,
      orderable,
    });

    // Fill in the computed money on the line we just pushed.
    if (orderable && unitPricePaise !== null) {
      const computed = computeOrderTotals({
        lines: [orderLines[orderLines.length - 1]],
        deliveryFeeInPaise: 0,
        discountInPaise: 0,
        discountCode: null,
      }).lineResults[0];
      const line = lines[lines.length - 1];
      line.lineSubtotalPaise = computed.lineSubtotalPaise;
      line.lineTaxPaise = computed.lineTaxPaise;
      line.lineTotalPaise = computed.lineTotalPaise;
    }
  }

  const deliveryFeeInPaise = estimateDeliveryFeeInPaise({
    subtotalInPaise: orderLines.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0),
    deliveryEtaMinutes: deliveryEstimateMinutes,
  });

  const totals = computeOrderTotals({
    lines: orderLines,
    deliveryFeeInPaise,
    discountInPaise: 0,
    discountCode: null,
  });

  const checkoutBlockers: string[] = [];
  if (lines.length === 0) checkoutBlockers.push("Your cart is empty.");
  const problemLines = lines.filter((line) => !line.orderable);
  if (problemLines.length > 0) {
    checkoutBlockers.push(
      `${problemLines.length} ${problemLines.length === 1 ? "line" : "lines"} in your cart cannot be ordered as they are.`,
    );
  }

  return {
    cartId: cart.id,
    pharmacyProfileId,
    pharmacyName,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    requiresPrescription,
    hasControlled,
    deliveryEstimateMinutes,
    totals: {
      itemsSubtotalInPaise: totals.itemsSubtotalInPaise,
      discountInPaise: totals.discountInPaise,
      deliveryFeeInPaise: totals.deliveryFeeInPaise,
      taxInPaise: totals.taxInPaise,
      totalInPaise: totals.totalInPaise,
    },
    canCheckout: checkoutBlockers.length === 0,
    checkoutBlockers,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

async function loadOfferForCart(offerId: string) {
  return prisma.pharmacyOffer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      pharmacyProfileId: true,
      pricePublished: true,
      stockStatus: true,
      maxPerOrder: true,
      isActive: true,
      product: { select: { listable: true, deletedAt: true, scheduleClass: true, isControlled: true } },
      pharmacy: {
        select: { verificationStatus: true, status: true, canDispenseControlledMedicines: true, tradeName: true, legalName: true },
      },
    },
  });
}

/** Shared orderability gate. Returns a human reason when the offer cannot be ordered. */
function offerProblem(offer: NonNullable<Awaited<ReturnType<typeof loadOfferForCart>>>): string | null {
  if (!offer.product.listable || offer.product.deletedAt !== null || !isScheduleClassListable(offer.product.scheduleClass)) {
    return "This medicine cannot be sold on ORVEXA.";
  }
  if (!offer.isActive) return "This pharmacy has withdrawn this listing.";
  if (offer.pharmacy.verificationStatus !== "VERIFIED" || offer.pharmacy.status !== "APPROVED") {
    return "This pharmacy is not verified to sell on ORVEXA yet.";
  }
  if (!offer.pricePublished) return "Price on request — this pharmacy has not published a price, so it cannot be ordered.";
  if (offer.stockStatus === "OUT_OF_STOCK") return "This pharmacy is out of stock.";
  if (offer.stockStatus === "DISCONTINUED") return "This pharmacy has discontinued this medicine.";
  if (offer.product.isControlled && !offer.pharmacy.canDispenseControlledMedicines) {
    return "This pharmacy is not licensed to dispense controlled medicines.";
  }
  return null;
}

export async function addItem(userId: string, offerId: string, quantity = 1): Promise<CartMutation> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: { kind: "quantity", message: "Choose at least one pack." } };
  }

  const offer = await loadOfferForCart(offerId);
  if (!offer) return { ok: false, error: { kind: "not_found", message: "That medicine listing was not found." } };

  const problem = offerProblem(offer);
  if (problem) return { ok: false, error: { kind: "not_orderable", message: problem } };

  const cart = await getOrCreateCart(userId);
  const existingItems = await prisma.pharmacyCartItem.findMany({
    where: { cartId: cart.id },
    select: { id: true, offerId: true, quantity: true, offer: { select: { pharmacyProfileId: true } } },
  });

  const otherPharmacy = existingItems.find((item) => item.offer.pharmacyProfileId !== offer.pharmacyProfileId);
  if (otherPharmacy) {
    const otherOffer = await prisma.pharmacyOffer.findUnique({
      where: { id: otherPharmacy.offerId },
      select: { pharmacy: { select: { tradeName: true, legalName: true } } },
    });
    const currentName = otherOffer?.pharmacy.tradeName ?? otherOffer?.pharmacy.legalName ?? "another pharmacy";
    const incomingName = offer.pharmacy.tradeName ?? offer.pharmacy.legalName;
    return {
      ok: false,
      error: {
        kind: "different_pharmacy",
        message: `Your cart is with ${currentName}. An order can only be fulfilled by one pharmacy at a time.`,
        currentPharmacyName: currentName,
        incomingPharmacyName: incomingName,
      },
    };
  }

  const existing = existingItems.find((item) => item.offerId === offerId);
  const requested = (existing?.quantity ?? 0) + quantity;
  const clamped = offer.maxPerOrder !== null ? Math.min(requested, offer.maxPerOrder) : requested;

  if (existing) {
    await prisma.pharmacyCartItem.update({ where: { id: existing.id }, data: { quantity: clamped } });
  } else {
    await prisma.pharmacyCartItem.create({ data: { cartId: cart.id, offerId, quantity: clamped } });
  }

  await recordAuditEvent({
    action: "pharmacy.cart_updated",
    entityType: "pharmacy_cart",
    entityId: cart.id,
    actorUserId: userId,
    metadata: { offerId, quantity: clamped, change: existing ? "increment" : "add", clampedToMax: clamped !== requested },
  });

  return { ok: true, view: await getCartView(userId) };
}

export async function updateQuantity(userId: string, offerId: string, quantity: number): Promise<CartMutation> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: { kind: "quantity", message: "Quantity must be at least one. Remove the line instead." } };
  }

  const cart = await prisma.pharmacyCart.findUnique({ where: { ownerUserId: userId } });
  if (!cart) return { ok: false, error: { kind: "not_found", message: "Your cart is empty." } };

  const item = await prisma.pharmacyCartItem.findFirst({
    where: { cartId: cart.id, offerId },
    select: { id: true, offer: { select: { maxPerOrder: true } } },
  });
  if (!item) return { ok: false, error: { kind: "not_found", message: "That line is not in your cart." } };

  const clamped = item.offer.maxPerOrder !== null ? Math.min(quantity, item.offer.maxPerOrder) : quantity;
  await prisma.pharmacyCartItem.update({ where: { id: item.id }, data: { quantity: clamped } });

  await recordAuditEvent({
    action: "pharmacy.cart_updated",
    entityType: "pharmacy_cart",
    entityId: cart.id,
    actorUserId: userId,
    metadata: { offerId, quantity: clamped, change: "set", clampedToMax: clamped !== quantity },
  });

  return { ok: true, view: await getCartView(userId) };
}

export async function removeItem(userId: string, offerId: string): Promise<CartMutation> {
  const cart = await prisma.pharmacyCart.findUnique({ where: { ownerUserId: userId } });
  if (!cart) return { ok: false, error: { kind: "not_found", message: "Your cart is empty." } };

  const removed = await prisma.pharmacyCartItem.deleteMany({ where: { cartId: cart.id, offerId } });
  if (removed.count > 0) {
    await recordAuditEvent({
      action: "pharmacy.cart_updated",
      entityType: "pharmacy_cart",
      entityId: cart.id,
      actorUserId: userId,
      metadata: { offerId, change: "remove" },
    });
  }

  return { ok: true, view: await getCartView(userId) };
}

export async function clearCart(userId: string): Promise<CartMutation> {
  const cart = await prisma.pharmacyCart.findUnique({ where: { ownerUserId: userId } });
  if (!cart) return { ok: true, view: await getCartView(userId) };

  const removed = await prisma.pharmacyCartItem.deleteMany({ where: { cartId: cart.id } });
  if (removed.count > 0) {
    await recordAuditEvent({
      action: "pharmacy.cart_updated",
      entityType: "pharmacy_cart",
      entityId: cart.id,
      actorUserId: userId,
      metadata: { change: "clear", linesRemoved: removed.count },
    });
  }

  return { ok: true, view: await getCartView(userId) };
}
