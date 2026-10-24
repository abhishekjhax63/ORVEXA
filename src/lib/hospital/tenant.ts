import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { HospitalStaffRole } from "@prisma/client";

import { AccessDeniedError, getCurrentUser } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/roles";
import { hospitalStaffPermissionsForRoles } from "@/lib/auth/roles";
import { jsonError, getRouteUser } from "@/lib/auth/route-session";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent, type AuditAction, type AuditEntityType } from "@/lib/security/audit";

/**
 * Tenant isolation for the hospital workspace.
 *
 * ## The rule
 *
 * A hospital id is never read from the request. It is resolved from the acting
 * user's `HospitalMember` row, and the membership is re-read from the database
 * on every request rather than carried in the session cookie. Every query the
 * hospital services run must be constrained by `hospitalId` — the helpers here
 * exist so that is the easy thing to do rather than the careful thing to do.
 *
 * ## Why every check is a database read
 *
 * A membership can be revoked while a session is still live. If the hospital
 * were baked into the cookie, a dismissed staff member would keep access until
 * their cookie expired. Reading `HospitalMember` per request — `getCurrentUser`
 * is request-memoised, so this costs one query per request, not one per call —
 * means revocation takes effect immediately.
 *
 * ## What happens on a mismatch
 *
 * A staff member addressing another hospital's record is not shown a 404. The
 * attempt is written to the audit trail as `hospital.tenant_access_denied` and
 * the request is refused, because "somebody in hospital A tried to open hospital
 * B's chart" is exactly the event a hospital administrator needs to be able to
 * see.
 */

export class HospitalTenantError extends Error {
  readonly reason:
    | "not_signed_in"
    | "no_membership"
    | "membership_inactive"
    | "hospital_mismatch"
    | "missing_permission";

  constructor(reason: HospitalTenantError["reason"], message: string) {
    super(message);
    this.name = "HospitalTenantError";
    this.reason = reason;
  }
}

export type HospitalContext = {
  user: AuthenticatedUser;
  /** The hospital the caller is acting inside. Never taken from the request. */
  hospitalId: string;
  hospitalName: string;
  memberId: string;
  staffRole: HospitalStaffRole | null;
  /** Platform-role permissions ∪ in-hospital staff-role permissions. */
  permissions: Set<Permission>;
};

function permissionsFor(user: AuthenticatedUser, staffRole: HospitalStaffRole | null): Set<Permission> {
  const permissions = new Set<Permission>(user.permissions);
  if (staffRole) {
    for (const permission of hospitalStaffPermissionsForRoles([staffRole])) permissions.add(permission);
  }
  return permissions;
}

async function loadMembership(userId: string, hospitalId: string) {
  return prisma.hospitalMember.findUnique({
    where: { hospitalId_userId: { hospitalId, userId } },
    select: {
      id: true,
      status: true,
      staffRole: true,
      hospitalId: true,
      hospital: { select: { name: true } },
    },
  });
}

async function loadDefaultMembership(userId: string) {
  return prisma.hospitalMember.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: [{ joinedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      staffRole: true,
      hospitalId: true,
      hospital: { select: { name: true } },
    },
  });
}

/**
 * Resolves the caller's active hospital membership.
 *
 * Pass a `hospitalId` when the request names one (a `/hospital/[hospitalId]/...`
 * route, or a route handler that accepts one). It is used only to *look up* a
 * membership; a hospital the caller is not a member of resolves to a mismatch
 * rather than to access.
 */
async function resolveContext(input: {
  userId: string;
  hospitalId?: string | null;
}): Promise<{ ok: true; context: HospitalContext } | { ok: false; reason: HospitalTenantError["reason"] }> {
  const user = await getCurrentUser();
  if (!user || user.id !== input.userId) return { ok: false, reason: "not_signed_in" };

  const membership = input.hospitalId
    ? await loadMembership(user.id, input.hospitalId)
    : await loadDefaultMembership(user.id);

  if (!membership) return { ok: false, reason: input.hospitalId ? "hospital_mismatch" : "no_membership" };
  if (membership.status !== "ACTIVE") return { ok: false, reason: "membership_inactive" };

  return {
    ok: true,
    context: {
      user,
      hospitalId: membership.hospitalId,
      hospitalName: membership.hospital.name,
      memberId: membership.id,
      staffRole: membership.staffRole,
      permissions: permissionsFor(user, membership.staffRole),
    },
  };
}

/** Request-memoised context for the caller's default hospital. */
export const hospitalContext = cache(async (): Promise<HospitalContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const resolved = await resolveContext({ userId: user.id });
  return resolved.ok ? resolved.context : null;
});

function contextHasPermission(context: HospitalContext, permission: Permission) {
  return context.permissions.has(permission);
}

async function auditDenied(input: {
  userId: string | null;
  hospitalId?: string | null;
  reason: string;
  permission?: Permission;
  entityType: AuditEntityType;
  entityId?: string | null;
  action?: AuditAction;
}) {
  await recordAuditEvent({
    action: input.action ?? "hospital.tenant_access_denied",
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    outcome: "DENIED",
    actorUserId: input.userId,
    hospitalId: input.hospitalId ?? null,
    metadata: { reason: input.reason, requiredPermission: input.permission },
  });
}

/**
 * Page guard for the hospital workspace.
 *
 * Redirects a signed-out visitor to sign in, a signed-in non-member to the
 * workspace's own "no hospital yet" page, and a member without the permission to
 * the access-denied screen after writing an audit row.
 */
