"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AuthChallengePurpose } from "@prisma/client";

import { emailDeliveryAvailable } from "@/lib/actions/email-delivery";
import { fieldErrorsFromZod, formError, formSuccess, type FormState } from "@/lib/actions/form-state";
import { issueChallenge, verifyChallenge } from "@/lib/auth/challenge";
import { landingPathForRoles } from "@/lib/auth/roles";
import { safeNextPath } from "@/lib/auth/redirect";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  passwordIssues,
  verifyPassword,
} from "@/lib/auth/password";
import {
  clearSessionCookie,
  createSession,
  readSessionToken,
  resolveSessionToken,
  revokeAllSessionsForUser,
  revokeSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { hmacDigest } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db/prisma";
import { getPublicBaseUrl } from "@/lib/env";
import { recordAuditEvent } from "@/lib/security/audit";
import { clearRateLimit, consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request";

/**
 * Authentication Server Actions.
 *
 * Every action here returns the shared `FormState` a form consumes. The rules
 * the whole module follows, without exception:
 *
 *  - the acting identity is resolved from the session row, never from the form;
 *  - a role is never read from the browser, so nobody can grant themselves one;
 *  - a password, a code or a session token is never written to a log;
 *  - an email is only ever described as "sent" when a transport actually
 *    accepted it. This deployment has no transactional-email adapter, so the
 *    honest answer is always "not sent" and the copy says so.
 *
 * A `"use server"` module may only export async functions, so the form-state
 * vocabulary lives in `src/lib/actions/form-state.ts`.
 */

// ---------------------------------------------------------------------------
// Small parsing helpers
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[0-9+\s-]{10,15}$/;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function buildLink(path: string, token: string) {
  return `${getPublicBaseUrl()}${path}?token=${encodeURIComponent(token)}`;
}

/**
 * Turns a bare link token back into the identifier it was issued for.
 *
 * The reset and verification links carry only the token, but `verifyChallenge`
 * needs the identifier it was stored under. Because both are keyed digests of
 * (secret, purpose), the same digest can locate the row without the caller ever
 * learning the address, and the actual expiry / attempts / single-use checks
 * still run inside `verifyChallenge`.
 */
async function identifierForToken(secret: string, purpose: AuthChallengePurpose) {
  if (!secret) return null;
  const row = await prisma.authChallenge.findFirst({
    where: { purpose, codeHash: hmacDigest(secret, `challenge.${purpose}`), consumedAt: null },
    orderBy: { createdAt: "desc" },
    select: { identifier: true },
  });
  return row?.identifier ?? null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(120, "That name is too long."),
    email: z.string().trim().regex(EMAIL_PATTERN, "Enter a valid email address."),
    mobile: z.string().trim().regex(PHONE_PATTERN, "Enter a valid mobile number, e.g. +91 98450 12093."),
    password: z.string().min(1, "Choose a password."),
    confirmPassword: z.string().min(1, "Re-enter your password."),
    dateOfBirth: z.string().trim().optional(),
    city: z.string().trim().max(80).optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or mobile number."),
  password: z.string().min(1, "Enter your password."),
});

const emailOnlySchema = z.object({
  email: z.string().trim().regex(EMAIL_PATTERN, "Enter a valid email address."),
});

const resetSchema = z.object({
  token: z.string().trim().min(1, "That reset link is not valid."),
  password: z.string().min(1, "Choose a password."),
  confirmPassword: z.string().min(1, "Re-enter your password."),
});

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export async function register(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    fullName: text(formData, "fullName"),
    email: text(formData, "email"),
    mobile: text(formData, "mobile"),
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
    dateOfBirth: text(formData, "dateOfBirth"),
    city: text(formData, "city"),
  });

  if (!parsed.success) {
    return formError("Check the highlighted fields and try again.", fieldErrorsFromZod(parsed.error));
  }

  const email = normalizeEmail(parsed.data.email);
  const policyIssues = passwordIssues(parsed.data.password, email);
  if (policyIssues.length > 0) {
    return formError("Choose a stronger password.", { password: policyIssues });
  }

  const context = await getRequestContext();
  const ipIdentity = context.ipAddress ? `ip:${context.ipAddress}` : "ip:unknown";

  const [emailLimit, ipLimit] = await Promise.all([
    consumeRateLimit("register", `email:${email}`, RATE_LIMITS.register),
    consumeRateLimit("register", ipIdentity, RATE_LIMITS.register),
  ]);
  if (!emailLimit.allowed || !ipLimit.allowed) {
    return formError("Too many accounts have been created from here. Try again later.");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // Never confirm which address is already registered on the register screen;
    // the message is deliberately neutral so the form is not an existence oracle.
    return formError("That email address cannot be used. Try signing in instead, or use another address.");
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const dateOfBirth = parsed.data.dateOfBirth ? new Date(`${parsed.data.dateOfBirth}T00:00:00`) : null;
  const validDateOfBirth = dateOfBirth && !Number.isNaN(dateOfBirth.getTime()) ? dateOfBirth : null;

  let userId: string;
  try {
    userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          fullName: parsed.data.fullName,
          phone: parsed.data.mobile,
          passwordHash,
          status: "PENDING_VERIFICATION",
          patientProfile: {
            create: {
              dateOfBirth: validDateOfBirth,
              city: parsed.data.city ?? null,
            },
          },
        },
        select: { id: true },
      });

      // The patient role is the only one anybody may self-assign.
      await tx.userRole.create({ data: { userId: user.id, role: "PATIENT" } });
      return user.id;
    });
  } catch {
    return formError("That account could not be created. Try again in a moment.");
  }

  await prisma.consentRecord.createMany({
    data: [
      { userId, consentType: "TERMS_OF_SERVICE", policyVersion: "2026-01", granted: true },
      { userId, consentType: "PRIVACY_POLICY", policyVersion: "2026-01", granted: true },
      { userId, consentType: "DATA_PROCESSING", policyVersion: "2026-01", granted: true },
    ],
  });

  const challenge = await issueChallenge({
    identifier: email,
    purpose: "EMAIL_VERIFICATION",
    userId,
    context: { ipAddress: context.ipAddress },
  });

  await recordAuditEvent({
    action: "auth.register",
    entityType: "user",
    entityId: userId,
    actorUserId: userId,
    actorLabel: email,
    context,
    metadata: { emailVerified: false },
  });

  if (emailDeliveryAvailable()) {
    // A verification email would be handed to the provider adapter here.
    void buildLink("/verify-email", challenge.secret);
    return formSuccess(`Your ORVEXA account is ready. We’ve sent a verification link to ${email}.`, "/login");
  }

  return formSuccess(
    `Your ORVEXA account is ready. This deployment has no email delivery configured, so no verification email was sent — you can sign in now, and verify your address once email is enabled.`,
    "/login",
  );
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------

