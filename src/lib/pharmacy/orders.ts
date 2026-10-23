import "server-only";

import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { PaymentStatus, PharmacyOrderEventType, PharmacyOrderStatus } from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getPaymentProvider } from "@/lib/payments/service";
import { isScheduleClassListable } from "@/lib/pharmacy/labels";
import { getCartView } from "@/lib/pharmacy/cart";
import { assertTotalsReconcile, computeOrderTotals, estimateDeliveryFeeInPaise, type OrderLineInput } from "@/lib/pharmacy/pricing";
import { recordAuditEvent } from "@/lib/security/audit";

/**
 * Orders: creation, stock reservation and the status machine.
 *
 * ## Money is frozen, never recomputed from the client
 *
 * Every price on an order is read from the database inside the same transaction
 * that writes the order, recomputed with `computeOrderTotals`, and copied onto
 * the invoice lines. The client sends an address and a basket, never a rupee.
 *
 * ## Stock is reserved, not promised
 *
 * Reserving a line is a single conditional `updateMany` — decrement only while
 * the published level is still at least the quantity ordered — so two checkouts
 * for the last strip cannot both succeed. When a partner has published no
 * countable level (`stockQuantity === null`) nothing is decremented and no
 * inventory row is written, because there is no number to move and inventing
 * one would be a lie the ledger could never reconcile.
 *
 * ## Idempotency
 *
 * The only unique anchor the schema offers for a retried checkout is
 * `PharmacyPayment.idempotencyKey`, so the order and its unpaid payment record
 * are written together. A replay finds the payment and returns its order.
 */

/** Minutes an unpaid order holds its reserved stock before it is released. */
export const ORDER_PAYMENT_WINDOW_MINUTES = 30;

/** Months a pharmacy order and its prescription reference are kept. */
export const ORDER_RETENTION_MONTHS = 24;

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomReferenceBody(): string {
  const bytes = randomBytes(6);
  let body = "";
  for (const byte of bytes) body += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return body;
}

/** A customer-facing reference, e.g. ORX-PH-7K2M4Q. Six base32 characters. */
export function generateOrderReference(): string {
  return `ORX-PH-${randomReferenceBody()}`;
}

// ---------------------------------------------------------------------------
// Result vocabulary
// ---------------------------------------------------------------------------

export type OrderErrorCode =
  | "cart_empty"
  | "cart_not_orderable"
  | "different_pharmacy"
  | "address_not_found"
  | "prescription_required"
  | "prescription_not_found"
  | "prescription_not_approved"
  | "prescription_not_covering"
  | "insufficient_stock"
  | "not_found"
  | "invalid_transition"
  | "conflict";

/** Thrown inside the checkout transaction to roll the whole thing back. */
class OrderFailure extends Error {
  readonly code: OrderErrorCode;

  constructor(code: OrderErrorCode, message: string) {
    super(message);
    this.name = "OrderFailure";
    this.code = code;
  }
}

export type OrderActor = {
  userId?: string | null;
  role?: "PATIENT" | "PHARMACY_PARTNER" | "PLATFORM_ADMIN" | null;
  label?: string | null;
};

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const ORDER_SUMMARY_SELECT = {
  id: true,
  reference: true,
  status: true,
  customerUserId: true,
  totalPaise: true,
  requiresPrescription: true,
  paymentDueAt: true,
  placedAt: true,
  deliveryCity: true,
  pharmacy: { select: { id: true, tradeName: true, legalName: true } },
  _count: { select: { items: true } },
} satisfies Prisma.PharmacyOrderSelect;

export type OrderSummary = Prisma.PharmacyOrderGetPayload<{ select: typeof ORDER_SUMMARY_SELECT }>;