export async function requireHospitalContext(
  permission: Permission,
  options: { hospitalId?: string | null; nextPath?: string } = {},
): Promise<HospitalContext> {
  const user = await getCurrentUser();
  if (!user) {
    const target = options.nextPath ? `/login?next=${encodeURIComponent(options.nextPath)}` : "/login";
    redirect(target);
  }

  const resolved = await resolveContext({ userId: user.id, hospitalId: options.hospitalId });

  if (!resolved.ok) {
    if (resolved.reason === "no_membership" || resolved.reason === "membership_inactive") {
      redirect("/hospital/no-access?reason=no_membership");
    }
    await auditDenied({
      userId: user.id,
      hospitalId: options.hospitalId,
      reason: resolved.reason,
      permission,
      entityType: "hospital_member",
      entityId: options.hospitalId ?? null,
    });
    redirect(`/access-denied?required=${encodeURIComponent(permission)}`);
  }

  const context = resolved.context;
  if (!contextHasPermission(context, permission)) {
    await auditDenied({
      userId: user.id,
      hospitalId: context.hospitalId,
      reason: "missing_permission",
      permission,
      entityType: "hospital_member",
      entityId: context.memberId,
    });
    redirect(`/access-denied?required=${encodeURIComponent(permission)}`);
  }

  return context;
}

/** Throwing variant for Server Actions. */
export async function requireHospitalContextForAction(
  permission: Permission,
  options: { hospitalId?: string | null } = {},
): Promise<HospitalContext> {
  const user = await getCurrentUser();
  if (!user) throw new HospitalTenantError("not_signed_in", "You need to sign in to continue.");

  const resolved = await resolveContext({ userId: user.id, hospitalId: options.hospitalId });
  if (!resolved.ok) {
    await auditDenied({
      userId: user.id,
      hospitalId: options.hospitalId,
      reason: resolved.reason,
      permission,
      entityType: "hospital_member",
      entityId: options.hospitalId ?? null,
    });
    throw new HospitalTenantError(resolved.reason, "You are not a member of that hospital.");
  }

  const context = resolved.context;
  if (!contextHasPermission(context, permission)) {
    await auditDenied({
      userId: user.id,
      hospitalId: context.hospitalId,
      reason: "missing_permission",
      permission,
      entityType: "hospital_member",
      entityId: context.memberId,
    });
    throw new AccessDeniedError(undefined, permission);
  }

  return context;
}

export type HospitalRouteSession =
  | { ok: true; context: HospitalContext }
  | { ok: false; response: Response };

/**
 * Route-handler guard. 401 when signed out, 403 when the caller holds no active
 * membership at all, and 403 with a tenant-denied audit row when the caller
 * names a hospital they are not a member of.
 */
export async function requireHospitalRoute(
  permission: Permission,
  options: { hospitalId?: string | null } = {},
): Promise<HospitalRouteSession> {
  const user = await getRouteUser();
  if (!user) return { ok: false, response: jsonError(401, "You need to sign in to continue.") };

  // A handler runs outside a React render, so `getCurrentUser`'s memoisation does
  // not apply. Resolve the membership directly from the already-loaded user.
  const membership = options.hospitalId
    ? await loadMembership(user.id, options.hospitalId)
    : await loadDefaultMembership(user.id);

  if (!membership || membership.status !== "ACTIVE") {
    await auditDenied({
      userId: user.id,
      hospitalId: options.hospitalId,
      reason: membership ? "membership_inactive" : "no_membership",
      permission,
      entityType: "hospital_member",
      entityId: options.hospitalId ?? null,
    });
    return { ok: false, response: jsonError(403, "You are not a member of an active hospital workspace.") };
  }

  const context: HospitalContext = {
    user,
    hospitalId: membership.hospitalId,
    hospitalName: membership.hospital.name,
    memberId: membership.id,
    staffRole: membership.staffRole,
    permissions: permissionsFor(user, membership.staffRole),
  };

  if (!contextHasPermission(context, permission)) {
    await auditDenied({
      userId: user.id,
      hospitalId: context.hospitalId,
      reason: "missing_permission",
      permission,
      entityType: "hospital_member",
      entityId: context.memberId,
    });
    return { ok: false, response: jsonError(403, "You do not have permission to perform this action.") };
  }

  return { ok: true, context };
}

/**
 * Asserts that a row the caller asked for belongs to the caller's hospital.
 *
 * Call this with the `hospitalId` of a row that was fetched by primary key. A
 * mismatch is audited and thrown, never silently treated as "not found", so a
 * probing request leaves a trail.
 */
export async function assertHospitalScope(input: {
  context: HospitalContext;
  rowHospitalId: string;
  entityType: AuditEntityType;
  entityId: string;
}): Promise<void> {
  if (input.rowHospitalId === input.context.hospitalId) return;

  await recordAuditEvent({
    action: "hospital.tenant_access_denied",
    entityType: input.entityType,
    entityId: input.entityId,
    outcome: "DENIED",
    actorUserId: input.context.user.id,
    hospitalId: input.context.hospitalId,
    metadata: { reason: "cross_hospital_access", attemptedHospitalId: input.rowHospitalId },
  });

  throw new HospitalTenantError("hospital_mismatch", "That record belongs to another hospital.");
}

/** Audit helper for reads of a clinical record. */
export async function recordHospitalRecordRead(input: {
  context: HospitalContext;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await recordAuditEvent({
    action: "hospital.record_read",
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.context.user.id,
    hospitalId: input.context.hospitalId,
    metadata: input.metadata,
  });
}

/** The display name recorded against a clinical fact, so it is never "unknown". */
export function actingStaffName(context: HospitalContext) {
  return context.user.fullName;
}
