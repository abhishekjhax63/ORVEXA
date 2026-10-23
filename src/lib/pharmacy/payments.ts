import "server-only";

import { Prisma } from "@prisma/client";
import type { PharmacyOrderEventType } from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getPublicBaseUrl } from "@/lib/env";
import { getPaymentProvider } from "@/lib/payments/service";
import { markOrderPaid, transitionOrder, type OrderActor } from "@/lib/pharmacy/orders";
import { recordAuditEvent } from "@/lib/security/audit";

/**
 * Checkout payment orchestration.
 *
 * This module is the only place that talks to a payment gateway. It never
 * decides that money moved — the provider does, and a payment is only recorded
 * as captured when the provider said so. When a provider call fails, the order
 * stays unpaid and the failure is written to the payment row and the timeline.
 *
 * Refunds follow the same rule: `PROCESSING` means the gateway accepted it and
 * has not settled it, and the order is only marked refunded once the gateway
 * reports the refund processed.
 */

export type PaymentFailureCode =
  | "not_found"
  | "not_payable"
  | "already_paid"
  | "provider_error"
  | "not_configured"
  | "signature_invalid"
  | "amount_mismatch"
  | "refund_not_applicable";

/**
 * Writes a timeline event that does not move the order's status.
 *
 * A failed attempt leaves the order `PENDING_PAYMENT`; the failure is a fact
 * worth recording on the timeline, and it is not a transition.
 */
async function recordOrderEvent(input: {
  orderId: string;
  type: PharmacyOrderEventType;
  note?: string | null;
  actor?: OrderActor;
}): Promise<void> {
  await prisma.pharmacyOrderEvent.create({
    data: {
      orderId: input.orderId,
      type: input.type,
      actorUserId: input.actor?.userId ?? null,
      actorRole: input.actor?.role ?? null,
      actorLabel: input.actor?.label ?? null,
      note: input.note ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Starting a payment
// ---------------------------------------------------------------------------

export type StartPaymentResult =
  | {
      ok: true;
      orderId: string;
      orderReference: string;
      providerOrderId: string;
      amountPaise: number;
      currency: string;
      isSandbox: boolean;
      checkoutUrl: string | null;
      publicKeyId: string | null;
      reused: boolean;
    }
  | { ok: false; code: PaymentFailureCode; message: string };

/**
 * Opens (or reopens) a payment intent for an order.
 *
 * The payment row was written with the order, keyed by the checkout's
 * idempotency key, so a retry after a timeout returns the same intent rather
 * than opening a second chargeable one.
 */
export async function startPayment(input: {
  user: Pick<AuthenticatedUser, "id">;
  orderId: string;
  idempotencyKey: string;
}): Promise<StartPaymentResult> {
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      reference: true,
      status: true,
      customerUserId: true,
      totalPaise: true,
      customer: { select: { fullName: true, email: true, phone: true } },
    },
  });
  if (!order || order.customerUserId !== input.user.id) {
    return { ok: false, code: "not_found", message: "That order was not found." };
  }
  if (order.status !== "PENDING_PAYMENT") {
    return { ok: false, code: "already_paid", message: "This order is no longer awaiting payment." };
  }
  if (order.totalPaise <= 0) {
    return { ok: false, code: "not_payable", message: "This order has nothing to pay." };
  }

  const payment = await prisma.pharmacyPayment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, orderId: true, providerOrderId: true, amountPaise: true, status: true },
  });
  if (!payment || payment.orderId !== order.id) {
    return { ok: false, code: "not_found", message: "That payment attempt does not belong to this order." };
  }
  if (payment.amountPaise !== order.totalPaise) {
    return {
      ok: false,
      code: "amount_mismatch",
      message: "The payment amount does not match the order total, so payment was refused.",
    };
  }

  const provider = getPaymentProvider();
  const result = await provider.createIntent({
    orderId: order.id,
    orderReference: order.reference,
    amountPaise: order.totalPaise,
    currency: provider.currency,
    idempotencyKey: input.idempotencyKey,
    returnUrl: `${getPublicBaseUrl().replace(/\/+$/, "")}/dashboard/orders/${order.reference}`,
    customer: { name: order.customer.fullName, email: order.customer.email, phone: order.customer.phone },
    notes: { orderReference: order.reference },
  });

  if (!result.ok) {
    await prisma.pharmacyPayment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureCode: result.error.kind, failureReason: result.error.message },
    });
    await recordOrderEvent({
      orderId: order.id,
      type: "PAYMENT_FAILED",
      note: result.error.message,
      actor: { label: "Payment gateway" },
    });
    await recordAuditEvent({
      action: "pharmacy.payment_failed",
      entityType: "pharmacy_payment",
      entityId: payment.id,
      outcome: "FAILURE",
      actorUserId: input.user.id,
      metadata: { orderId: order.id, reason: result.error.kind },
    });
    return { ok: false, code: result.error.kind === "not_configured" ? "not_configured" : "provider_error", message: result.error.message };
  }

  const intent = result.data;
  await prisma.pharmacyPayment.update({
    where: { id: payment.id },
    data: {
      providerOrderId: intent.providerOrderId,
      amountPaise: intent.amountPaise,
      currency: intent.currency,
      status: intent.status === "CREATED" ? "CREATED" : "REQUIRES_ACTION",
      isSandbox: intent.isSandbox,
      rawSummary: intent.summary as Prisma.InputJsonValue,
    },
  });

  if (!payment.providerOrderId) {
    await recordOrderEvent({
      orderId: order.id,
      type: "PAYMENT_INITIATED",
      note: "A payment attempt was started.",
      actor: { userId: input.user.id, role: "PATIENT" },
    });
  }

  await recordAuditEvent({
    action: "pharmacy.payment_initiated",
    entityType: "pharmacy_payment",
    entityId: payment.id,
    actorUserId: input.user.id,
    metadata: { orderId: order.id, provider: intent.provider, isSandbox: intent.isSandbox },
  });

  return {
    ok: true,
    orderId: order.id,
    orderReference: order.reference,
    providerOrderId: intent.providerOrderId,
    amountPaise: intent.amountPaise,
    currency: intent.currency,
    isSandbox: intent.isSandbox,
    checkoutUrl: intent.checkoutUrl,
    publicKeyId: intent.publicKeyId,
    reused: Boolean(payment.providerOrderId),
  };
}