const ORDER_DETAIL_SELECT = {
  ...ORDER_SUMMARY_SELECT,
  pharmacyProfileId: true,
  deliveryRecipientName: true,
  deliveryPhone: true,
  deliveryLine1: true,
  deliveryLine2: true,
  deliveryLandmark: true,
  deliveryState: true,
  deliveryPostalCode: true,
  itemsSubtotalPaise: true,
  discountPaise: true,
  deliveryFeePaise: true,
  taxPaise: true,
  discountCode: true,
  deliveryEstimateMinutes: true,
  prescriptionId: true,
  cancellationReason: true,
  cancelledByLabel: true,
  cancelledAt: true,
  acceptedAt: true,
  packedAt: true,
  dispatchedAt: true,
  deliveredAt: true,
  deliveryAckReference: true,
  deliveryPartnerName: true,
  deliveryTrackingUrl: true,
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      offerId: true,
      productId: true,
      productName: true,
      genericName: true,
      strengthLabel: true,
      dosageForm: true,
      packSizeLabel: true,
      manufacturer: true,
      scheduleClass: true,
      prescriptionRequired: true,
      isControlled: true,
      pharmacyName: true,
      unitPricePaise: true,
      quantity: true,
      taxRateBps: true,
      lineSubtotalPaise: true,
      lineTaxPaise: true,
      lineTotalPaise: true,
    },
  },
  events: {
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, actorLabel: true, note: true, createdAt: true },
  },
  payments: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      status: true,
      amountPaise: true,
      isSandbox: true,
      method: true,
      failureReason: true,
      createdAt: true,
    },
  },
  refunds: {
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, amountPaise: true, reason: true, processedAt: true, createdAt: true },
  },
  prescription: { select: { id: true, reference: true, status: true } },
} satisfies Prisma.PharmacyOrderSelect;

export type OrderDetail = Prisma.PharmacyOrderGetPayload<{ select: typeof ORDER_DETAIL_SELECT }>;

// ---------------------------------------------------------------------------
// The status machine
// ---------------------------------------------------------------------------

/**
 * Which transitions are legal.
 *
 * Every order begins `PENDING_PAYMENT`. A paid order either awaits the pharmacy
 * (`PAYMENT_CONFIRMED`) or, when a line needs a prescription, awaits a pharmacist
 * (`PRESCRIPTION_REVIEW`) before the pharmacy may accept it. A dispatch and a
 * delivery are only reachable from a recorded acknowledgement, and a refund is
 * only reachable after a cancellation or a delivery — never from mid-flight.
 */
export const ORDER_TRANSITIONS: Record<PharmacyOrderStatus, readonly PharmacyOrderStatus[]> = {
  PENDING_PAYMENT: ["PAYMENT_CONFIRMED", "PRESCRIPTION_REVIEW", "CANCELLED"],
  PAYMENT_CONFIRMED: ["PRESCRIPTION_REVIEW", "ACCEPTED", "CANCELLED"],
  PRESCRIPTION_REVIEW: ["PAYMENT_CONFIRMED", "ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PACKED", "CANCELLED"],
  PACKED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: ["REFUNDED"],
  REFUNDED: [],
};

const STATUS_TIMESTAMP_FIELD: Partial<
  Record<PharmacyOrderStatus, "acceptedAt" | "packedAt" | "dispatchedAt" | "deliveredAt">
> = {
  ACCEPTED: "acceptedAt",
  PACKED: "packedAt",
  DISPATCHED: "dispatchedAt",
  DELIVERED: "deliveredAt",
};

const STATUS_EVENT: Record<PharmacyOrderStatus, PharmacyOrderEventType> = {
  PENDING_PAYMENT: "NOTE",
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
  PRESCRIPTION_REVIEW: "PRESCRIPTION_REQUIRED",
  ACCEPTED: "ORDER_ACCEPTED",
  PACKED: "PACKED",
  DISPATCHED: "DISPATCHED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUND_COMPLETED",
};

