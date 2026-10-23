import "server-only";

import { cookies } from "next/headers";

import { prisma } from "@/lib/db/prisma";
import {
  hmacDigest,
  createSessionToken,
  maskIdentifier,
} from "@/lib/auth/tokens";
import { type AppRole, type Permission, permissionsForRoles } from "@/lib/auth/roles";
import { type RequestContext } from "@/lib/security/request";

/**
 * Server-side session management.
 *
 * The browser only ever receives an opaque random token in an httpOnly cookie.
 * The database stores its HMAC digest, so a stolen database dump cannot be
 * replayed and a stolen cookie can be revoked instantly by deleting the row.
 */
export const SESSION_COOKIE_NAME = "orvexa_session";
export const SESSION_TOKEN_PURPOSE = "session.token";

const DEFAULT_SESSION_HOURS = 12;
const REMEMBER_SESSION_DAYS = 30;
const TOUCH_INTERVAL_MINUTES = 5;

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  emailVerified: boolean;
  phone: string | null;
  roles: AppRole[];
  permissions: Permission[];
  sessionId: string;
  sessionExpiresAt: Date;
};

export type SessionSummary = {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
};

export function sessionExpiryFor(remember: boolean, now = new Date()) {
  const ttlMs = remember
    ? REMEMBER_SESSION_DAYS * 24 * 60 * 60 * 1000
    : DEFAULT_SESSION_HOURS * 60 * 60 * 1000;
  return new Date(now.getTime() + ttlMs);
}

function hashSessionToken(token: string) {
  return hmacDigest(token, SESSION_TOKEN_PURPOSE);
}

export async function createSession(
  userId: string,
  options: { remember?: boolean; context?: RequestContext } = {},
) {
  const token = createSessionToken();
  const expiresAt = sessionExpiryFor(options.remember === true);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      ipAddress: options.context?.ipAddress ?? null,
      userAgent: options.context?.userAgent ?? null,
    },
    select: { id: true, expiresAt: true },
  });

  return { token, sessionId: session.id, expiresAt: session.expiresAt, remember: options.remember === true };
}

export async function setSessionCookie(token: string, options: { remember?: boolean; expiresAt?: Date } = {}) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Without `expires` the cookie is dropped when the browser closes, which is
    // the default behaviour for a session that was not marked "remember me".
    ...(options.remember ? { expires: options.expiresAt } : {}),
  });
}

export async function readSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Resolves a cookie token into the acting user. Returns null for unknown,
 * expired, revoked or suspended sessions — callers treat null as "signed out".
 */
export async function resolveSessionToken(token: string): Promise<AuthenticatedUser | null> {
  if (!token || token.length < 20) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          status: true,
          emailVerifiedAt: true,
          phone: true,
          roles: { select: { role: true, revokedAt: true } },
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (session.user.status === "SUSPENDED" || session.user.status === "DEACTIVATED") return null;

  const roles = session.user.roles
    .filter((entry) => entry.revokedAt === null)
    .map((entry) => entry.role as AppRole);

  const now = new Date();
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MINUTES * 60 * 1000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }

  return {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    avatarUrl: session.user.avatarUrl,
    status: session.user.status,
    emailVerified: session.user.emailVerifiedAt !== null,
    phone: session.user.phone,
    roles,
    permissions: Array.from(permissionsForRoles(roles)),
    sessionId: session.id,
    sessionExpiresAt: session.expiresAt,
  };
}

export async function revokeSession(sessionId: string, reason: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Revokes every live session for a user. Used on password change/reset and when
 * a session is deliberately terminated, which limits the damage of a stolen
 * cookie and satisfies "sign out of all devices".
 */
export async function revokeAllSessionsForUser(userId: string, reason: string, exceptSessionId?: string) {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

export async function listSessionsForUser(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
    },
  });

  return sessions.map((session) => ({
    ...session,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    current: session.id === currentSessionId,
  }));
}

export async function purgeExpiredSessions() {
  const result = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lte: new Date() } }, { revokedAt: { not: null } }] },
  });
  return result.count;
}

/** Redacted label used in audit records instead of the raw address. */
export function auditLabelForEmail(email: string) {
  return maskIdentifier(email);
}