// ---------------------------------------------------------------------------
// Confirming a payment
// ---------------------------------------------------------------------------

export type ConfirmPaymentResult =
  | { ok: true; paymentStatus: "CAPTURED" | "AUTHORISED"; orderStatus: string }
  | { ok: false; code: PaymentFailureCode; message: string };

/**
 * Verifies a payment the browser says it completed.
 *
 * The provider's verdict is authoritative: `expectedAmountPaise` is our frozen
 * order total, so a confirmation for a different amount is refused, and the
 * order is left unpaid.
 */
export async function confirmPayment(input: {
  user: Pick<AuthenticatedUser, "id">;
  orderId: string;
  providerPaymentId: string;
  signature: string | null;
}): Promise<ConfirmPaymentResult> {
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: input.orderId },
    select: { id: true, reference: true, status: true, customerUserId: true, totalPaise: true },
  });
  if (!order || order.customerUserId !== input.user.id) {
    return { ok: false, code: "not_found", message: "That order was not found." };
  }

  const payment = await prisma.pharmacyPayment.findFirst({
    where: { orderId: order.id, idempotencyKey: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, providerOrderId: true, status: true },
  });
  if (!payment) {
    return { ok: false, code: "not_found", message: "No payment attempt exists for this order." };
  }
  if (payment.status === "CAPTURED") {
    return { ok: true, paymentStatus: "CAPTURED", orderStatus: order.status };
  }

  const provider = getPaymentProvider();
  const result = await provider.verifyPayment({
    providerOrderId: payment.providerOrderId,
    providerPaymentId: input.providerPaymentId,
    signature: input.signature,
    expectedAmountPaise: order.totalPaise,
    currency: provider.currency,
  });

  if (!result.ok) {
    await prisma.pharmacyPayment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureCode: result.error.kind, failureReason: result.error.message },
    });
    await recordAuditEvent({
      action: "pharmacy.payment_failed",
      entityType: "pharmacy_payment",
      entityId: payment.id,
      outcome: "FAILURE",
      actorUserId: input.user.id,
      metadata: { orderId: order.id, reason: result.error.kind },
    });
    return {
      ok: false,
      code: result.error.kind === "signature_invalid" ? "signature_invalid" : "provider_error",
      message: result.error.message,
    };
  }

  const verification = result.data;
  if (!verification.verified) {
    await prisma.pharmacyPayment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        providerPaymentId: verification.providerPaymentId,
        failureCode: verification.failureCode,
        failureReason: verification.failureReason,
        rawSummary: verification.summary as Prisma.InputJsonValue,
      },
    });
    await recordOrderEvent({
      orderId: order.id,
      type: "PAYMENT_FAILED",
      note: verification.failureReason,
      actor: { label: "Payment gateway" },
    });
    await recordAuditEvent({
      action: "pharmacy.payment_failed",
      entityType: "pharmacy_payment",
      entityId: payment.id,
      outcome: "FAILURE",
      actorUserId: input.user.id,
      metadata: { orderId: order.id, reason: verification.failureCode },
    });
    return { ok: false, code: "signature_invalid", message: verification.failureReason };
  }

  if (verification.amountPaise !== order.totalPaise) {
    return {
      ok: false,
      code: "amount_mismatch",
      message: "The confirmed amount does not match the order total, so it was not accepted.",
    };
  }

  await prisma.pharmacyPayment.update({
    where: { id: payment.id },
    data: {
      status: verification.status,
      providerPaymentId: verification.providerPaymentId,
      providerSignature: verification.signature,
      method: verification.method,
      capturedAt: new Date(),
      rawSummary: verification.summary as Prisma.InputJsonValue,
    },
  });

  const transition = await markOrderPaid({
    orderId: order.id,
    paymentId: payment.id,
    status: verification.status,
  });

  await recordAuditEvent({
    action: "pharmacy.payment_captured",
    entityType: "pharmacy_payment",
    entityId: payment.id,
    actorUserId: input.user.id,
    metadata: { orderId: order.id, status: verification.status, provider: verification.providerOrderId },
  });

  return {
    ok: true,
    paymentStatus: verification.status,
    orderStatus: transition.ok ? transition.status : order.status,
  };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookResult =
  | { ok: true; outcome: "processed" | "ignored" | "duplicate"; eventType: string }
  | { ok: false; code: "signature_invalid" | "malformed"; message: string };