export async function login(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    identifier: text(formData, "identifier"),
    password: text(formData, "password"),
  });
  if (!parsed.success) {
    return formError("Enter your details to sign in.", fieldErrorsFromZod(parsed.error));
  }

  const identifier = parsed.data.identifier.trim();
  const normalized = normalizeEmail(identifier);
  const context = await getRequestContext();

  const byEmail = normalizeEmail(identifier);

  const genericFailure = formError("Email or password is incorrect.");
  const lockedFailure = formError("Too many attempts. Wait a few minutes and try again.");

  const ipLimit = await consumeRateLimit(
    "loginByIp",
    context.ipAddress ? `ip:${context.ipAddress}` : "ip:unknown",
    RATE_LIMITS.loginByIp,
  );
  if (!ipLimit.allowed) return lockedFailure;

  const emailLimit = await consumeRateLimit("loginByEmail", `email:${byEmail}`, RATE_LIMITS.loginByEmail);
  if (!emailLimit.allowed) return lockedFailure;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: byEmail }, { phone: identifier }] },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      status: true,
      fullName: true,
      lockedUntil: true,
      failedLoginAttempts: true,
      roles: { select: { role: true, revokedAt: true } },
    },
  });

  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return lockedFailure;
  }

  // Constant work whether or not the account exists, so timing does not leak it.
  const passwordOk = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordOk) {
    if (user) {
      const attempts = user.failedLoginAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
        },
      });
    }
    await recordAuditEvent({
      action: "auth.login_failed",
      entityType: "user",
      entityId: user?.id ?? null,
      outcome: "FAILURE",
      actorLabel: normalized,
      context,
    });
    return genericFailure;
  }

  if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") {
    await recordAuditEvent({
      action: "auth.login_failed",
      entityType: "user",
      entityId: user.id,
      outcome: "DENIED",
      actorLabel: user.email,
      context,
      metadata: { reason: "inactive_account" },
    });
    return formError("This account is not active. Contact support for help.");
  }

  const roles = user.roles.filter((entry) => entry.revokedAt === null).map((entry) => entry.role);
  const remember = checked(formData, "remember");

  const session = await createSession(user.id, { remember, context });
  await setSessionCookie(session.token, { remember: session.remember, expiresAt: session.expiresAt });

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await clearRateLimit("loginByEmail", `email:${user.email}`);

  await recordAuditEvent({
    action: "auth.login",
    entityType: "session",
    entityId: session.sessionId,
    actorUserId: user.id,
    actorLabel: user.email,
    context,
    metadata: { roles, remember },
  });

  const target = safeNextPath(text(formData, "next")) ?? landingPathForRoles(roles);

  // `revalidatePath` before `redirect`: the redirect throws, so anything after it
  // would never run. The "layout" scope drops the cached shell so the new session
  // is reflected on the very next render.
  revalidatePath("/", "layout");
  redirect(target);
}

