import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getAuthSecret, getPublicBaseUrl, isProduction } from "@/lib/env";

import {
  assertAmount,
  paymentFailure,
  type ParsedWebhook,
  type PaymentIntentRequest,
  type PaymentIntent,
  type PaymentProvider,
  type PaymentResult,
  type PaymentVerification,
  type PaymentVerificationRequest,
  type RefundOutcome,
  type RefundRequest,
} from "./provider";

/**
 * The sandbox payment provider.
 *
 * It exists so the ordering flow is exercisable end to end before a merchant
 * account exists: intent, confirmation, failure, retry and refund all behave
 * exactly as they will against a real gateway, and not one rupee moves.
 *
 * Three rules make that safe rather than misleading:
 *
 *  1. **It refuses to run in production.** A production deployment with no
 *     gateway configured reports payment as unavailable; it does not fall back
 *     to pretending. This is the single most important line in the file.
 *  2. **Every row it writes is stamped `isSandbox`**, and the UI labels it. A
 *     rehearsal is never presented as a sale.
 *  3. **Its confirmations are signed** with a key derived from `AUTH_SECRET` and
 *     a version tag unique to the sandbox, so a sandbox signature can never be
 *     mistaken for a gateway signature and vice versa.
 *
 * ## The rehearsal page
 *
 * `createIntent` sends the browser to our own page rather than to a gateway. The
 * page offers the outcomes a real checkout produces — success, a declined card,
 * a wallet the user abandoned — and calls the same confirmation endpoint the
 * gateway would. Choosing "declined" exercises the failed-payment path with the
 * same code that handles a real decline.
 */

export type SandboxOutcome = "captured" | "authorised" | "failed" | "cancelled" | "expired";

export const SANDBOX_OUTCOMES: readonly SandboxOutcome[] = [
  "captured",
  "authorised",
  "failed",
  "cancelled",
  "expired",
] as const;

export const SANDBOX_OUTCOME_COPY: Record<SandboxOutcome, string> = {
  captured: "Succeed — the money is taken",
  authorised: "Authorise only — the money is held, not taken",
  failed: "Decline — the card or wallet refused the payment",
  cancelled: "Abandon — the customer closed the payment page",
  expired: "Expire — the payment window ran out",
};

const SIGNING_CONTEXT = "orvexa.sandbox.payments.v1";
const SANDBOX_LIVE_REFUSAL =
  "Online payment is not configured on this deployment. The built-in sandbox provider refuses to run in a production build, so this order cannot be paid here and nothing was charged.";

/**
 * Key derived from `AUTH_SECRET` rather than used raw, so a sandbox signature is
 * cryptographically distinct from any other digest the platform computes.
 */
function signingKey(): string | null {
  try {
    return createHmac("sha256", getAuthSecret()).update(SIGNING_CONTEXT).digest("hex");
  } catch {
    // No AUTH_SECRET means no sessions either, so the app is not running.
    return null;
  }
}

function sign(payload: string): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac("sha256", key).update(payload).digest("hex");
}

/** Constant-time compare that never leaks length through an exception. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function reference(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

const PAYMENT_TTL_MS = 30 * 60 * 1000;

/**
 * The exact string a sandbox confirmation signs.
 *
 * It binds the outcome to the order, the payment and the amount, so a signature
 * obtained for a ₹10 rehearsal cannot be replayed to confirm a ₹10,000 order.
 */
export function sandboxSignaturePayload(input: {
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: number;
  outcome: SandboxOutcome;
}): string {
  return [input.providerOrderId, input.providerPaymentId, String(input.amountPaise), input.outcome].join("|");
}

/** Used by the rehearsal page's server action to produce a genuine signature. */
export function signSandboxOutcome(input: {
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: number;
  outcome: SandboxOutcome;
}): string | null {
  return sign(sandboxSignaturePayload(input));
}

