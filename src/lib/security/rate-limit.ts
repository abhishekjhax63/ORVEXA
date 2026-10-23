import "server-only";

import { prisma } from "@/lib/db/prisma";

/**
 * Database-backed fixed-window rate limiting.
 *
 * A shared store is used rather than in-process memory so the limit also holds
 * when several server instances are running. Every limit is keyed by both the
 * action and an identity dimension (account, IP, or both) to blunt brute-force
 * attempts against a single account without punishing an entire shared network.
 */
export type RateLimitRule = {
  /** Maximum number of attempts allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export const RATE_LIMITS = {
  register: { limit: 5, windowSeconds: 60 * 60 },
  loginByEmail: { limit: 8, windowSeconds: 15 * 60 },
  loginByIp: { limit: 25, windowSeconds: 15 * 60 },
  otpRequest: { limit: 5, windowSeconds: 15 * 60 },
  otpVerify: { limit: 10, windowSeconds: 15 * 60 },
  passwordResetRequest: { limit: 5, windowSeconds: 60 * 60 },
  passwordResetConfirm: { limit: 10, windowSeconds: 60 * 60 },
  passwordChange: { limit: 5, windowSeconds: 60 * 60 },
  verificationResend: { limit: 3, windowSeconds: 30 * 60 },
  appointmentWrite: { limit: 30, windowSeconds: 60 * 60 },
  profileWrite: { limit: 40, windowSeconds: 60 * 60 },
  fileUpload: { limit: 15, windowSeconds: 60 * 60 },
  providerWrite: { limit: 60, windowSeconds: 60 * 60 },
  /**
   * Emergency limits are deliberately generous: a rate limit must never stop a
   * genuine second emergency. They exist to stop scripted abuse of the fan-out
   * and of the paid geocoding provider, not to ration real calls for help.
   */
  emergencyCreate: { limit: 12, windowSeconds: 15 * 60 },
  emergencyRetry: { limit: 20, windowSeconds: 15 * 60 },
  emergencyContactWrite: { limit: 30, windowSeconds: 60 * 60 },
  emergencyLocationShare: { limit: 20, windowSeconds: 60 * 60 },
  emergencyRespondCallback: { limit: 120, windowSeconds: 60 * 60 },
  emergencyStatusPoll: { limit: 600, windowSeconds: 15 * 60 },
  geoLookup: { limit: 90, windowSeconds: 15 * 60 },
  /**
   * AI limits. The turn limit is the one that matters: every turn is a paid
   * model call, and the assistant's answers are medical statements, so a script
   * hammering it is both a cost problem and a safety one. The transcribe limit
   * is higher because a voice note is typed in place of a message, not instead
   * of one.
   */
  aiTurn: { limit: 30, windowSeconds: 60 * 60 },
  aiTranscribe: { limit: 40, windowSeconds: 60 * 60 },
  aiUpload: { limit: 20, windowSeconds: 60 * 60 },
  aiWrite: { limit: 60, windowSeconds: 60 * 60 },
  aiShare: { limit: 20, windowSeconds: 60 * 60 },
  aiReviewWrite: { limit: 60, windowSeconds: 60 * 60 },
  /**
   * Pharmacy limits.
   *
   * Checkout is the tight one: every attempt creates an order row and a payment
   * intent, so an unbounded loop is a cost and a reconciliation problem. The
   * webhook limiter is set high because a genuine provider retry burst must never
   * be dropped — a dropped webhook is an unpaid order that looks paid.
   */
  pharmacyCartWrite: { limit: 120, windowSeconds: 60 * 60 },
  pharmacyCheckout: { limit: 15, windowSeconds: 60 * 60 },
  pharmacyAddressWrite: { limit: 40, windowSeconds: 60 * 60 },
  pharmacyPrescriptionUpload: { limit: 20, windowSeconds: 60 * 60 },
  pharmacyPrescriptionReview: { limit: 120, windowSeconds: 60 * 60 },
  pharmacyFulfilmentWrite: { limit: 240, windowSeconds: 60 * 60 },
  pharmacyInventoryWrite: { limit: 300, windowSeconds: 60 * 60 },
  pharmacyRefundWrite: { limit: 60, windowSeconds: 60 * 60 },
  paymentWebhook: { limit: 2000, windowSeconds: 60 * 60 },
  paymentAttempt: { limit: 30, windowSeconds: 60 * 60 },
  /**
   * Insurance limits.
   *
   * A claim submission writes several rows and, where an insurer is integrated,
   * spends a paid API call, so duplicate submissions are throttled. The insurer
   * desk is generous because a reviewer works through a queue in one sitting.
   */
  insurancePolicyWrite: { limit: 40, windowSeconds: 60 * 60 },
  insuranceClaimWrite: { limit: 20, windowSeconds: 60 * 60 },
  insurancePreAuthWrite: { limit: 20, windowSeconds: 60 * 60 },
  insuranceEligibilityRequest: { limit: 30, windowSeconds: 60 * 60 },
  insuranceDocumentUpload: { limit: 40, windowSeconds: 60 * 60 },
  insuranceNetworkSearch: { limit: 300, windowSeconds: 60 * 60 },
  insurerDeskWrite: { limit: 300, windowSeconds: 60 * 60 },
  insurerProductWrite: { limit: 120, windowSeconds: 60 * 60 },
  insurerNetworkWrite: { limit: 200, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: Date }
  | { allowed: false; remaining: 0; resetAt: Date; retryAfterSeconds: number };

export function rateLimitKey(name: RateLimitName, identity: string) {
  return `${name}:${identity.toLowerCase().slice(0, 180)}`;
}

export async function consumeRateLimit(
  name: RateLimitName,
  identity: string,
  rule: RateLimitRule = RATE_LIMITS[name],
): Promise<RateLimitResult> {
  const key = rateLimitKey(name, identity);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + rule.windowSeconds * 1000);

  const existing = await prisma.rateLimitCounter.findUnique({ where: { key } });

  if (!existing || existing.expiresAt <= now) {
    await prisma.rateLimitCounter.upsert({
      where: { key },
      create: { key, count: 1, windowStartedAt: now, expiresAt: windowEnd },
      update: { count: 1, windowStartedAt: now, expiresAt: windowEnd },
    });
    return { allowed: true, remaining: rule.limit - 1, resetAt: windowEnd };
  }

  if (existing.count >= rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.expiresAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt.getTime() - now.getTime()) / 1000)),
    };
  }

  const updated = await prisma.rateLimitCounter.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  return { allowed: true, remaining: Math.max(rule.limit - updated.count, 0), resetAt: updated.expiresAt };
}

/** Used after a successful sign-in so a legitimate user is not throttled. */
export async function clearRateLimit(name: RateLimitName, identity: string) {
  await prisma.rateLimitCounter.deleteMany({ where: { key: rateLimitKey(name, identity) } });
}

export async function purgeExpiredRateLimits() {
  const result = await prisma.rateLimitCounter.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return result.count;
}
