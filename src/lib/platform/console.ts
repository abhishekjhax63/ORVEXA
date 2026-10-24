import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { PlatformStaffRole } from "@prisma/client";

import { AccessDeniedError, getCurrentUser } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/roles";
import { PLATFORM_STAFF_ROLE_LABELS } from "@/lib/auth/roles";
import { getRouteUser, jsonError } from "@/lib/auth/route-session";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { recordAuditEvent, type AuditAction, type AuditEntityType } from "@/lib/security/audit";

/**
 * Authorization for the platform operations console.
 *
 * ## The rule
 *
 * Every page, server action and route handler in `/admin` and `/api/admin`
 * funnels through this module. It resolves the acting account from the session
 * (which re-reads `PlatformStaffMember` on every request), never from anything
 * the browser sends, and it checks the *permission* the surface requires rather
 * than the role the account happens to hold.
 *
 * ## Why the role is not the check
 *
 * A `PlatformStaffMember` row names the queue an account works. The permission
 * map in `src/lib/auth/roles.ts` turns that row into permissions. Nothing else
 * consults the role. That means a hospital verification reviewer cannot read the
 * audit trail, work a refund or toggle a feature flag, even though all four
 * live in the same console — because they were never granted those permissions.
 *
 * ## Ordinary users
 *
 * `platform.console_access` is only ever conferred by a `PlatformStaffMember`
 * row, so a patient, a doctor or a pharmacy partner has no way to reach the
 * console shell at all. The one deliberate exception is the `PLATFORM_ADMIN`
 * platform `Role`: it is the bootstrap administrator identity that already
 * carries the Phase 1–10 governance permissions, and locking it out of its own
 * console would be a denial of service. It still does not gain the Phase 11
 * `platform.*` permissions without a staff row.
 *
 * ## What happens on a denial
 *
 * A refusal is written to the audit trail as `platform.access_denied` with the
 * permission that was missing and the account that asked, then the request is
 * refused. "This account tried to open the refund queue" is exactly the event a
 * security analyst needs to be able to see.
 */

export class PlatformConsoleError extends Error {
  readonly reason: "not_signed_in" | "not_console_staff" | "missing_permission";

  constructor(reason: PlatformConsoleError["reason"], message: string) {
    super(message);
    this.name = "PlatformConsoleError";
    this.reason = reason;
  }
}

export type PlatformContext = {
  user: AuthenticatedUser;
  /** Active platform operations roles, resolved from `PlatformStaffMember`. */
  staffRoles: PlatformStaffRole[];
  /** Human labels for those roles, for display. */
  staffRoleLabels: string[];
  /** True when the account holds the `PLATFORM_ADMIN` platform role. */
  isPlatformAdminRole: boolean;
  /** Platform-role permissions ∪ platform staff-role permissions. */
  permissions: Set<Permission>;
};

function buildContext(user: AuthenticatedUser): PlatformContext {
  const staffRoles = user.platformStaffMemberships.map((membership) => membership.role);
  return {
    user,
    staffRoles,
    staffRoleLabels: staffRoles.map((role) => PLATFORM_STAFF_ROLE_LABELS[role]),
    isPlatformAdminRole: user.roles.includes("PLATFORM_ADMIN"),
    permissions: new Set<Permission>(user.permissions),
  };
}

/**
 * Request-memoised console context.
 *
 * Returns null when the caller holds neither `platform.console_access` nor the
 * bootstrap administrator role — i.e. for every ordinary user.
 */
export const platformContext = cache(async (): Promise<PlatformContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const context = buildContext(user);
  if (!hasConsoleAccess(context)) return null;
  return context;
});

/** The single definition of "may open the console shell". */
export function hasConsoleAccess(context: PlatformContext) {
  return context.permissions.has("platform.console_access") || context.isPlatformAdminRole;
}

function has(context: PlatformContext, permission: Permission) {
  return context.permissions.has(permission);
}

/**
 * Records a refused attempt to reach the console.
 *
 * Exported so the console layout can audit the same event when it turns an
 * account away before any page runs. The vocabulary is shared with the guards
 * below so a denial looks identical however it was reached.
 */
export async function recordConsoleAccessDenied(input: {
  userId: string | null;
  reason: string;
  permission?: Permission;
  staffRoles?: readonly PlatformStaffRole[];
}) {
  await recordAuditEvent({
    action: "platform.access_denied",
    entityType: "platform_staff_member",
    entityId: input.userId,
    outcome: "DENIED",
    actorUserId: input.userId,
    metadata: { reason: input.reason, requiredPermission: input.permission, staffRoles: input.staffRoles },
  });
}

