import "server-only";

/**
 * The replaceable payment provider interface.
 *
 * ## Why this exists
 *
 * The pharmacy has to be orderable before it has a merchant account. Rather than
 * writing Razorpay calls into the checkout service and stubbing them in tests,
 * checkout talks to `PaymentProvider` and nothing above this file knows a vendor
 * name, an endpoint or a payload shape.
 *
 * Two implementations ship:
 *
 *  - `sandbox` — a real, working stand-in that settles nothing. It needs no keys
 *    at all. Every row it produces is stamped `isSandbox`, and it refuses to act
 *    in a production build, so a rehearsal can never be mistaken for a sale.
 *  - `razorpay` — the live gateway, selected only when both a key id and a key
 *    secret are configured.
 *
 * ## The failure contract
 *
 * A provider never throws for an expected condition and never reports a payment
 * as captured unless the provider itself said so. Every call resolves to
 * `PaymentResult`, and a failure carries a kind the caller can render.
 *
 * There is deliberately no fallback that marks an order paid when a gateway call
 * fails. An unconfirmed payment stays unconfirmed, and the order stays unpaid.
 *
 * ## Money
 *
 * Every amount on this interface is an integer number of paise. There is no
 * floating point anywhere in the payment path, and `assertAmount` rejects a
 * non-integer rather than rounding it, because rounding is how a rupee goes
 * missing.
 */

export type PaymentProviderId = "SANDBOX" | "RAZORPAY";

export type PaymentErrorKind =
  | "not_configured"
  | "invalid_request"
  | "timeout"
  | "network_error"
  | "provider_error"
  | "signature_invalid"
  | "unsupported";

export type PaymentError = {
  kind: PaymentErrorKind;
  /** Safe to render. Never contains a key, a token or a raw provider payload. */
  message: string;
  /** Upstream HTTP status, when there was one. */
  status?: number;
  /** Provider's own error code, when it gave one. */
  providerCode?: string;
};

export type PaymentResult<T> = { ok: true; data: T } | { ok: false; error: PaymentError };

export const PAYMENT_ERROR_COPY: Record<PaymentErrorKind, string> = {
  not_configured:
    "Online payment is not configured on this deployment, so this order cannot be paid here. Nothing was charged.",
  invalid_request: "The payment request was rejected before it was sent. Nothing was charged.",
  timeout: "The payment gateway did not respond in time. Nothing was charged — you can try again.",
  network_error: "The payment gateway could not be reached. Nothing was charged — you can try again.",
  provider_error: "The payment gateway returned an error. The order is still unpaid.",
  signature_invalid:
    "The payment confirmation could not be verified as coming from the gateway, so it was refused.",
  unsupported: "This operation is not supported by the configured payment provider.",
};

export function paymentFailure<T>(
  kind: PaymentErrorKind,
  extra?: { status?: number; providerCode?: string; message?: string },
): PaymentResult<T> {
  return {
    ok: false,
    error: {
      kind,
      message: extra?.message ?? PAYMENT_ERROR_COPY[kind],
      status: extra?.status,
      providerCode: extra?.providerCode,
    },
  };
}

/** Rejects anything that is not a positive whole number of paise. */
export function assertAmount(amountPaise: number): void {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new Error(`Payment amounts must be a positive whole number of paise, received ${amountPaise}.`);
  }
}

// ---------------------------------------------------------------------------
// Creating a payment
// ---------------------------------------------------------------------------

export type PaymentIntentRequest = {
  /** Our own order id. Recorded in the provider's notes for reconciliation. */
  orderId: string;
  /** Customer-facing reference, e.g. ORX-PH-7K2M4Q. */
  orderReference: string;
  amountPaise: number;
  currency: string;
  /**
   * Client-supplied key that makes retrying the same checkout safe. The provider
   * is expected to return the same intent for the same key rather than creating a
   * second chargeable order.
   */
  idempotencyKey: string;
  /** Where the gateway should send the browser back to. */
  returnUrl: string;
  customer?: { name?: string | null; email?: string | null; phone?: string | null };
  /** Free-form, non-sensitive context stored alongside the intent. */
  notes?: Record<string, string>;
};