export function canTransitionOrder(from: PharmacyOrderStatus, to: PharmacyOrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export type TransitionResult =
  | { ok: true; orderId: string; reference: string; status: PharmacyOrderStatus; unchanged: boolean }
  | { ok: false; code: OrderErrorCode; message: string };

/**
 * Moves an order to `next`, recording the timestamp the status implies and an
 * immutable event row. Moving to the status the order is already in is a no-op
 * success, which is what makes a replayed webhook harmless.
 */
export async function transitionOrder(input: {
  orderId: string;
  next: PharmacyOrderStatus;
  actor?: OrderActor;
  note?: string | null;
  metadata?: Prisma.InputJsonValue;
  eventType?: PharmacyOrderEventType;
  extraData?: Omit<Prisma.PharmacyOrderUpdateInput, "status">;
}): Promise<TransitionResult> {
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: input.orderId },
    select: { id: true, reference: true, status: true },
  });
  if (!order) return { ok: false, code: "not_found", message: "That order was not found." };

  if (order.status === input.next) {
    return { ok: true, orderId: order.id, reference: order.reference, status: order.status, unchanged: true };
  }

  if (!canTransitionOrder(order.status, input.next)) {
    return {
      ok: false,
      code: "invalid_transition",
      message: `An order that is ${order.status} cannot move to ${input.next}.`,
    };
  }

  const timestampField = STATUS_TIMESTAMP_FIELD[input.next];
  const data: Prisma.PharmacyOrderUpdateInput = {
    ...input.extraData,
    status: input.next,
    ...(timestampField ? { [timestampField]: new Date() } : {}),
  };

  await prisma.pharmacyOrder.update({ where: { id: order.id }, data });

  await prisma.pharmacyOrderEvent.create({
    data: {
      orderId: order.id,
      type: input.eventType ?? STATUS_EVENT[input.next],
      actorUserId: input.actor?.userId ?? null,
      actorRole: input.actor?.role ?? null,
      actorLabel: input.actor?.label ?? null,
      note: input.note ?? null,
      metadata: input.metadata,
    },
  });

  await recordAuditEvent({
    action:
      input.next === "CANCELLED"
        ? "pharmacy.order_cancelled"
        : "pharmacy.order_status_changed",
    entityType: "pharmacy_order",
    entityId: order.id,
    actorUserId: input.actor?.userId ?? null,
    actorLabel: input.actor?.label ?? null,
    metadata: { from: order.status, to: input.next, reference: order.reference },
  });

  return { ok: true, orderId: order.id, reference: order.reference, status: input.next, unchanged: false };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

type FreshOffer = {
  id: string;
  pharmacyProfileId: string;
  priceInPaise: number;
  pricePublished: boolean;
  taxRateBps: number | null;
  stockStatus: string;
  stockQuantity: number | null;
  maxPerOrder: number | null;
  isActive: boolean;
  product: {
    brandName: string;
    genericName: string;
    strengthLabel: string;
    dosageForm: OrderLineInput["dosageForm"];
    packSizeLabel: string;
    manufacturer: string | null;
    scheduleClass: OrderLineInput["scheduleClass"];
    prescriptionRequired: boolean;
    isControlled: boolean;
    listable: boolean;
    deletedAt: Date | null;
  };
  pharmacy: {
    verificationStatus: string;
    status: string;
    canDispenseControlledMedicines: boolean;
    tradeName: string | null;
    legalName: string;
  };
};

const FRESH_OFFER_SELECT = {
  id: true,
  pharmacyProfileId: true,
  priceInPaise: true,
  pricePublished: true,
  taxRateBps: true,
  stockStatus: true,
  stockQuantity: true,
  maxPerOrder: true,
  isActive: true,
  product: {
    select: {
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
      verificationStatus: true,
      status: true,
      canDispenseControlledMedicines: true,
      tradeName: true,
      legalName: true,
    },
  },
} satisfies Prisma.PharmacyOfferSelect;