/**
 * Page guard for a console workspace.
 *
 * A signed-out visitor is sent to sign in and back. A signed-in account without
 * console access is sent to the shared access-denied screen with
 * `reason=not_console_staff`, which explains that the console is for the
 * platform's operations staff rather than for this account. A console account
 * that lacks the specific permission is audited and sent to the same screen
 * naming the missing permission.
 */
export async function requirePlatformContext(
  permission: Permission,
  options: { nextPath?: string } = {},
): Promise<PlatformContext> {
  const user = await getCurrentUser();
  if (!user) {
    const target = options.nextPath ? `/login?next=${encodeURIComponent(options.nextPath)}` : "/login";
    redirect(target);
  }

  const context = buildContext(user);
  if (!hasConsoleAccess(context)) {
    await recordConsoleAccessDenied({ userId: user.id, reason: "not_console_staff", permission });
    redirect("/access-denied?reason=not_console_staff");
  }

  if (!has(context, permission)) {
    await recordConsoleAccessDenied({
      userId: user.id,
      reason: "missing_permission",
      permission,
      staffRoles: context.staffRoles,
    });
    redirect(`/access-denied?required=${encodeURIComponent(permission)}`);
  }

  return context;
}

/**
 * The bare "may I be in here at all" guard, for the console shell itself.
 *
 * Separate from the permission guard on purpose. The shell is not a queue —
 * every queue page checks its own permission — and the one account that reaches
 * it without the `platform.console_access` permission is the bootstrap
 * `PLATFORM_ADMIN` role, which holds the Phase 1–10 governance permissions
 * without a Phase 11 staff row. Asking that account for a staff permission to
 * see its own console would be a denial of service.
 */
export async function requireConsoleAccess(options: { nextPath?: string } = {}): Promise<PlatformContext> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(options.nextPath ? `/login?next=${encodeURIComponent(options.nextPath)}` : "/login");
  }

  const context = buildContext(user);
  if (!hasConsoleAccess(context)) {
    await recordConsoleAccessDenied({ userId: user.id, reason: "not_console_staff" });
    redirect("/access-denied?reason=not_console_staff");
  }

  return context;
}

/** Throwing variant for Server Actions. */
export async function requirePlatformContextForAction(permission: Permission): Promise<PlatformContext> {
  const user = await getCurrentUser();
  if (!user) throw new PlatformConsoleError("not_signed_in", "You need to sign in to continue.");

  const context = buildContext(user);
  if (!hasConsoleAccess(context)) {
    await recordConsoleAccessDenied({ userId: user.id, reason: "not_console_staff", permission });
    throw new PlatformConsoleError("not_console_staff", "That workspace is for platform operations staff.");
  }

  if (!has(context, permission)) {
    await recordConsoleAccessDenied({
      userId: user.id,
      reason: "missing_permission",
      permission,
      staffRoles: context.staffRoles,
    });
    throw new AccessDeniedError(undefined, permission);
  }

  return context;
}

export type PlatformRouteSession =
  | { ok: true; context: PlatformContext }
  | { ok: false; response: Response };

/**
 * Route-handler guard. 401 when signed out, 403 when the caller is not console
 * staff at all, and 403 with an audited row when the caller lacks the specific
 * permission.
 */
export async function requirePlatformRoute(permission: Permission): Promise<PlatformRouteSession> {
  const user = await getRouteUser();
  if (!user) return { ok: false, response: jsonError(401, "You need to sign in to continue.") };

  const context = buildContext(user);
  if (!hasConsoleAccess(context)) {
    await recordConsoleAccessDenied({ userId: user.id, reason: "not_console_staff", permission });
    return { ok: false, response: jsonError(403, "That workspace is for platform operations staff.") };
  }

  if (!has(context, permission)) {
    await recordConsoleAccessDenied({
      userId: user.id,
      reason: "missing_permission",
      permission,
      staffRoles: context.staffRoles,
    });
    return { ok: false, response: jsonError(403, "You do not have permission to perform this action.") };
  }

  return { ok: true, context };
}

/**
 * Every console action that changes something records who did it.
 *
 * Kept as one helper so the audit vocabulary stays consistent and so a service
 * cannot forget the actor.
 */
export async function recordPlatformAction(input: {
  context: PlatformContext;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  outcome?: "SUCCESS" | "FAILURE" | "DENIED";
  metadata?: Record<string, string | number | boolean | null | undefined>;
}) {
  await recordAuditEvent({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    outcome: input.outcome,
    actorUserId: input.context.user.id,
    actorLabel: input.context.user.fullName,
    metadata: {
      platformStaffRoles: input.context.staffRoles,
      ...(input.metadata ?? {}),
    },
  });
}

/** The display name recorded against a platform decision, so it is never "unknown". */
export function actingOperatorLabel(context: PlatformContext) {
  return context.user.fullName;
}
