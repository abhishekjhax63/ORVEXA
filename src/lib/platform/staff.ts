import "server-only";

import type { PlatformStaffMember, PlatformStaffRole, PlatformStaffStatus } from "@prisma/client";

import { canGrantPlatformStaffRole, PLATFORM_STAFF_ROLE_LABELS } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import {
  actingOperatorLabel,
  recordPlatformAction,
  type PlatformContext,
} from "@/lib/platform/console";
import { platformFail, platformOk, type PlatformResult } from "@/lib/platform/errors";
import { sanitiseMultiline } from "@/lib/security/sanitize";
import type {
  PlatformStaffFilterInput,
  PlatformStaffGrantInput,
  PlatformStaffRevokeInput,
  PlatformStaffUpdateInput,
} from "@/lib/validation/platform";

/**
 * Platform operations staff administration.
 *
 * ## This is the escalation boundary
 *
 * A `PlatformStaffMember` row is what turns an ordinary account into an
 * operator, so every write here goes through `canGrantPlatformStaffRole`. That
 * helper refuses a grant from anybody without `platform.staff_manage` and
 * refuses a self-grant — the second check is not politeness: without it, a
 * support agent holding `platform.staff_manage` by some future mistake could
 * hand themselves every queue, and the escalation would be invisible because it
 * would look like an ordinary grant.
 *
 * ## Grants are attributed, never silent
 *
 * The row records who granted it, when, and the reason the granter gave. A
 * privileged grant with no stated reason is exactly the event an audit reader
 * cannot interpret, so the schema requires one and so does this service.
 *
 * ## Revoking is not the same as renaming
 *
 * `revokePlatformStaffRole` closes a membership. Changing which queue somebody
 * works closes the old row and opens a new one, so the history shows two
 * memberships rather than one row whose role changed under an old audit entry.
 */

export type PlatformStaffView = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: PlatformStaffRole;
  roleLabel: string;
  status: PlatformStaffStatus;
  reason: string | null;
  grantedAt: Date;
  grantedByLabel: string | null;
  revokedAt: Date | null;
  /** True when this row belongs to the account reading the queue. */
  isSelf: boolean;
};

function toStaffView(
  row: PlatformStaffMember & {
    user: { fullName: string; email: string };
    grantedBy: { fullName: string } | null;
  },
  actorUserId: string,
): PlatformStaffView {
  return {
    id: row.id,
    userId: row.userId,
    fullName: row.user.fullName,
    email: row.user.email,
    role: row.role,
    roleLabel: PLATFORM_STAFF_ROLE_LABELS[row.role],
    status: row.status,
    reason: row.reason,
    grantedAt: row.grantedAt,
    grantedByLabel: row.grantedBy?.fullName ?? null,
    revokedAt: row.revokedAt,
    isSelf: row.userId === actorUserId,
  };
}

const STAFF_INCLUDE = {
  user: { select: { fullName: true, email: true } },
  grantedBy: { select: { fullName: true } },
} as const;