/**
 * Handles a signed provider callback.
 *
 * The caller passes the raw request body exactly as it arrived; the signature is
 * checked over that string and nothing is trusted until it passes. A delivery
 * whose `(provider, eventId)` has already been stored is a duplicate and does
 * nothing, which is what makes a retried webhook safe.
 */
export async function processWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
  providerEventId?: string | null;
}): Promise<WebhookResult> {
  const provider = getPaymentProvider();

  if (!provider.canVerifyWebhooks) {
    return {
      ok: false,
      code: "signature_invalid",
      message: "The configured payment provider does not send verifiable webhooks.",
    };
  }

  const verdict = provider.verifyWebhookSignature({
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
  });
  if (!verdict.verified) {
    await recordAuditEvent({
      action: "pharmacy.payment_webhook_rejected",
      entityType: "payment_webhook_event",
      outcome: "DENIED",
      metadata: { provider: provider.id, reason: verdict.reason },
    });
    return { ok: false, code: "signature_invalid", message: verdict.reason };
  }

  const parsedResult = await provider.parseWebhook({
    rawBody: input.rawBody,
    providerEventId: input.providerEventId ?? null,
  });
  if (!parsedResult.ok) {
    return { ok: false, code: "malformed", message: parsedResult.error.message };
  }
  const parsed = parsedResult.data;

  let webhookRowId: string;
  try {
    const row = await prisma.paymentWebhookEvent.create({
      data: {
        provider: provider.id,
        eventId: parsed.eventId,
        eventType: parsed.eventType,
        signatureVerified: true,
        status: "RECEIVED",
        payload: parsed.summary as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    webhookRowId = row.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: true, outcome: "duplicate", eventType: parsed.eventType };
    }
    throw error;
  }

  await recordAuditEvent({
    action: "pharmacy.payment_webhook_received",
    entityType: "payment_webhook_event",
    entityId: webhookRowId,
    metadata: { provider: provider.id, eventType: parsed.eventType, kind: parsed.kind },
  });

  let outcome: "processed" | "ignored" = "ignored";
  let error: string | null = null;

  try {
    if (parsed.kind === "payment_captured" || parsed.kind === "payment_failed") {
      outcome = (await applyPaymentWebhook(parsed)) ? "processed" : "ignored";
    } else if (parsed.kind === "refund_processed") {
      outcome = (await applyRefundWebhook(parsed)) ? "processed" : "ignored";
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Webhook handling failed.";
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookRowId },
      data: { status: "FAILED", error, processedAt: new Date() },
    });
    return { ok: false, code: "malformed", message: error };
  }

  await prisma.paymentWebhookEvent.update({
    where: { id: webhookRowId },
    data: { status: outcome === "processed" ? "PROCESSED" : "IGNORED", processedAt: new Date() },
  });

  return { ok: true, outcome, eventType: parsed.eventType };
}