/** The same orderability gate the cart uses, re-run on freshly read data. */
function freshOfferProblem(offer: FreshOffer): string | null {
  const product = offer.product;
  if (!product.listable || product.deletedAt !== null || !isScheduleClassListable(product.scheduleClass)) {
    return "One of these medicines can no longer be sold on ORVEXA.";
  }
  if (!offer.isActive) return "A pharmacy has withdrawn one of these listings.";
  if (offer.pharmacy.verificationStatus !== "VERIFIED" || offer.pharmacy.status !== "APPROVED") {
    return "One of these pharmacies is not verified to sell on ORVEXA.";
  }
  if (!offer.pricePublished) return "A pharmacy has removed the published price for one of these medicines.";
  if (offer.stockStatus === "OUT_OF_STOCK") return "A pharmacy is now out of stock for one of these medicines.";
  if (offer.stockStatus === "DISCONTINUED") return "A pharmacy has discontinued one of these medicines.";
  if (product.isControlled && !offer.pharmacy.canDispenseControlledMedicines) {
    return "A pharmacy is not licensed to dispense a controlled medicine in this order.";
  }
  return null;
}

export type CreateOrderResult =
  | { ok: true; order: OrderSummary; reused: boolean }
  | { ok: false; code: OrderErrorCode; message: string };