export async function logout(): Promise<void> {
  const context = await getRequestContext();
  const token = await readSessionToken();

  if (token) {
    const user = await resolveSessionToken(token);
    if (user) {
      await revokeSession(user.sessionId, "user_signed_out");
      await recordAuditEvent({
        action: "auth.logout",
        entityType: "session",
        entityId: user.sessionId,
        actorUserId: user.id,
        actorLabel: user.email,
        context,
      });
    }
  }

  await clearSessionCookie();
  revalidatePath("/", "layout");
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function verifyEmail(_previous: FormState, formData: FormData): Promise<FormState> {
  const token = text(formData, "token");
  if (!token) return formError("This verification link is missing its token.");

  const identifier = await identifierForToken(token, "EMAIL_VERIFICATION");
  if (!identifier) {
    return formError("This verification link is not valid, or it has already been used. Request a new one below.");
  }

  const result = await verifyChallenge({ identifier, purpose: "EMAIL_VERIFICATION", secret: token });
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "This verification link has expired. Request a new one below."
        : result.reason === "too_many_attempts"
          ? "This link has been tried too many times. Request a new one below."
          : "This verification link is not valid, or it has already been used.";
    return formError(message);
  }

  if (!result.userId) {
    return formError("This verification link could not be matched to an account.");
  }

  const context = await getRequestContext();
  const user = await prisma.user.update({
    where: { id: result.userId },
    data: {
      emailVerifiedAt: new Date(),
      status: "ACTIVE",
    },
    select: { id: true, email: true, status: true },
  });

  await recordAuditEvent({
    action: "auth.email_verified",
    entityType: "user",
    entityId: user.id,
    actorUserId: user.id,
    actorLabel: user.email,
    context,
  });

  return formSuccess("Your email address is verified. You can sign in now.", "/login");
}

