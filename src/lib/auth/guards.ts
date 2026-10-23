import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { type AppRole, type Permission } from "@/lib/auth/roles";
import {
  readSessionToken,
  resolveSessionToken,
  revokeSession,
  type AuthenticatedUser,
} from "@/lib/auth/session";
import { recordAuditEvent, type AuditAction, type AuditEntityType } from "@/lib/security/audit";

/**
 * The authorization boundary.
 *
 * Every protected page and every mutation funnels through this module, so a
 * permission is checked on the server against the role rows in the database. A
 * role or permission sent by the browser is never read: `getCurrentUser()` is
 * the only source of truth for "who is acting".
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  return resolveSessionToken(token);
});

export function hasPermission(user: AuthenticatedUser | null, permission: Permission) {
  return Boolean(user?.permissions.includes(permission));
}

export function hasAnyPermission(user: AuthenticatedUser | null, permissions: readonly Permission[]) {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function hasRole(user: AuthenticatedUser | null, role: AppRole) {
  return Boolean(user?.roles.includes(role));
}

export class AccessDeniedError extends Error {
  readonly requiredPermission?: Permission;

  constructor(message = "You do not have permission to perform this action.", requiredPermission?: Permission) {
    super(message);
    this.name = "AccessDeniedError";
    this.requiredPermission = requiredPermission;
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = "You need to sign in to continue.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** Page-level guard: sends signed-out visitors to sign in and back again. */
export async function requireUser(nextPath?: string): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
    redirect(target);
  }
  return user;
}

/**
 * Mutations use the throwing variants so an action can queue a session
 * revocation before surfacing a failure to the caller.
 */
export async function requireUserForAction(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function requirePermission(
  permission: Permission,
  options: { nextPath?: string } = {},
): Promise<AuthenticatedUser> {
  const user = await requireUser(options.nextPath);

  if (!hasPermission(user, permission)) {
    await recordAuditEvent({
      action: "access.denied",
      entityType: "user",
      entityId: user.id,
      outcome: "DENIED",
      actorUserId: user.id,
      metadata: { requiredPermission: permission, roles: user.roles },
    });
    redirect(`/access-denied?required=${encodeURIComponent(permission)}`);
  }

  return user;
}

export async function requirePermissionForAction(permission: Permission): Promise<AuthenticatedUser> {
  const user = await requireUserForAction();
  if (!hasPermission(user, permission)) {
    await recordAuditEvent({
      action: "access.denied",
      entityType: "user",
      entityId: user.id,
      outcome: "DENIED",
      actorUserId: user.id,
      metadata: { requiredPermission: permission, roles: user.roles },
    });
    throw new AccessDeniedError(undefined, permission);
  }
  return user;
}

/** Pages that need a confirmed email address (verification link already sent). */
export async function requireVerifiedUser(nextPath?: string): Promise<AuthenticatedUser> {
  const user = await requireUser(nextPath);
  if (!user.emailVerified) redirect("/verify-email");
  return user;
}

/**
 * Owner check for a single record.
 *
 * Used wherever an id arrives from the URL or a form so an authenticated user
 * cannot read or mutate somebody else's data by guessing an identifier. Platform
 * staff may pass an explicit override permission instead of being special-cased.
 */
export async function assertOwnership(input: {
  user: AuthenticatedUser;
  ownerUserId: string;
  permission: Permission;
  entityType: AuditEntityType;
  entityId: string;
  /** Permission that legitimately grants cross-user access, e.g. a provider reading a booked patient. */
  overridePermission?: Permission;
  action?: AuditAction;
}): Promise<void> {
  if (input.user.id === input.ownerUserId) return;
  if (input.overridePermission && hasPermission(input.user, input.overridePermission)) return;

  await recordAuditEvent({
    action: input.action ?? "access.denied",
    entityType: input.entityType,
    entityId: input.entityId,
    outcome: "DENIED",
    actorUserId: input.user.id,
    metadata: { reason: "cross_user_access", requiredPermission: input.permission, roles: input.user.roles },
  });

  throw new AccessDeniedError("That record does not belong to your account.", input.permission);
}

/** Non-throwing version for pages that prefer to render an empty state. */
export function isSameUser(user: AuthenticatedUser, ownerUserId: string) {
  return user.id === ownerUserId;
}

export async function recordDeniedAccess(input: {
  user: AuthenticatedUser | null;
  entityType: AuditEntityType;
  entityId?: string | null;
  reason: string;
  permission?: Permission;
}) {
  await recordAuditEvent({
    action: "access.denied",
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    outcome: "DENIED",
    actorUserId: input.user?.id ?? null,
    metadata: { reason: input.reason, permission: input.permission, roles: input.user?.roles },
  });
}

/** Ends the current session and clears the cookie. */
export async function endSession(user: AuthenticatedUser, reason: string) {
  await revokeSession(user.sessionId, reason);
}