type ParsedPaymentWebhook = {
  kind: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerRefundId: string | null;
  amountPaise: number | null;
  failureReason: string | null;
  summary: Record<string, unknown>;
};

async function applyPaymentWebhook(parsed: ParsedPaymentWebhook): Promise<boolean> {
  const payment = parsed.providerOrderId
    ? await prisma.pharmacyPayment.findFirst({
        where: { providerOrderId: parsed.providerOrderId },
        select: { id: true, orderId: true, amountPaise: true, status: true },
      })
    : parsed.providerPaymentId
      ? await prisma.pharmacyPayment.findFirst({
          where: { providerPaymentId: parsed.providerPaymentId },
          select: { id: true, orderId: true, amountPaise: true, status: true },
        })
      : null;

  if (!payment) return false;

  if (parsed.kind === "payment_failed") {
    await prisma.pharmacyPayment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        providerPaymentId: parsed.providerPaymentId ?? undefined,
        failureReason: parsed.failureReason ?? "The gateway reported the payment did not complete.",
        rawSummary: parsed.summary as Prisma.InputJsonValue,
      },
    });
    await recordOrderEvent({
      orderId: payment.orderId,
      type: "PAYMENT_FAILED",
      note: parsed.failureReason ?? "The gateway reported the payment did not complete.",
      actor: { label: "Payment gateway" },
    });
    return true;
  }

  if (payment.amountPaise !== parsed.amountPaise && parsed.amountPaise !== null) {
    // A captured amount that disagrees with the order total is not accepted.
    return false;
  }

  const status = parsed.kind === "payment_captured" ? "CAPTURED" : "AUTHORISED";
  await prisma.pharmacyPayment.update({
    where: { id: payment.id },
    data: {
      status,
      providerPaymentId: parsed.providerPaymentId ?? undefined,
      capturedAt: new Date(),
      failureCode: null,
      failureReason: null,
      rawSummary: parsed.summary as Prisma.InputJsonValue,
    },
  });
  await markOrderPaid({ orderId: payment.orderId, paymentId: payment.id, status });
  return true;
}

