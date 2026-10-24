import "server-only";

import { cookies } from "next/headers";
import type { HospitalMemberStatus, HospitalStaffRole, PlatformStaffRole } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  hmacDigest,
  createSessionToken,
  maskIdentifier,
} from "@/lib/auth/tokens";
import { type AppRole, type Permission, hospitalStaffPermissionsForRoles, permissionsForRoles, platformStaffPermissionsForRoles } from "@/lib/auth/roles";
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

/**
 * A hospital this user is a member of, resolved on every request from
 * `HospitalMember`. This is the only place a hospital tenant is established:
 * the browser never names a hospital, and a hospital id in a URL is only ever
 * used to *look up* a membership, never to grant one.
 */
export type HospitalMembership = {
  hospitalId: string;
  hospitalName: string;
  staffRole: HospitalStaffRole | null;
  status: HospitalMemberStatus;
};

/**
 * A platform operations role this account holds, resolved on every request from
 * `PlatformStaffMember`. This — not the platform `Role` — is what makes somebody
 * a hospital verification reviewer, a support agent or a security analyst. An
 * account that works one queue holds no administrative role at all.
 */
export type PlatformStaffMembership = {
  id: string;
  role: PlatformStaffRole;
};

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
  /** Active memberships only. Invited and revoked rows are not returned. */
  hospitalMemberships: HospitalMembership[];
  /** Active platform operations roles only. Revoked rows are not returned. */
  platformStaffMemberships: PlatformStaffMembership[];
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
          hospitalMemberships: {
            where: { status: "ACTIVE" },
            select: {
              hospitalId: true,
              staffRole: true,
              status: true,
              hospital: { select: { name: true } },
            },
          },
          // Phase 11. Platform operations roles, resolved per request so a
          // revoked grant takes effect immediately rather than at cookie expiry.
          platformStaffRoles: {
            where: { status: "ACTIVE" },
            select: { id: true, role: true },
          },
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

  const hospitalMemberships: HospitalMembership[] = session.user.hospitalMemberships.map((membership) => ({
    hospitalId: membership.hospitalId,
    hospitalName: membership.hospital.name,
    staffRole: membership.staffRole,
    status: membership.status,
  }));

  const platformStaffMemberships: PlatformStaffMembership[] = session.user.platformStaffRoles.map((entry) => ({
    id: entry.id,
    role: entry.role,
  }));

  // Platform-role permissions ∪ the permissions the in-hospital staff roles
  // grant ∪ the permissions the platform operations roles grant. A nurse holds
  // no hospital permission from the platform `Role` at all, and a verification
  // reviewer holds no administrative role at all.
  const permissions = permissionsForRoles(roles);
  for (const permission of hospitalStaffPermissionsForRoles(
    hospitalMemberships.map((membership) => membership.staffRole).filter((role): role is HospitalStaffRole => role !== null),
  )) {
    permissions.add(permission);
  }
  for (const permission of platformStaffPermissionsForRoles(
    platformStaffMemberships.map((membership) => membership.role),
  )) {
    permissions.add(permission);
  }

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
    permissions: Array.from(permissions),
    hospitalMemberships,
    platformStaffMemberships,
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
