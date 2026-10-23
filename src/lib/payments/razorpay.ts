import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentProviderConfig } from "@/lib/env";

import {
  assertAmount,
  paymentFailure,
  type ParsedWebhook,
  type PaymentIntent,
  type PaymentIntentRequest,
  type PaymentProvider,
  type PaymentResult,
  type PaymentVerification,
  type PaymentVerificationRequest,
  type RefundOutcome,
  type RefundRequest,
} from "./provider";

/**
 * The Razorpay provider.
 *
 * Only constructed when a key id *and* a key secret are present, because a
 * half-configured gateway is worse than none: the order would be created and
 * never captured.
 *
 * ## Signature versus API
 *
 * Razorpay has two independent ways to tell us a payment succeeded, and they are
 * not interchangeable:
 *
 *  - the **checkout handler signature**, an HMAC over `order_id|payment_id` keyed
 *    with the API secret. It proves the browser was handed a real payment id.
 *  - the **API record**, fetched with our key, which says what the payment's
 *    status and amount actually are.
 *
 * This provider requires both when a signature is supplied. A signature proves
 * authorship; only the API record proves the money was taken, and only the API
 * record knows the amount. Verifying the signature alone would accept an
 * authorised-but-uncaptured payment as paid.
 *
 * ## Webhooks
 *
 * A callback is signed with the *webhook* secret, which is configured in the
 * Razorpay dashboard and is a different value from the API secret. When it is not
 * set, every callback is refused rather than trusted — an unsigned "payment
 * captured" call is just an anonymous HTTP request.
 *
 * Secrets never leave this module and never appear in a log line or in the
 * summaries written to the database.
 */

type RazorpayConfig = Extract<PaymentProviderConfig, { mode: "razorpay" }>;

const API_BASE = "https://api.razorpay.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;

type RazorpayOrder = {
  id?: string;
  entity?: string;
  amount?: number;
  currency?: string;
  receipt?: string | null;
  status?: string;
  created_at?: number;
  notes?: Record<string, string>;
};

type RazorpayPayment = {
  id?: string;
  entity?: string;
  order_id?: string | null;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string | null;
  captured?: boolean;
  error_code?: string | null;
  error_description?: string | null;
  created_at?: number;
};

type RazorpayRefund = {
  id?: string;
  entity?: string;
  payment_id?: string | null;
  amount?: number;
  currency?: string;
  status?: string;
  notes?: Record<string, string>;
  created_at?: number;
};