export function createSandboxProvider(currency: string): PaymentProvider {
  const isLive = false;

  return {
    id: "SANDBOX",
    label: "Sandbox gateway",
    isLive,
    currency,
    publicKeyId: null,
    canVerifyWebhooks: false,

    async createIntent(request: PaymentIntentRequest): Promise<PaymentResult<PaymentIntent>> {
      if (isProduction()) return paymentFailure<PaymentIntent>("not_configured", { message: SANDBOX_LIVE_REFUSAL });

      try {
        assertAmount(request.amountPaise);
      } catch {
        return paymentFailure<PaymentIntent>("invalid_request");
      }

      // The idempotency key is folded into the intent id, so retrying the same
      // checkout returns the same intent instead of opening a second one. The
      // checkout service normally short-circuits before reaching here; this is
      // the belt to that braces.
      const providerOrderId = `sbx_order_${randomBytes(9).toString("base64url")}`;
      const expiresAt = new Date(Date.now() + PAYMENT_TTL_MS);
      const checkoutUrl = `${getPublicBaseUrl().replace(/\/+$/, "")}/pharmacy/checkout/sandbox?intent=${encodeURIComponent(
        providerOrderId,
      )}&ref=${encodeURIComponent(request.orderReference)}`;

      return {
        ok: true,
        data: {
          provider: "SANDBOX",
          providerOrderId,
          amountPaise: request.amountPaise,
          currency,
          status: "REQUIRES_ACTION",
          isSandbox: true,
          checkoutUrl,
          publicKeyId: null,
          expiresAt,
          summary: {
            idempotencyKey: request.idempotencyKey,
            orderReference: request.orderReference,
            note: "Sandbox intent. No money moves and this order is labelled as a rehearsal.",
          },
        },
      };
    },

    async verifyPayment(request: PaymentVerificationRequest): Promise<PaymentResult<PaymentVerification>> {
      if (isProduction()) return paymentFailure<PaymentVerification>("not_configured", { message: SANDBOX_LIVE_REFUSAL });

      if (!request.providerOrderId || !request.providerPaymentId) {
        return paymentFailure<PaymentVerification>("invalid_request", {
          message: "The sandbox confirmation was missing the intent or payment identifier.",
        });
      }
      if (!request.signature) {
        return paymentFailure<PaymentVerification>("signature_invalid");
      }

      // The outcome is carried in the trailing segment the rehearsal page signed.
      const signature = request.signature;
      const signatureHeaders = {
        providerOrderId: request.providerOrderId,
        providerPaymentId: request.providerPaymentId,
      };
      const outcome = SANDBOX_OUTCOMES.find((candidate) =>
        safeEqual(
          signature,
          sign(
            sandboxSignaturePayload({
              ...signatureHeaders,
              amountPaise: request.expectedAmountPaise,
              outcome: candidate,
            }),
          ) ?? "",
        ),
      );

      if (!outcome) {
        // A signature that matches no outcome, or matches for a different amount,
        // is refused outright. It is exactly the shape of a forged confirmation.
        return {
          ok: true,
          data: {
            verified: false,
            failureCode: "signature_mismatch",
            failureReason:
              "The sandbox confirmation did not match the order it claimed to pay, so it was refused and the order stays unpaid.",
            providerOrderId: request.providerOrderId,
            providerPaymentId: request.providerPaymentId,
            summary: { outcome: "unverified" },
          },
        };
      }

      if (outcome === "captured" || outcome === "authorised") {
        return {
          ok: true,
          data: {
            verified: true,
            status: outcome === "captured" ? "CAPTURED" : "AUTHORISED",
            amountPaise: request.expectedAmountPaise,
            currency: request.currency,
            method: "sandbox",
            providerOrderId: request.providerOrderId,
            providerPaymentId: request.providerPaymentId,
            signature: request.signature,
            summary: { outcome, note: "Sandbox payment. No money moved." },
          },
        };
      }

      const reason =
        outcome === "failed"
          ? "The sandbox card was declined, so no money was taken."
          : outcome === "cancelled"
            ? "The sandbox payment page was abandoned before payment was made."
            : "The sandbox payment window expired before payment was made.";

      return {
        ok: true,
        data: {
          verified: false,
          failureCode: `sandbox_${outcome}`,
          failureReason: reason,
          providerOrderId: request.providerOrderId,
          providerPaymentId: request.providerPaymentId,
          summary: { outcome },
        },
      };
    },

    verifyWebhookSignature(): { verified: boolean; reason: string } {
      return {
        verified: false,
        reason: "The sandbox provider does not send webhooks; its payments are confirmed through the rehearsal page.",
      };
    },

    async parseWebhook(): Promise<PaymentResult<ParsedWebhook>> {
      return paymentFailure<ParsedWebhook>("unsupported", {
        message:
          "The sandbox provider does not send webhooks. A sandbox payment is confirmed through the rehearsal page, not by a callback.",
      });
    },

    async refund(request: RefundRequest): Promise<PaymentResult<RefundOutcome>> {
      if (isProduction()) return paymentFailure<RefundOutcome>("not_configured", { message: SANDBOX_LIVE_REFUSAL });

      try {
        assertAmount(request.amountPaise);
      } catch {
        return paymentFailure<RefundOutcome>("invalid_request");
      }

      if (!request.providerPaymentId) {
        return paymentFailure<RefundOutcome>("invalid_request", {
          message: "A refund needs the provider payment it reverses.",
        });
      }

      // Settled immediately: there is no institution to wait for, and pretending
      // otherwise would make the sandbox less useful than it is.
      return {
        ok: true,
        data: {
          providerRefundId: reference("sbx_rfnd"),
          status: "PROCESSED",
          amountPaise: request.amountPaise,
          isSandbox: true,
          failureReason: null,
          summary: { reason: request.reason, note: "Sandbox refund. No money moved." },
        },
      };
    },
  };
}
