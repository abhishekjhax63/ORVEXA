import "server-only";

import { getPaymentProviderConfig, isProduction } from "@/lib/env";

import type { PaymentProvider } from "./provider";
import { createRazorpayProvider } from "./razorpay";
import { createSandboxProvider } from "./sandbox";

/**
 * Provider selection.
 *
 * Which provider is in use is decided entirely by configuration and is never
 * guessed. The consequence worth stating plainly: a production deployment with
 * no gateway configured reports payment as *unavailable*. It does not fall back
 * to the sandbox, because a fallback that confirms orders without taking money
 * is the most expensive kind of bug a shop can have.
 */

let cached: { key: string; provider: PaymentProvider } | null = null;

export function getPaymentProvider(): PaymentProvider {
  const config = getPaymentProviderConfig();

  if (config.mode === "razorpay") {
    const key = `razorpay:${config.keyId}:${config.currency}`;
    if (!cached || cached.key !== key) cached = { key, provider: createRazorpayProvider(config) };
    return cached.provider;
  }

  const key = `sandbox:${config.currency}:${isProduction() ? "production" : "development"}`;
  if (!cached || cached.key !== key) cached = { key, provider: createSandboxProvider(config.currency) };
  return cached.provider;
}

export type PaymentAvailability = {
  available: boolean;
  /** Which provider would handle a payment right now. */
  provider: "SANDBOX" | "RAZORPAY";
  label: string;
  /** True only when the provider can move real money. */
  isLive: boolean;
  /** True when a payment is a rehearsal and must be labelled as one. */
  isSandbox: boolean;
  /** True when a callback from this provider can be authenticated. */
  webhooksVerifiable: boolean;
  /** Shown verbatim on the checkout page. Never claims more than is true. */
  notice: string;
};

const SANDBOX_NOTICE =
  "Sandbox payment. No money is taken, no card is charged, and this order is marked as a rehearsal. Configure Razorpay keys to take real payments.";

export function paymentAvailability(): PaymentAvailability {
  const config = getPaymentProviderConfig();

  if (config.mode === "razorpay") {
    return {
      available: true,
      provider: "RAZORPAY",
      label: config.isLive ? "Razorpay" : "Razorpay (test mode)",
      isLive: config.isLive,
      isSandbox: false,
      webhooksVerifiable: Boolean(config.webhookSecret),
      notice: config.isLive
        ? "Payments are handled by Razorpay. Your card details are entered on Razorpay's own page and never reach ORVEXA."
        : "Razorpay is configured with test keys, so payments are simulated by Razorpay and no money is taken. Orders placed now are test orders.",
    };
  }

  if (isProduction()) {
    return {
      available: false,
      provider: "SANDBOX",
      label: "Not configured",
      isLive: false,
      isSandbox: true,
      webhooksVerifiable: false,
      notice:
        "No payment gateway is configured on this deployment, so medicine orders cannot be paid for here. Nothing was charged.",
    };
  }

  return {
    available: true,
    provider: "SANDBOX",
    label: "Sandbox gateway",
    isLive: false,
    isSandbox: true,
    webhooksVerifiable: false,
    notice: SANDBOX_NOTICE,
  };
}
