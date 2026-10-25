import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GOOGLE_STATE_COOKIE, exchangeGoogleCode, googleOAuthConfig, unguessablePassword } from "@/lib/auth/google";
import { hashPassword } from "@/lib/auth/password";
import { safeNextPath } from "@/lib/auth/redirect";
import { landingPathForRoles, type AppRole } from "@/lib/auth/roles";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import { getRequestContext } from "@/lib/security/request";

/**
 * Completes a Google sign-in.
 *
 * Every exit path is a redirect back to `/login?oauth=<reason>` carrying a short
 * machine reason, never a message assembled from provider input — so a failed
 * exchange cannot be turned into reflected content on the sign-in page.
 *
 * The callback creates an ORVEXA session, not a Google one: the same
 * `createSession` row and the same httpOnly cookie that password sign-in
 * produces. Email/password and phone OTP sign-in are untouched.
 */
const FAILURE_REASONS = new Set([
  "unconfigured",
  "cancelled",
  "provider_error",
  "invalid_request",
  "state_mismatch",
  "exchange_failed",
  "profile_failed",
  "email_unavailable",
  "account_unavailable",
  "account_inactive",
]);

/** Shape of the httpOnly cookie written by `/api/auth/google/start`. */
type PendingAuthorization = {
  state?: unknown;
  codeVerifier?: unknown;
  next?: unknown;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const failWith = (reason: string) => {
    const safeReason = FAILURE_REASONS.has(reason) ? reason : "provider_error";
    return NextResponse.redirect(new URL(`/login?oauth=${encodeURIComponent(safeReason)}`, request.url));
  };

  // The state cookie is single-use: it is cleared before anything else runs, so
  // a replayed callback can never match a state that is still on the browser.
  const cookieStore = await cookies();
  const rawState = cookieStore.get(GOOGLE_STATE_COOKIE)?.value;
  cookieStore.delete(GOOGLE_STATE_COOKIE);

  const config = googleOAuthConfig();
  if (!config) return failWith("unconfigured");

  const providerError = url.searchParams.get("error");
  if (providerError) {
    // Google sends `access_denied` when the person closes the consent screen.
    return failWith(providerError === "access_denied" ? "cancelled" : "provider_error");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return failWith("invalid_request");

  /** The state + PKCE verifier stashed by the start route. */
  let pending: PendingAuthorization | null = null;
  try {
    pending = rawState ? (JSON.parse(rawState) as PendingAuthorization) : null;
  } catch {
    pending = null;
  }
  if (
    !pending ||
    typeof pending.state !== "string" ||
    typeof pending.codeVerifier !== "string" ||
    pending.state !== state
  ) {
    return failWith("state_mismatch");
  }

  const exchange = await exchangeGoogleCode(config, { code, codeVerifier: pending.codeVerifier });
  if (!exchange.ok) return failWith(exchange.reason);

  const { identity } = exchange;
  const context = await getRequestContext();

  const existing = await prisma.user.findUnique({
    where: { email: identity.email },
    select: {
      id: true,
      status: true,
      avatarUrl: true,
      fullName: true,
      roles: { select: { role: true, revokedAt: true } },
    },
  });

  let userId: string | null = null;
  let roles: AppRole[] = [];
  let registered = false;

  if (existing?.id) {
    if (existing.status === "SUSPENDED" || existing.status === "DEACTIVATED") {
      await recordAuditEvent({
        action: "auth.google_sign_in_failed",
        entityType: "user",
        entityId: existing.id,
        outcome: "DENIED",
        actorLabel: identity.email,
        context,
        metadata: { reason: "inactive_account" },
      });
      return failWith("account_inactive");
    }

    userId = existing.id;
    roles = existing.roles.filter((entry) => entry.revokedAt === null).map((entry) => entry.role as AppRole);

    // Google has verified this address, so it can be marked verified here. The
    // name and picture are only filled in where the account has none, so an
    // ORVEXA profile the person already edited is never overwritten.
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        emailVerifiedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(existing.status === "PENDING_VERIFICATION" ? { status: "ACTIVE" as const } : {}),
        ...(existing.avatarUrl || !identity.avatarUrl ? {} : { avatarUrl: identity.avatarUrl }),
      },
    });
  } else {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: identity.email,
            fullName: identity.fullName,
            avatarUrl: identity.avatarUrl,
            // The account has no password the person knows. Storing an
            // unguessable hash keeps the column non-null and keeps password
            // sign-in closed until they set one through "forgot password".
            passwordHash: await hashPassword(unguessablePassword()),
            status: "ACTIVE",
            emailVerifiedAt: new Date(),
            lastLoginAt: new Date(),
            patientProfile: { create: {} },
          },
          select: { id: true },
        });
        await tx.userRole.create({ data: { userId: user.id, role: "PATIENT" } });
        return user;
      });

      if (!created?.id) return failWith("account_unavailable");
      userId = created.id;
      roles = ["PATIENT"];
      registered = true;
    } catch {
      return failWith("account_unavailable");
    }

    // Same consent baseline the password registration path records, so an
    // account opened through Google is not exempt from the consent trail.
    await prisma.consentRecord.createMany({
      data: [
        { userId, consentType: "TERMS_OF_SERVICE", policyVersion: "2026-01", granted: true },
        { userId, consentType: "PRIVACY_POLICY", policyVersion: "2026-01", granted: true },
        { userId, consentType: "DATA_PROCESSING", policyVersion: "2026-01", granted: true },
      ],
    });
  }

  if (!userId) return failWith("account_unavailable");

  const session = await createSession(userId, { remember: false, context });
  await setSessionCookie(session.token, { remember: session.remember, expiresAt: session.expiresAt });

  await recordAuditEvent({
    action: registered ? "auth.google_registered" : "auth.google_sign_in",
    entityType: "session",
    entityId: session.sessionId,
    actorUserId: userId,
    actorLabel: identity.email,
    context,
    // The Google subject is recorded for traceability. It is not stored on the
    // account row: linking by immutable subject would need a schema change, and
    // the address Google just verified is sufficient to identify the account.
    metadata: { provider: "google", googleSubject: identity.subject, registered },
  });

  const target = safeNextPath(typeof pending.next === "string" ? pending.next : undefined) ?? landingPathForRoles(roles);
  return NextResponse.redirect(new URL(target, request.url));
}