async function reserveOrderReference(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateOrderReference();
    const clash = await tx.pharmacyOrder.findUnique({ where: { reference: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  throw new OrderFailure("conflict", "An order reference could not be allocated. Please try again.");
}

export async function createOrderFromCart(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName">;
  addressId: string;
  prescriptionId?: string | null;
  idempotencyKey: string;
}): Promise<CreateOrderResult> {
  // A retried submission finds its payment row and returns the order it belongs
  // to rather than opening a second one.
  const existingPayment = await prisma.pharmacyPayment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { orderId: true, order: { select: ORDER_SUMMARY_SELECT } },
  });
  if (existingPayment) {
    if (existingPayment.order.customerUserId !== input.user.id) {
      return { ok: false, code: "conflict", message: "That checkout key has already been used for another order." };
    }
    return { ok: true, order: existingPayment.order, reused: true };
  }

  const address = await prisma.patientAddress.findFirst({
    where: { id: input.addressId, ownerUserId: input.user.id, deletedAt: null },
  });
  if (!address) {
    return { ok: false, code: "address_not_found", message: "That delivery address was not found on your account." };
  }

  const cart = await getCartView(input.user.id);
  if (cart.lines.length === 0) {
    return { ok: false, code: "cart_empty", message: "Your cart is empty." };
  }
  if (!cart.canCheckout || !cart.pharmacyProfileId) {
    return {
      ok: false,
      code: "cart_not_orderable",
      message: cart.checkoutBlockers.join(" ") || "Your cart cannot be ordered as it stands.",
    };
  }
  const pharmacyProfileId = cart.pharmacyProfileId;

  if (cart.requiresPrescription && !input.prescriptionId) {
    return {
      ok: false,
      code: "prescription_required",
      message:
        "This order contains a prescription medicine. Choose an approved prescription for it before paying.",
    };
  }

  const paymentDueAt = new Date(Date.now() + ORDER_PAYMENT_WINDOW_MINUTES * 60 * 1000);

  try {
    const { order, totals } = await prisma.$transaction(async (tx) => {
      // Re-read every offer inside the transaction so the price and the stock we
      // charge against are the price and the stock at the moment of the write.
      const offerIds = cart.lines.map((line) => line.offerId);
      const freshOffers = (await tx.pharmacyOffer.findMany({
        where: { id: { in: offerIds } },
        select: FRESH_OFFER_SELECT,
      })) as FreshOffer[];
      const byId = new Map(freshOffers.map((offer) => [offer.id, offer]));

      const lines: OrderLineInput[] = [];
      const reservations: { offerId: string; quantity: number; stockQuantity: number | null }[] = [];

      for (const cartLine of cart.lines) {
        const offer = byId.get(cartLine.offerId);
        if (!offer) throw new OrderFailure("cart_not_orderable", "One of the medicines is no longer listed.");
        if (offer.pharmacyProfileId !== pharmacyProfileId) {
          throw new OrderFailure("different_pharmacy", "An order can only be fulfilled by one pharmacy.");
        }
        const problem = freshOfferProblem(offer);
        if (problem) throw new OrderFailure("cart_not_orderable", problem);

        const quantity =
          offer.maxPerOrder !== null ? Math.min(cartLine.quantity, offer.maxPerOrder) : cartLine.quantity;

        lines.push({
          offerId: offer.id,
          productId: cartLine.productId,
          productName: offer.product.brandName,
          genericName: offer.product.genericName,
          strengthLabel: offer.product.strengthLabel,
          dosageForm: offer.product.dosageForm,
          packSizeLabel: offer.product.packSizeLabel,
          manufacturer: offer.product.manufacturer,
          scheduleClass: offer.product.scheduleClass,
          prescriptionRequired: offer.product.prescriptionRequired,
          isControlled: offer.product.isControlled,
          pharmacyName: offer.pharmacy.tradeName ?? offer.pharmacy.legalName,
          unitPricePaise: offer.priceInPaise,
          quantity,
          taxRateBps: offer.taxRateBps,
        });
        reservations.push({ offerId: offer.id, quantity, stockQuantity: offer.stockQuantity });
      }

      const requiresPrescription = lines.some((line) => line.prescriptionRequired);

      if (requiresPrescription) {
        if (!input.prescriptionId) {
          throw new OrderFailure("prescription_required", "A prescription is needed for this order.");
        }
        const coverage = await checkPrescriptionCoverage(tx, {
          prescriptionId: input.prescriptionId,
          ownerUserId: input.user.id,
          lines,
        });
        if (!coverage.ok) throw new OrderFailure(coverage.code, coverage.message);
      }

      const deliveryEtaMinutes = cart.lines.reduce<number | null>(
        (max, line) => (line.deliveryEtaMinutes === null ? max : Math.max(max ?? 0, line.deliveryEtaMinutes)),
        null,
      );
      const totals = computeOrderTotals({
        lines,
        deliveryFeeInPaise: estimateDeliveryFeeInPaise({
          subtotalInPaise: lines.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0),
          deliveryEtaMinutes,
        }),
        discountInPaise: 0,
        discountCode: null,
      });
      assertTotalsReconcile(totals);

      const reference = await reserveOrderReference(tx);

      const retentionUntil = new Date();
      retentionUntil.setMonth(retentionUntil.getMonth() + ORDER_RETENTION_MONTHS);

      const order = await tx.pharmacyOrder.create({
        data: {
          reference,
          customerUserId: input.user.id,
          pharmacyProfileId,
          status: "PENDING_PAYMENT",
          deliveryRecipientName: address.recipientName,
          deliveryPhone: address.phone,
          deliveryLine1: address.addressLine1,
          deliveryLine2: address.addressLine2,
          deliveryLandmark: address.landmark,
          deliveryCity: address.city,
          deliveryState: address.state,
          deliveryPostalCode: address.postalCode,
          deliveryLatitude: address.latitude,
          deliveryLongitude: address.longitude,
          itemsSubtotalPaise: totals.itemsSubtotalInPaise,
          discountPaise: totals.discountInPaise,
          deliveryFeePaise: totals.deliveryFeeInPaise,
          taxPaise: totals.taxInPaise,
          totalPaise: totals.totalInPaise,
          discountCode: totals.discountCode,
          deliveryEstimateMinutes: deliveryEtaMinutes,
          requiresPrescription,
          prescriptionId: requiresPrescription ? input.prescriptionId : null,
          paymentDueAt,
          retentionUntil,
          items: {
            create: totals.lineResults.map((line) => ({
              offerId: line.offerId,
              productId: line.productId,
              productName: line.productName,
              genericName: line.genericName,
              strengthLabel: line.strengthLabel,
              dosageForm: line.dosageForm,
              packSizeLabel: line.packSizeLabel,
              manufacturer: line.manufacturer,
              scheduleClass: line.scheduleClass,
              prescriptionRequired: line.prescriptionRequired,
              isControlled: line.isControlled,
              pharmacyName: line.pharmacyName,
              unitPricePaise: line.unitPricePaise,
              quantity: line.quantity,
              taxRateBps: line.taxRateBps,
              lineSubtotalPaise: line.lineSubtotalPaise,
              lineTaxPaise: line.lineTaxPaise,
              lineTotalPaise: line.lineTotalPaise,
            })),
          },
          events: {
            create: [
              {
                type: "CREATED",
                actorUserId: input.user.id,
                actorRole: "PATIENT",
                actorLabel: input.user.fullName,
                metadata: { reference, lineCount: totals.lineResults.length },
              },
              ...(requiresPrescription
                ? [
                    {
                      type: "PRESCRIPTION_REQUIRED" as const,
                      actorUserId: input.user.id,
                      actorRole: "PATIENT" as const,
                      note: "This order contains at least one medicine that requires a prescription.",
                    },
                  ]
                : []),
            ],
          },
        },
        select: ORDER_SUMMARY_SELECT,
      });

      // Reserve stock line by line. A failure here rolls the order back with it.
      for (const reservation of reservations) {
        if (reservation.stockQuantity === null) continue;
        const updated = await tx.pharmacyOffer.updateMany({
          where: { id: reservation.offerId, stockQuantity: { gte: reservation.quantity } },
          data: { stockQuantity: { decrement: reservation.quantity } },
        });
        if (updated.count !== 1) {
          throw new OrderFailure(
            "insufficient_stock",
            "A medicine sold out while you were checking out. Nothing was charged — adjust the quantity and try again.",
          );
        }
        const after = await tx.pharmacyOffer.findUnique({
          where: { id: reservation.offerId },
          select: { stockQuantity: true },
        });
        await tx.pharmacyInventoryEntry.create({
          data: {
            pharmacyProfileId,
            offerId: reservation.offerId,
            delta: -reservation.quantity,
            balanceAfter: after?.stockQuantity ?? Math.max(reservation.stockQuantity - reservation.quantity, 0),
            reason: "SALE",
            note: "Reserved against a customer order.",
            orderId: order.id,
            actorUserId: input.user.id,
            actorLabel: input.user.fullName,
          },
        });
      }

      // The basket becomes the order; the cart is converted rather than deleted.
      await tx.pharmacyCartItem.deleteMany({ where: { cartId: cart.cartId } });
      await tx.pharmacyCart.update({
        where: { id: cart.cartId },
        data: { status: "CONVERTED", convertedOrderId: order.id },
      });

      // The unique idempotency anchor, written with the order so a replay is safe.
      const provider = getPaymentProvider();
      await tx.pharmacyPayment.create({
        data: {
          orderId: order.id,
          provider: provider.id,
          amountPaise: totals.totalInPaise,
          currency: provider.currency,
          status: "CREATED",
          idempotencyKey: input.idempotencyKey,
          isSandbox: !provider.isLive,
        },
      });

      return { order, totals };
    });

    await recordAuditEvent({
      action: "pharmacy.order_created",
      entityType: "pharmacy_order",
      entityId: order.id,
      actorUserId: input.user.id,
      actorLabel: input.user.fullName,
      metadata: {
        reference: order.reference,
        pharmacyProfileId,
        totalPaise: totals.totalInPaise,
        requiresPrescription: order.requiresPrescription,
      },
    });

    return { ok: true, order, reused: false };
  } catch (error) {
    if (error instanceof OrderFailure) return { ok: false, code: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, code: "conflict", message: "This checkout was already submitted. Open your orders to see it." };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Prescription coverage
// ---------------------------------------------------------------------------

/** True when a written prescription line plausibly covers an order line. */
export function prescriptionItemCoversLine(
  item: { productId: string | null; prescribedName: string },
  line: { productId: string; productName: string; genericName: string },
): boolean {
  if (item.productId && item.productId === line.productId) return true;
  const written = item.prescribedName.trim().toLowerCase();
  if (written.length < 3) return false;
  const brand = line.productName.trim().toLowerCase();
  const generic = line.genericName.trim().toLowerCase();
  return (
    written.includes(brand) ||
    written.includes(generic) ||
    brand.includes(written) ||
    generic.includes(written)
  );
}

type CoverageResult = { ok: true } | { ok: false; code: OrderErrorCode; message: string; missing?: string[] };

/** The slice of the client the coverage check needs, so it runs in or out of a transaction. */
type PrescriptionReader = Pick<Prisma.TransactionClient, "prescription">;

async function checkPrescriptionCoverage(
  tx: PrescriptionReader,
  input: {
    prescriptionId: string;
    ownerUserId: string;
    lines: { productId: string; productName: string; genericName: string; prescriptionRequired: boolean }[];
  },
): Promise<CoverageResult> {
  const prescription = await tx.prescription.findUnique({
    where: { id: input.prescriptionId },
    select: {
      ownerUserId: true,
      status: true,
      validUntil: true,
      deletedAt: true,
      items: { select: { productId: true, prescribedName: true } },
    },
  });
  // A prescription belonging to somebody else is reported as not found, so the
  // endpoint cannot be used to probe for another patient's record ids.
  if (!prescription || prescription.deletedAt !== null || prescription.ownerUserId !== input.ownerUserId) {
    return { ok: false, code: "prescription_not_found", message: "That prescription was not found on your account." };
  }
  if (prescription.status !== "APPROVED" && prescription.status !== "PARTIALLY_APPROVED") {
    return {
      ok: false,
      code: "prescription_not_approved",
      message: "A pharmacist has not approved that prescription yet, so it cannot be used for this order.",
    };
  }
  if (prescription.validUntil !== null && prescription.validUntil.getTime() < Date.now()) {
    return {
      ok: false,
      code: "prescription_not_approved",
      message: "That prescription is past the date it was valid for.",
    };
  }

  const missing: string[] = [];
  for (const line of input.lines) {
    if (!line.prescriptionRequired) continue;
    const covered = prescription.items.some((item) => prescriptionItemCoversLine(item, line));
    if (!covered) missing.push(`${line.productName} ${line.genericName}`.trim());
  }

  if (missing.length > 0) {
    return {
      ok: false,
      code: "prescription_not_covering",
      message: `That prescription does not cover: ${missing.join(", ")}.`,
      missing,
    };
  }
  return { ok: true };
}

/** Confirms an approved prescription covers every prescription line on an order. */
export async function assertPrescriptionCoversOrder(input: {
  orderId: string;
  prescriptionId: string;
}): Promise<CoverageResult> {
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: input.orderId },
    select: {
      customerUserId: true,
      items: {
        select: {
          productId: true,
          productName: true,
          genericName: true,
          prescriptionRequired: true,
        },
      },
    },
  });
  if (!order) return { ok: false, code: "not_found", message: "That order was not found." };
  return checkPrescriptionCoverage(prisma, {
    prescriptionId: input.prescriptionId,
    ownerUserId: order.customerUserId,
    lines: order.items,
  });
}