export type PaymentIntent = {
  provider: PaymentProviderId;
  /** The provider's own identifier for this intent. */
  providerOrderId: string;
  amountPaise: number;
  currency: string;
  status: "CREATED" | "REQUIRES_ACTION";
  isSandbox: boolean;
  /**
   * Where the browser must go to pay. The sandbox points at our own rehearsal
   * page; Razorpay uses the client-side checkout with `publicKeyId` instead.
   */
  checkoutUrl: string | null;
  /** Public key for a client-side checkout. Never the secret. */
  publicKeyId: string | null;
  expiresAt: Date | null;
  /** Provider response summary, with anything secret removed. */
  summary: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Verifying a payment
// ---------------------------------------------------------------------------

export type PaymentVerificationRequest = {
  providerOrderId: string | null;
  providerPaymentId: string;
  /** The gateway's signature over the order/payment pair, when it sends one. */
  signature: string | null;
  /** What we computed server-side and are prepared to accept. */
  expectedAmountPaise: number;
  currency: string;
};

export type PaymentVerification =
  | {
      verified: true;
      status: "CAPTURED" | "AUTHORISED";
      amountPaise: number;
      currency: string;
      method: string | null;
      providerOrderId: string | null;
      providerPaymentId: string;
      signature: string | null;
      summary: Record<string, unknown>;
    }
  | {
      verified: false;
      /** Why the confirmation was refused, in words the order timeline can show. */
      failureCode: string;
      failureReason: string;
      providerOrderId: string | null;
      providerPaymentId: string | null;
      summary: Record<string, unknown>;
    };

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * What a webhook meant, once parsed.
 *
 * `ignored` is a first-class outcome: most of a gateway's event stream is
 * irrelevant to us, and saying so is better than guessing at an action.
 */
export type ParsedWebhook = {
  eventId: string;
  eventType: string;
  kind: "payment_captured" | "payment_failed" | "refund_processed" | "ignored";
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerRefundId: string | null;
  amountPaise: number | null;
  failureReason: string | null;
  summary: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export type RefundRequest = {
  providerPaymentId: string;
  amountPaise: number;
  currency: string;
  reason: string;
  idempotencyKey: string;
  notes?: Record<string, string>;
};

export type RefundOutcome = {
  providerRefundId: string;
  /** `PROCESSING` means the gateway accepted it and has not settled it yet. */
  status: "PROCESSING" | "PROCESSED" | "FAILED";
  amountPaise: number;
  isSandbox: boolean;
  failureReason: string | null;
  summary: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly label: string;
  /** False for anything that cannot move real money. */
  readonly isLive: boolean;
  readonly currency: string;
  /** Browser-safe key. `null` when the provider needs no client-side checkout. */
  readonly publicKeyId: string | null;
  /** True when this provider can prove a call really came from it. */
  readonly canVerifyWebhooks: boolean;

  createIntent(request: PaymentIntentRequest): Promise<PaymentResult<PaymentIntent>>;
  verifyPayment(request: PaymentVerificationRequest): Promise<PaymentResult<PaymentVerification>>;
  /** Signature check only. Returns a verdict, never throws. */
  verifyWebhookSignature(input: { rawBody: string; signatureHeader: string | null }): {
    verified: boolean;
    reason: string;
  };
  /**
   * Reads a verified webhook body.
   *
   * `providerEventId` is the gateway's own delivery id when it sends one. A
   * provider that sends none derives a stable id from the body, so replaying the
   * same delivery is still detected.
   */
  parseWebhook(input: { rawBody: string; providerEventId?: string | null }): Promise<PaymentResult<ParsedWebhook>>;
  refund(request: RefundRequest): Promise<PaymentResult<RefundOutcome>>;
  /** Reconciles a refund the gateway accepted but has not settled. */
  fetchRefundStatus?(providerRefundId: string): Promise<PaymentResult<RefundOutcome>>;
}