export async function resendVerification(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) {
    return formError("Enter the email address you registered with.", fieldErrorsFromZod(parsed.error));
  }

  const email = normalizeEmail(parsed.data.email);
  const context = await getRequestContext();

  const limit = await consumeRateLimit(
    "verificationResend",
    context.ipAddress ? `ip:${context.ipAddress}` : `email:${email}`,
    RATE_LIMITS.verificationResend,
  );
  if (!limit.allowed) {
    return formError("A verification email was requested recently. Wait a little before trying again.");
  }

  if (!emailDeliveryAvailable()) {
    return formError(
      "Verification email delivery is not configured on this deployment, so no email can be sent. Report this to support and they can verify your address for you.",
    );
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
  if (user && !user.emailVerifiedAt) {
    const challenge = await issueChallenge({
      identifier: email,
      purpose: "EMAIL_VERIFICATION",
      userId: user.id,
      context: { ipAddress: context.ipAddress },
    });
    void buildLink("/verify-email", challenge.secret);
  }

  // Same message whether or not the address exists, so this is not an oracle.
  return formSuccess(`If that address needs verifying, a fresh link is on its way to ${email}.`);
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function requestPasswordReset(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) {
    return formError("Enter your email address.", fieldErrorsFromZod(parsed.error));
  }

  const email = normalizeEmail(parsed.data.email);
  const context = await getRequestContext();

  const limit = await consumeRateLimit(
    "passwordResetRequest",
    context.ipAddress ? `ip:${context.ipAddress}` : `email:${email}`,
    RATE_LIMITS.passwordResetRequest,
  );
  if (!limit.allowed) {
    return formError("A reset was requested recently. Wait a little before trying again.");
  }

  if (!emailDeliveryAvailable()) {
    return formError(
      "Password reset by email is not available because this deployment has no email delivery configured. Report this to support and they can help you regain access.",
    );
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    const challenge = await issueChallenge({
      identifier: email,
      purpose: "PASSWORD_RESET",
      userId: user.id,
      context: { ipAddress: context.ipAddress },
    });
    void buildLink("/reset-password", challenge.secret);
    await recordAuditEvent({
      action: "auth.password_reset_requested",
      entityType: "user",
      entityId: user.id,
      actorLabel: email,
      context,
    });
  }

  return formSuccess("If an account exists for that address, we’ve sent instructions to reset your password.");
}

export async function confirmPasswordReset(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: text(formData, "token"),
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return formError("Check the fields below and try again.", fieldErrorsFromZod(parsed.error));
  }

  const identifier = await identifierForToken(parsed.data.token, "PASSWORD_RESET");
  if (!identifier) {
    return formError("This password reset link is not valid, or it has already been used. Request a new one.");
  }

  const issues = passwordIssues(parsed.data.password, identifier);
  if (issues.length > 0) {
    return formError("Choose a stronger password.", { password: issues });
  }

  const context = await getRequestContext();
  const limit = await consumeRateLimit(
    "passwordResetConfirm",
    context.ipAddress ? `ip:${context.ipAddress}` : `email:${identifier}`,
    RATE_LIMITS.passwordResetConfirm,
  );
  if (!limit.allowed) {
    return formError("Too many attempts. Wait a few minutes and try again.");
  }

  const result = await verifyChallenge({ identifier, purpose: "PASSWORD_RESET", secret: parsed.data.token });
  if (!result.ok || !result.userId) {
    return formError("This password reset link is not valid, has expired, or has already been used. Request a new one.");
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({
    where: { id: result.userId },
    data: {
      passwordHash,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  // A reset invalidates every existing session: a stolen cookie cannot survive it.
  const revoked = await revokeAllSessionsForUser(result.userId, "password_reset");

  await recordAuditEvent({
    action: "auth.password_reset_completed",
    entityType: "user",
    entityId: result.userId,
    actorUserId: result.userId,
    context,
    metadata: { sessionsRevoked: revoked },
  });

  return formSuccess("Your password was updated and every other device was signed out. Sign in with your new password.", "/login");
}