// ---------------------------------------------------------------------------
// Payment confirmation and expiry
// ---------------------------------------------------------------------------

/**
 * Records a confirmed payment and advances the order.
 *
 * A captured payment moves the order to `PRESCRIPTION_REVIEW` when a line needs
 * a prescription, and to `PAYMENT_CONFIRMED` otherwise. It never moves an order
 * straight to `ACCEPTED`, because acceptance is the pharmacy's decision and
 * nothing here pretends to make it.
 */
export async function markOrderPaid(input: {
  orderId: string;
  paymentId: string;
  status: Extract<PaymentStatus, "CAPTURED" | "AUTHORISED">;
}): Promise<TransitionResult> {
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: input.orderId },
    select: { requiresPrescription: true, status: true },
  });
  if (!order) return { ok: false, code: "not_found", message: "That order was not found." };

  const next: PharmacyOrderStatus = order.requiresPrescription ? "PRESCRIPTION_REVIEW" : "PAYMENT_CONFIRMED";

  return transitionOrder({
    orderId: input.orderId,
    next,
    eventType: "PAYMENT_CONFIRMED",
    note:
      input.status === "CAPTURED"
        ? "Payment captured by the gateway."
        : "Payment authorised; the gateway has not captured it yet.",
    metadata: { paymentId: input.paymentId, paymentStatus: input.status },
    extraData: { paymentDueAt: null },
    actor: { label: "Payment gateway" },
  });
}