export async function listPlatformStaff(input: {
  context: PlatformContext;
  filter: PlatformStaffFilterInput;
}): Promise<PlatformStaffView[]> {
  const { filter } = input;
  const rows = await prisma.platformStaffMember.findMany({
    where: {
      ...(filter.role ? { role: filter.role } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.query
        ? {
            OR: [
              { user: { fullName: { contains: filter.query, mode: "insensitive" } } },
              { user: { email: { contains: filter.query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: STAFF_INCLUDE,
    orderBy: [{ status: "asc" }, { grantedAt: "desc" }],
    skip: (filter.page - 1) * filter.pageSize,
    take: filter.pageSize,
  });
  return rows.map((row) => toStaffView(row, input.context.user.id));
}

/**
 * Grants an operations role to the account with the given email.
 *
 * The email is resolved server-side, so a form cannot name an arbitrary user id
 * and a typo lands as "no such account" rather than as a grant to a stranger.
 */
export async function grantPlatformStaffRole(input: {
  context: PlatformContext;
  data: PlatformStaffGrantInput;
}): Promise<PlatformResult<PlatformStaffView>> {
  const { context, data } = input;
  const email = data.email.trim().toLowerCase();

  const target = await prisma.user.findUnique({ where: { email }, select: { id: true, fullName: true } });
  if (!target) {
    return platformFail(
      "staff_account_not_found",
      "No account uses that email address. Ask them to register before granting a role.",
    );
  }

  const allowed = canGrantPlatformStaffRole({
    actorUserId: context.user.id,
    targetUserId: target.id,
    actorPermissions: [...context.permissions],
  });
  if (!allowed.allowed) {
    const code = target.id === context.user.id ? "staff_cannot_grant_to_self" : "staff_role_not_permitted";
    return platformFail(code, allowed.reason);
  }

  const existing = await prisma.platformStaffMember.findUnique({
    where: { userId_role: { userId: target.id, role: data.role } },
    include: STAFF_INCLUDE,
  });
  if (existing && existing.status === "ACTIVE") {
    return platformFail("staff_already_granted", `${target.fullName} already holds that role.`);
  }

  const reason = sanitiseMultiline(data.reason, 600);
  const row = existing
    ? await prisma.platformStaffMember.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          revokedAt: null,
          grantedById: context.user.id,
          grantedAt: new Date(),
          reason,
        },
        include: STAFF_INCLUDE,
      })
    : await prisma.platformStaffMember.create({
        data: { userId: target.id, role: data.role, status: "ACTIVE", grantedById: context.user.id, reason },
        include: STAFF_INCLUDE,
      });

  await recordPlatformAction({
    context,
    action: "platform.staff_role_granted",
    entityType: "platform_staff_member",
    entityId: row.id,
    metadata: {
      targetUserId: target.id,
      targetEmail: email,
      role: row.role,
      reopened: Boolean(existing),
      operator: actingOperatorLabel(context),
    },
  });

  return platformOk(toStaffView(row, context.user.id));
}

/**
 * Moves a member from one operations role to another.
 *
 * Implemented as a close-and-open rather than an update in place: the old
 * membership keeps its `REVOKED` state and its reason, so the audit trail reads
 * as two decisions instead of one row whose role silently changed.
 */
export async function updatePlatformStaffRole(input: {
  context: PlatformContext;
  data: PlatformStaffUpdateInput;
}): Promise<PlatformResult<PlatformStaffView>> {
  const { context, data } = input;

  const member = await prisma.platformStaffMember.findUnique({
    where: { id: data.memberId },
    include: STAFF_INCLUDE,
  });
  if (!member) return platformFail("staff_member_not_found", "That staff membership was not found.");
  if (member.status !== "ACTIVE") {
    return platformFail("staff_member_not_found", "That staff membership is no longer active.");
  }
  if (member.role === data.role) {
    return platformOk(toStaffView(member, context.user.id));
  }

  const allowed = canGrantPlatformStaffRole({
    actorUserId: context.user.id,
    targetUserId: member.userId,
    actorPermissions: [...context.permissions],
  });
  if (!allowed.allowed) {
    const code = member.userId === context.user.id ? "staff_cannot_grant_to_self" : "staff_role_not_permitted";
    return platformFail(code, allowed.reason);
  }

  const clash = await prisma.platformStaffMember.findUnique({
    where: { userId_role: { userId: member.userId, role: data.role } },
    select: { id: true, status: true },
  });
  if (clash && clash.status === "ACTIVE" && clash.id !== member.id) {
    return platformFail("staff_already_granted", "That account already holds the role you are moving them to.");
  }

  const reason = sanitiseMultiline(data.reason, 600);

  const row = await prisma.$transaction(async (tx) => {
    await tx.platformStaffMember.update({
      where: { id: member.id },
      data: { status: "REVOKED", revokedAt: new Date(), reason: `${reason} (moved to ${data.role})` },
    });

    if (clash) {
      return tx.platformStaffMember.update({
        where: { id: clash.id },
        data: { status: "ACTIVE", revokedAt: null, grantedById: context.user.id, grantedAt: new Date(), reason },
        include: STAFF_INCLUDE,
      });
    }

    return tx.platformStaffMember.create({
      data: {
        userId: member.userId,
        role: data.role,
        status: "ACTIVE",
        grantedById: context.user.id,
        reason,
      },
      include: STAFF_INCLUDE,
    });
  });

  await recordPlatformAction({
    context,
    action: "platform.staff_role_updated",
    entityType: "platform_staff_member",
    entityId: row.id,
    metadata: {
      targetUserId: member.userId,
      fromRole: member.role,
      toRole: data.role,
      operator: actingOperatorLabel(context),
    },
  });

  return platformOk(toStaffView(row, context.user.id));
}

export async function revokePlatformStaffRole(input: {
  context: PlatformContext;
  data: PlatformStaffRevokeInput;
}): Promise<PlatformResult<PlatformStaffView>> {
  const { context, data } = input;

  const member = await prisma.platformStaffMember.findUnique({
    where: { id: data.memberId },
    include: STAFF_INCLUDE,
  });
  if (!member) return platformFail("staff_member_not_found", "That staff membership was not found.");
  if (member.status === "REVOKED") {
    return platformFail("staff_member_not_found", "That staff membership is already revoked.");
  }

  // Closing your own membership would sign you out of the console mid-action,
  // and if it were your only membership it would be unrecoverable from inside
  // the console. Another administrator has to do it.
  if (member.userId === context.user.id) {
    return platformFail(
      "staff_role_not_permitted",
      "You cannot revoke your own operations role. Ask another platform administrator to do it.",
    );
  }

  const allowed = canGrantPlatformStaffRole({
    actorUserId: context.user.id,
    targetUserId: member.userId,
    actorPermissions: [...context.permissions],
  });
  if (!allowed.allowed) return platformFail("staff_role_not_permitted", allowed.reason);

  const row = await prisma.platformStaffMember.update({
    where: { id: member.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      reason: sanitiseMultiline(data.reason, 600),
    },
    include: STAFF_INCLUDE,
  });

  await recordPlatformAction({
    context,
    action: "platform.staff_role_revoked",
    entityType: "platform_staff_member",
    entityId: row.id,
    metadata: {
      targetUserId: member.userId,
      role: member.role,
      operator: actingOperatorLabel(context),
    },
  });

  return platformOk(toStaffView(row, context.user.id));
}
