import "server-only";

import type { AuthChallengePurpose, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  createLinkToken,
  createNumericCode,
  hmacDigest,
  safeCompare,
} from "@/lib/auth/tokens";

/**
 * One-time codes and verification links.
 *
 * Both are stored as keyed digests (never plaintext) with an expiry, an attempt
 * counter and a single-use marker. Codes protect sign-in and phone verification;
 * links protect email verification and password reset.
 */
export type ChallengeKind = "code" | "link";

type ChallengePolicy = {
  kind: ChallengeKind;
  ttlMinutes: number;
  maxAttempts: number;
  label: string;
};

export const CHALLENGE_POLICIES: Record<AuthChallengePurpose, ChallengePolicy> = {
  EMAIL_VERIFICATION: { kind: "link", ttlMinutes: 60 * 24, maxAttempts: 10, label: "email verification link" },
  LOGIN_OTP: { kind: "code", ttlMinutes: 10, maxAttempts: 5, label: "sign-in code" },
  PASSWORD_RESET: { kind: "link", ttlMinutes: 30, maxAttempts: 10, label: "password reset link" },
  PHONE_VERIFICATION: { kind: "code", ttlMinutes: 10, maxAttempts: 5, label: "phone verification code" },
};

function challengeDigest(secret: string, purpose: AuthChallengePurpose) {
  return hmacDigest(secret, `challenge.${purpose}`);
}

export type IssuedChallenge = {
  /** Raw value to deliver to the user. Never persisted. */
  secret: string;
  kind: ChallengeKind;
  expiresAt: Date;
  challengeId: string;
};

/**
 * Issues a fresh challenge and invalidates any earlier unconsumed challenge for
 * the same identifier and purpose, so only the newest secret can be used.
 */
export async function issueChallenge(input: {
  identifier: string;
  purpose: AuthChallengePurpose;
  userId?: string | null;
  context?: { ipAddress?: string };
}): Promise<IssuedChallenge> {
  const identifier = input.identifier.trim().toLowerCase();
  const policy = CHALLENGE_POLICIES[input.purpose];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + policy.ttlMinutes * 60 * 1000);
  const secret = policy.kind === "code" ? createNumericCode(6) : createLinkToken();

  const created = await prisma.$transaction(async (tx) => {
    await tx.authChallenge.updateMany({
      where: { identifier, purpose: input.purpose, consumedAt: null },
      data: { consumedAt: now },
    });

    return tx.authChallenge.create({
      data: {
        identifier,
        purpose: input.purpose,
        userId: input.userId ?? null,
        codeHash: challengeDigest(secret, input.purpose),
        expiresAt,
        maxAttempts: policy.maxAttempts,
        ipAddress: input.context?.ipAddress ?? null,
      },
      select: { id: true },
    });
  });

  return { secret, kind: policy.kind, expiresAt, challengeId: created.id };
}

export type ChallengeFailure = "not_found" | "expired" | "too_many_attempts" | "mismatch";

export type ChallengeVerification =
  | { ok: true; userId: string | null; challengeId: string }
  | { ok: false; reason: ChallengeFailure };

/** Verifies and consumes a challenge. A wrong code burns one attempt. */
export async function verifyChallenge(input: {
  identifier: string;
  purpose: AuthChallengePurpose;
  secret: string;
}): Promise<ChallengeVerification> {
  const identifier = input.identifier.trim().toLowerCase();
  const secret = input.secret.trim();
  if (!secret) return { ok: false, reason: "mismatch" };

  const challenge = await prisma.authChallenge.findFirst({
    where: { identifier, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, expiresAt: true, attempts: true, maxAttempts: true, userId: true },
  });

  if (!challenge) return { ok: false, reason: "not_found" };
  if (challenge.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (challenge.attempts >= challenge.maxAttempts) return { ok: false, reason: "too_many_attempts" };

  const matches = safeCompare(challenge.codeHash, challengeDigest(secret, input.purpose));

  if (!matches) {
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "mismatch" };
  }

  // Consumption is a conditional update so a concurrent replay cannot succeed twice.
  const consumed = await prisma.authChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) return { ok: false, reason: "not_found" };

  return { ok: true, userId: challenge.userId, challengeId: challenge.id };
}

export async function purgeExpiredChallenges() {
  const result = await prisma.authChallenge.deleteMany({
    where: { OR: [{ expiresAt: { lte: new Date() } }, { consumedAt: { not: null } }] },
  });
  return result.count;
}

export type ChallengeMetadata = Pick<Prisma.AuthChallengeCreateInput, "identifier" | "purpose">;