/**
 * Returns reserved stock to the pharmacy.
 *
 * Idempotent: once an `ORDER_CANCELLED` movement exists for the order, a second
 * call does nothing, so a cancel-then-expire sequence cannot double-count stock.
 */
export async function releaseStockForOrder(
  orderId: string,
  reason = "Reserved stock returned.",
): Promise<{ released: number; skipped: boolean }> {
  const already = await prisma.pharmacyInventoryEntry.findFirst({
    where: { orderId, reason: "ORDER_CANCELLED" },
    select: { id: true },
  });
  if (already) return { released: 0, skipped: true };

  const items = await prisma.pharmacyOrderItem.findMany({
    where: { orderId },
    select: { offerId: true, quantity: true, order: { select: { pharmacyProfileId: true } } },
  });

  let released = 0;
  for (const item of items) {
    if (!item.offerId) continue;
    const offer = await prisma.pharmacyOffer.findUnique({
      where: { id: item.offerId },
      select: { stockQuantity: true },
    });
    if (!offer || offer.stockQuantity === null) continue;

    const updated = await prisma.pharmacyOffer.update({
      where: { id: item.offerId },
      data: { stockQuantity: { increment: item.quantity } },
      select: { stockQuantity: true },
    });
    await prisma.pharmacyInventoryEntry.create({
      data: {
        pharmacyProfileId: item.order.pharmacyProfileId,
        offerId: item.offerId,
        delta: item.quantity,
        balanceAfter: updated.stockQuantity ?? 0,
        reason: "ORDER_CANCELLED",
        note: reason,
        orderId,
      },
    });
    released += item.quantity;
  }
  return { released, skipped: false };
}