async function applyRefundWebhook(parsed: ParsedPaymentWebhook): Promise<boolean> {
  if (!parsed.providerRefundId) return false;
  const refund = await prisma.pharmacyRefund.findFirst({
    where: { providerRefundId: parsed.providerRefundId },
    select: { id: true, orderId: true, status: true },
  });
  if (!refund) return false;

  await prisma.pharmacyRefund.update({
    where: { id: refund.id },
    data: { status: "PROCESSED", processedAt: new Date() },
  });
  await transitionOrder({
    orderId: refund.orderId,
    next: "REFUNDED",
    eventType: "REFUND_COMPLETED",
    note: "The gateway reported the refund processed.",
    actor: { label: "Payment gateway" },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export type RefundResult =
  | { ok: true; refundId: string; status: string; amountPaise: number }
  | { ok: false; code: PaymentFailureCode; message: string };

/** Raises a refund request against an order a pharmacy can refund. */
export async function requestRefund(input: {
  actor: OrderActor;
  orderId: string;
  reason: string;
}): Promise<RefundResult> {
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: input.orderId },
    select: { id: true, status: true, totalPaise: true, pharmacyProfileId: true },
  });
  if (!order) return { ok: false, code: "not_found", message: "That order was not found." };
  if (order.status !== "CANCELLED" && order.status !== "DELIVERED") {
    return {
      ok: false,
      code: "refund_not_applicable",
      message: "A refund can be raised only for a cancelled or delivered order.",
    };
  }

  const payment = await prisma.pharmacyPayment.findFirst({
    where: { orderId: order.id, status: { in: ["CAPTURED", "AUTHORISED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, provider: true, amountPaise: true, isSandbox: true },
  });
  if (!payment) {
    return { ok: false, code: "refund_not_applicable", message: "No captured payment exists to refund." };
  }

  const idempotencyKey = `order-refund:${order.id}`;
  const existing = await prisma.pharmacyRefund.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true, amountPaise: true },
  });
  if (existing) {
    return { ok: true, refundId: existing.id, status: existing.status, amountPaise: existing.amountPaise };
  }

  const refund = await prisma.pharmacyRefund.create({
    data: {
      orderId: order.id,
      paymentId: payment.id,
      provider: payment.provider,
      amountPaise: payment.amountPaise,
      reason: input.reason,
      status: "REQUESTED",
      requestedById: input.actor.userId ?? null,
      requestedByLabel: input.actor.label ?? null,
      idempotencyKey,
      isSandbox: payment.isSandbox,
    },
    select: { id: true, status: true, amountPaise: true },
  });

  await recordOrderEvent({
    orderId: order.id,
    type: "REFUND_INITIATED",
    note: input.reason,
    actor: input.actor,
  });

  await recordAuditEvent({
    action: "pharmacy.refund_requested",
    entityType: "pharmacy_refund",
    entityId: refund.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { orderId: order.id, amountPaise: refund.amountPaise },
  });

  return { ok: true, refundId: refund.id, status: refund.status, amountPaise: refund.amountPaise };
}

/** Approves (and processes) or declines a refund request. */
export async function decideRefund(input: {
  actor: OrderActor;
  refundId: string;
  approve: boolean;
  note?: string | null;
}): Promise<RefundResult> {
  const refund = await prisma.pharmacyRefund.findUnique({
    where: { id: input.refundId },
    select: { id: true, orderId: true, status: true, amountPaise: true, reason: true },
  });
  if (!refund) return { ok: false, code: "not_found", message: "That refund was not found." };

  if (!input.approve) {
    await prisma.pharmacyRefund.update({
      where: { id: refund.id },
      data: {
        status: "CANCELLED",
        approvedById: input.actor.userId ?? null,
        approvedByLabel: input.actor.label ?? null,
        failureReason: input.note ?? "The refund was declined.",
      },
    });
    await recordAuditEvent({
      action: "pharmacy.refund_decided",
      entityType: "pharmacy_refund",
      entityId: refund.id,
      outcome: "DENIED",
      actorUserId: input.actor.userId ?? null,
      actorLabel: input.actor.label ?? null,
      metadata: { orderId: refund.orderId, approved: false },
    });
    return { ok: true, refundId: refund.id, status: "CANCELLED", amountPaise: refund.amountPaise };
  }

  await prisma.pharmacyRefund.update({
    where: { id: refund.id },
    data: { approvedById: input.actor.userId ?? null, approvedByLabel: input.actor.label ?? null },
  });
  await recordAuditEvent({
    action: "pharmacy.refund_decided",
    entityType: "pharmacy_refund",
    entityId: refund.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { orderId: refund.orderId, approved: true },
  });

  return processRefund({ actor: input.actor, refundId: refund.id });
}

/**
 * Sends an approved refund to the gateway.
 *
 * `PROCESSING` is recorded as `PROCESSING` rather than `PROCESSED`: the gateway
 * accepted the instruction and has not settled it, and claiming otherwise would
 * be a fabricated success.
 */