function basicAuth(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/** Constant-time compare that tolerates unequal lengths without throwing. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createRazorpayProvider(config: RazorpayConfig): PaymentProvider {
  async function call<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string },
  ): Promise<PaymentResult<T>> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: init.method,
        headers: {
          Authorization: basicAuth(config.keyId, config.keySecret),
          "Content-Type": "application/json",
          // Razorpay honours this header for order and refund creation, which is
          // what stops a retried request from creating a second charge.
          ...(init.idempotencyKey ? { "X-Razorpay-Idempotency-Key": init.idempotencyKey } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return paymentFailure<T>(timedOut ? "timeout" : "network_error");
    }

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const detail = parsed as { error?: { code?: string; description?: string } } | null;
      // The provider's description is safe to surface; the request body never is.
      return paymentFailure<T>("provider_error", {
        status: response.status,
        providerCode: detail?.error?.code,
        message:
          response.status === 401
            ? "The payment gateway rejected our credentials, so nothing was charged."
            : `The payment gateway refused the request (${response.status})${
                detail?.error?.description ? `: ${detail.error.description}` : "."
              }`,
      });
    }

    return { ok: true, data: parsed as T };
  }

  return {
    id: "RAZORPAY",
    label: config.isLive ? "Razorpay" : "Razorpay (test mode)",
    isLive: config.isLive,
    currency: config.currency,
    publicKeyId: config.keyId,
    canVerifyWebhooks: Boolean(config.webhookSecret),

    async createIntent(request: PaymentIntentRequest): Promise<PaymentResult<PaymentIntent>> {
      try {
        assertAmount(request.amountPaise);
      } catch {
        return paymentFailure<PaymentIntent>("invalid_request");
      }

      const result = await call<RazorpayOrder>("/orders", {
        method: "POST",
        idempotencyKey: request.idempotencyKey,
        body: {
          amount: request.amountPaise,
          currency: request.currency,
          receipt: request.orderReference,
          // Auto-capture, so an authorised payment is not left holding funds
          // indefinitely. The dashboard setting must agree with this.
          payment_capture: 1,
          notes: {
            orderId: request.orderId,
            orderReference: request.orderReference,
            ...(request.notes ?? {}),
          },
        },
      });
      if (!result.ok) return result;

      const order = result.data;
      if (!order.id) {
        return paymentFailure<PaymentIntent>("provider_error", {
          message: "The payment gateway accepted the request but returned no order identifier.",
        });
      }

      return {
        ok: true,
        data: {
          provider: "RAZORPAY",
          providerOrderId: order.id,
          amountPaise: order.amount ?? request.amountPaise,
          currency: order.currency ?? request.currency,
          status: "REQUIRES_ACTION",
          isSandbox: false,
          // Razorpay is paid through its own client-side checkout, not a redirect.
          checkoutUrl: null,
          publicKeyId: config.keyId,
          expiresAt: null,
          summary: { status: order.status ?? "created", receipt: order.receipt ?? null },
        },
      };
    },

    async verifyPayment(request: PaymentVerificationRequest): Promise<PaymentResult<PaymentVerification>> {
      if (!request.providerPaymentId) {
        return paymentFailure<PaymentVerification>("invalid_request", {
          message: "The confirmation carried no payment identifier.",
        });
      }
      if (!request.signature) {
        return paymentFailure<PaymentVerification>("signature_invalid", {
          message: "The confirmation was not signed by the payment gateway, so it was refused.",
        });
      }
      if (!request.providerOrderId) {
        return paymentFailure<PaymentVerification>("invalid_request", {
          message: "The confirmation did not name the payment order it belongs to.",
        });
      }

      // 1. Authorship: the signature must cover exactly this order and payment.
      const expectedSignature = hmacHex(
        `${request.providerOrderId}|${request.providerPaymentId}`,
        config.keySecret,
      );
      if (!safeEqual(expectedSignature, request.signature)) {
        return {
          ok: true,
          data: {
            verified: false,
            failureCode: "signature_mismatch",
            failureReason:
              "The payment signature did not match this order, so the confirmation was refused and the order stays unpaid.",
            providerOrderId: request.providerOrderId,
            providerPaymentId: request.providerPaymentId,
            summary: { checked: "signature" },
          },
        };
      }

      // 2. Truth: only the gateway's own record says whether the money was taken.
      const result = await call<RazorpayPayment>(`/payments/${encodeURIComponent(request.providerPaymentId)}`, {
        method: "GET",
      });
      if (!result.ok) return result;

      const payment = result.data;
      const summary = {
        status: payment.status ?? "unknown",
        method: payment.method ?? null,
        orderId: payment.order_id ?? null,
        amount: payment.amount ?? null,
      };

      if (payment.order_id && payment.order_id !== request.providerOrderId) {
        return {
          ok: true,
          data: {
            verified: false,
            failureCode: "order_mismatch",
            failureReason: "The gateway recorded this payment against a different order, so it was refused.",
            providerOrderId: request.providerOrderId,
            providerPaymentId: request.providerPaymentId,
            summary,
          },
        };
      }

      if (typeof payment.amount === "number" && payment.amount !== request.expectedAmountPaise) {
        return {
          ok: true,
          data: {
            verified: false,
            failureCode: "amount_mismatch",
            failureReason:
              "The amount the gateway captured does not match this order, so it was refused and the order stays unpaid.",
            providerOrderId: request.providerOrderId,
            providerPaymentId: request.providerPaymentId,
            summary,
          },
        };
      }

      if (payment.status === "captured") {
        return {
          ok: true,
          data: {
            verified: true,
            status: "CAPTURED",
            amountPaise: payment.amount ?? request.expectedAmountPaise,
            currency: payment.currency ?? request.currency,
            method: payment.method ?? null,
            providerOrderId: request.providerOrderId,
            providerPaymentId: request.providerPaymentId,
            signature: request.signature,
            summary,
          },
        };
      }

      if (payment.status === "authorized") {
        return {
          ok: true,
          data: {
            verified: true,
            status: "AUTHORISED",
            amountPaise: payment.amount ?? request.expectedAmountPaise,
            currency: payment.currency ?? request.currency,
            method: payment.method ?? null,
            providerOrderId: request.providerOrderId,
            providerPaymentId: request.providerPaymentId,
            signature: request.signature,
            summary,
          },
        };
      }

      return {
        ok: true,
        data: {
          verified: false,
          failureCode: payment.error_code ?? `payment_${payment.status ?? "not_captured"}`,
          failureReason:
            payment.error_description ??
            `The gateway reports this payment as ${payment.status ?? "not captured"}, so no money was taken.`,
          providerOrderId: request.providerOrderId,
          providerPaymentId: request.providerPaymentId,
          summary,
        },
      };
    },

    verifyWebhookSignature({ rawBody, signatureHeader }): { verified: boolean; reason: string } {
      if (!config.webhookSecret) {
        return {
          verified: false,
          reason:
            "No webhook secret is configured, so this callback cannot be verified and was refused. Set RAZORPAY_WEBHOOK_SECRET to accept callbacks.",
        };
      }
      if (!signatureHeader) {
        return { verified: false, reason: "The callback carried no signature header and was refused." };
      }
      const expected = hmacHex(rawBody, config.webhookSecret);
      if (!safeEqual(expected, signatureHeader)) {
        return { verified: false, reason: "The callback signature did not match and the call was refused." };
      }
      return { verified: true, reason: "Signature matched." };
    },

    async parseWebhook({ rawBody, providerEventId }): Promise<PaymentResult<ParsedWebhook>> {
      let payload: {
        event?: string;
        payload?: { payment?: { entity?: RazorpayPayment }; refund?: { entity?: RazorpayRefund } };
      };
      try {
        payload = JSON.parse(rawBody) as typeof payload;
      } catch {
        return paymentFailure<ParsedWebhook>("invalid_request", {
          message: "The callback body was not valid JSON.",
        });
      }

      const eventType = payload.event ?? "unknown";
      const payment = payload.payload?.payment?.entity ?? null;
      const refund = payload.payload?.refund?.entity ?? null;

      // Razorpay does not put a delivery id in the body. Hashing the body gives a
      // stable id, so a retried delivery of the same callback is recognised and
      // the second delivery does nothing.
      const eventId =
        providerEventId && providerEventId.trim() !== ""
          ? providerEventId
          : `body_${createHash("sha256").update(rawBody).digest("hex").slice(0, 40)}`;

      const kind: ParsedWebhook["kind"] =
        eventType === "payment.captured" || eventType === "order.paid"
          ? "payment_captured"
          : eventType === "payment.failed"
            ? "payment_failed"
            : eventType.startsWith("refund.")
              ? "refund_processed"
              : "ignored";

      return {
        ok: true,
        data: {
          eventId,
          eventType,
          kind,
          providerOrderId: payment?.order_id ?? null,
          providerPaymentId: payment?.id ?? refund?.payment_id ?? null,
          providerRefundId: refund?.id ?? null,
          amountPaise: refund?.amount ?? payment?.amount ?? null,
          failureReason: payment?.error_description ?? null,
          summary: {
            status: payment?.status ?? refund?.status ?? null,
            method: payment?.method ?? null,
          },
        },
      };
    },

    async refund(request: RefundRequest): Promise<PaymentResult<RefundOutcome>> {
      try {
        assertAmount(request.amountPaise);
      } catch {
        return paymentFailure<RefundOutcome>("invalid_request");
      }

      const result = await call<RazorpayRefund>(
        `/payments/${encodeURIComponent(request.providerPaymentId)}/refund`,
        {
          method: "POST",
          idempotencyKey: request.idempotencyKey,
          body: { amount: request.amountPaise, notes: { reason: request.reason, ...(request.notes ?? {}) } },
        },
      );
      if (!result.ok) return result;

      return { ok: true, data: toRefundOutcome(result.data, request.amountPaise) };
    },

    async fetchRefundStatus(providerRefundId: string): Promise<PaymentResult<RefundOutcome>> {
      const result = await call<RazorpayRefund>(`/refunds/${encodeURIComponent(providerRefundId)}`, {
        method: "GET",
      });
      if (!result.ok) return result;
      return { ok: true, data: toRefundOutcome(result.data, result.data.amount ?? 0) };
    },
  };
}

function toRefundOutcome(refund: RazorpayRefund, fallbackAmountPaise: number): RefundOutcome {
  // `pending` stays PROCESSING: the gateway accepted the request and has not
  // settled it. Reporting it as processed would overstate what we know.
  const status: RefundOutcome["status"] =
    refund.status === "processed" ? "PROCESSED" : refund.status === "failed" ? "FAILED" : "PROCESSING";

  return {
    providerRefundId: refund.id ?? "",
    status,
    amountPaise: refund.amount ?? fallbackAmountPaise,
    isSandbox: false,
    failureReason: status === "FAILED" ? "The payment gateway reported the refund as failed." : null,
    summary: { status: refund.status ?? "unknown" },
  };
}