/** Cancels and releases every unpaid order whose payment window has closed. */
export async function expireUnpaidOrders(limit = 50): Promise<{ expired: number }> {
  const due = await prisma.pharmacyOrder.findMany({
    where: { status: "PENDING_PAYMENT", paymentDueAt: { lt: new Date() } },
    select: { id: true },
    take: limit,
  });

  let expired = 0;
  for (const order of due) {
    const result = await transitionOrder({
      orderId: order.id,
      next: "CANCELLED",
      eventType: "CANCELLED",
      note: "The payment window closed before payment completed.",
      extraData: {
        cancellationReason: "Payment was not completed before the deadline.",
        cancelledByLabel: "ORVEXA (payment window)",
        cancelledAt: new Date(),
      },
      actor: { label: "ORVEXA" },
    });
    if (result.ok) {
      await releaseStockForOrder(order.id, "Reserved stock returned after the payment window closed.");
      expired += 1;
    }
  }
  return { expired };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function orderPharmacyName(order: Pick<OrderSummary, "pharmacy">): string {
  return order.pharmacy.tradeName ?? order.pharmacy.legalName;
}

export async function listCustomerOrders(userId: string): Promise<OrderSummary[]> {
  return prisma.pharmacyOrder.findMany({
    where: { customerUserId: userId },
    orderBy: { placedAt: "desc" },
    select: ORDER_SUMMARY_SELECT,
    take: 100,
  });
}

/**
 * One order by its reference, scoped to its owner.
 *
 * A reference that belongs to somebody else resolves to `null` rather than an
 * error, so the page can 404 without confirming the reference exists.
 */
export async function getCustomerOrderByReference(input: {
  user: Pick<AuthenticatedUser, "id">;
  reference: string;
}): Promise<OrderDetail | null> {
  const order = await prisma.pharmacyOrder.findUnique({
    where: { reference: input.reference },
    select: ORDER_DETAIL_SELECT,
  });
  if (!order || order.customerUserId !== input.user.id) return null;
  return order;
}

export async function getOrderDetailById(orderId: string): Promise<OrderDetail | null> {
  return prisma.pharmacyOrder.findUnique({ where: { id: orderId }, select: ORDER_DETAIL_SELECT });
}