export async function processRefund(input: { actor: OrderActor; refundId: string }): Promise<RefundResult> {
  const refund = await prisma.pharmacyRefund.findUnique({
    where: { id: input.refundId },
    select: {
      id: true,
      orderId: true,
      status: true,
      amountPaise: true,
      reason: true,
      provider: true,
      payment: { select: { id: true, providerPaymentId: true } },
    },
  });
  if (!refund) return { ok: false, code: "not_found", message: "That refund was not found." };
  if (refund.status === "PROCESSED") {
    return { ok: true, refundId: refund.id, status: "PROCESSED", amountPaise: refund.amountPaise };
  }
  if (!refund.payment?.providerPaymentId) {
    await prisma.pharmacyRefund.update({
      where: { id: refund.id },
      data: { status: "FAILED", failureReason: "The original payment has no gateway reference to reverse." },
    });
    return {
      ok: false,
      code: "refund_not_applicable",
      message: "The original payment has no gateway reference, so the refund cannot be sent.",
    };
  }

  const provider = getPaymentProvider();
  const result = await provider.refund({
    providerPaymentId: refund.payment.providerPaymentId,
    amountPaise: refund.amountPaise,
    currency: provider.currency,
    reason: refund.reason,
    idempotencyKey: `refund:${refund.id}`,
  });

  if (!result.ok) {
    await prisma.pharmacyRefund.update({
      where: { id: refund.id },
      data: { status: "FAILED", failureReason: result.error.message },
    });
    await recordAuditEvent({
      action: "pharmacy.refund_processed",
      entityType: "pharmacy_refund",
      entityId: refund.id,
      outcome: "FAILURE",
      actorUserId: input.actor.userId ?? null,
      actorLabel: input.actor.label ?? null,
      metadata: { orderId: refund.orderId, reason: result.error.kind },
    });
    return { ok: false, code: "provider_error", message: result.error.message };
  }

  const outcome = result.data;
  const status = outcome.status === "PROCESSED" ? "PROCESSED" : outcome.status === "PROCESSING" ? "PROCESSING" : "FAILED";

  await prisma.pharmacyRefund.update({
    where: { id: refund.id },
    data: {
      status,
      providerRefundId: outcome.providerRefundId,
      processedAt: status === "PROCESSED" ? new Date() : null,
      failureReason: outcome.failureReason,
    },
  });

  if (status === "PROCESSED") {
    const transition = await transitionOrder({
      orderId: refund.orderId,
      next: "REFUNDED",
      eventType: "REFUND_COMPLETED",
      note: "The refund was processed.",
      actor: input.actor,
    });
    if (!transition.ok) {
      await prisma.pharmacyOrderEvent.create({
        data: {
          orderId: refund.orderId,
          type: "REFUND_COMPLETED",
          actorUserId: input.actor.userId ?? null,
          actorRole: input.actor.role ?? null,
          actorLabel: input.actor.label ?? null,
          note: "The refund was processed.",
        },
      });
    }
  }

  await recordAuditEvent({
    action: "pharmacy.refund_processed",
    entityType: "pharmacy_refund",
    entityId: refund.id,
    outcome: status === "FAILED" ? "FAILURE" : "SUCCESS",
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { orderId: refund.orderId, status, providerRefundId: outcome.providerRefundId },
  });

  return { ok: true, refundId: refund.id, status, amountPaise: refund.amountPaise };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const REFUND_SELECT = {
  id: true,
  orderId: true,
  amountPaise: true,
  reason: true,
  status: true,
  provider: true,
  providerRefundId: true,
  isSandbox: true,
  requestedByLabel: true,
  approvedByLabel: true,
  failureReason: true,
  processedAt: true,
  createdAt: true,
  order: { select: { reference: true, status: true, totalPaise: true } },
} satisfies Prisma.PharmacyRefundSelect;

export type PharmacyRefundView = Prisma.PharmacyRefundGetPayload<{ select: typeof REFUND_SELECT }>;

export async function listRefundsForPharmacy(pharmacyProfileId: string): Promise<PharmacyRefundView[]> {
  return prisma.pharmacyRefund.findMany({
    where: { order: { pharmacyProfileId } },
    orderBy: { createdAt: "desc" },
    select: REFUND_SELECT,
    take: 200,
  });
}

export async function getRefundForPharmacy(
  pharmacyProfileId: string,
  refundId: string,
): Promise<PharmacyRefundView | null> {
  const refund = await prisma.pharmacyRefund.findUnique({ where: { id: refundId }, select: REFUND_SELECT });
  if (!refund) return null;
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: refund.orderId },
    select: { pharmacyProfileId: true },
  });
  if (!order || order.pharmacyProfileId !== pharmacyProfileId) return null;
  return refund;
}
