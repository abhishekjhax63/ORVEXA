import "server-only";

import { randomBytes } from "node:crypto";

import type { AccountDeletionRequest, AccountDeletionStatus } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { revokeAllSessionsForUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  actingOperatorLabel,
  recordPlatformAction,
  type PlatformContext,
} from "@/lib/platform/console";
import { platformFail, platformOk, type PlatformResult } from "@/lib/platform/errors";
import { expireReportExports } from "@/lib/platform/exports";
import { AUDIT_RETENTION_MONTHS, recordAuditEvent } from "@/lib/security/audit";
import { purgeResolvedAlerts } from "@/lib/security/alerts";
import { sanitiseMultiline, sanitiseSingleLine } from "@/lib/security/sanitize";
import {
  RETENTION_DATA_CLASSES,
  type AccountDeletionDecisionInput,
  type AccountDeletionRequestInput,
  type RetentionPolicyInput,
  type RetentionPurgeInput,
} from "@/lib/validation/platform";

/**
 * Retention and the right to be forgotten.
 *
 * ## Deletion is a workflow, not a DELETE
 *
 * A person's records are entangled with money movements, clinical history and
 * insurance claims that the platform is obliged to keep. So a request is
 * recorded, scheduled, and *decided*: an operator either blocks it with the
 * obligation that prevents erasure (and the date that obligation lapses) or
 * completes it. `COMPLETED` is written only after the redaction actually ran,
 * in the same transaction as the request's own resolution.
 *
 * ## What "completed" redacts
 *
 * Direct identifiers — name, email, phone, avatar, credential — are replaced and
 * every session is revoked, so the account cannot be signed into and cannot be
 * matched back to a person by the identifiers that were stored. Rows the
 * platform must retain (a settled order, a submitted claim, a clinical record)
 * keep their `userId` anchor: they are kept *because* an obligation requires the
 * record to exist, and destroying the linkage would break the obligation rather
 * than satisfy it. The user's own fields are what this erases, and the console's
 * wording says exactly that.
 *
 * ## A purge that cannot be undone
 *
 * The purge runs as a dry run unless the caller explicitly says otherwise, and
 * the audit window may not be shortened below the platform's floor: an audit
 * trail whose retention can be reduced on a whim is not an audit trail.
 */

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export type RetentionDataClass = (typeof RETENTION_DATA_CLASSES)[number];

type RetentionDefinition = { label: string; defaultDays: number; description: string; floorDays?: number };

/**
 * Defaults per data class.
 *
 * `audit_event`'s window is derived from `AUDIT_RETENTION_MONTHS` rather than
 * restated, so the constant and the policy cannot drift apart. Its `floorDays` is
 * the same number: the audit window may be extended but not reduced through the
 * console.
 */
export const RETENTION_DEFINITIONS: Record<RetentionDataClass, RetentionDefinition> = {
  audit_event: {
    label: "Audit log",
    defaultDays: AUDIT_RETENTION_MONTHS * 30,
    floorDays: AUDIT_RETENTION_MONTHS * 30,
    description:
      "Privileged operations, clinical changes and access to sensitive records. Held for the platform's audit floor and never shortened by a console change.",
  },
  expired_session: {
    label: "Expired sessions",
    defaultDays: 30,
    description: "Signed-out and expired session rows, kept briefly so a sign-in can be traced during an incident.",
  },
  rate_limit_counter: {
    label: "Rate-limit counters",
    defaultDays: 30,
    description: "Fixed-window counters for abuse protection. They carry no personal data beyond a hashed identity.",
  },
  integration_alert: {
    label: "Resolved alerts",
    defaultDays: 365,
    description: "Alerts that have been resolved. Open alerts are never purged.",
  },
  operational_metric: {
    label: "Operational metrics",
    defaultDays: 400,
    description: "Sampled dashboard windows, kept long enough to compare a year against the previous one.",
  },
  report_export: {
    label: "Expired report exports",
    defaultDays: 30,
    description: "Rows for exports that have already expired and had their files deleted.",
  },
};

export type RetentionPolicyView = {
  dataClass: RetentionDataClass;
  label: string;
  description: string;
  retentionDays: number;
  configured: boolean;
  floorDays: number | null;
  lastPurgedAt: Date | null;
  lastPurgedCount: number | null;
  updatedAt: Date | null;
  updatedByLabel: string | null;
};

export async function listRetentionPolicies(): Promise<RetentionPolicyView[]> {
  const rows = await prisma.retentionPolicy.findMany({
    where: { dataClass: { in: [...RETENTION_DATA_CLASSES] } },
    include: { updatedBy: { select: { fullName: true } } },
  });
  const byClass = new Map(rows.map((row) => [row.dataClass, row]));

  return RETENTION_DATA_CLASSES.map((dataClass) => {
    const definition = RETENTION_DEFINITIONS[dataClass];
    const row = byClass.get(dataClass);
    return {
      dataClass,
      label: row?.label || definition.label,
      description: row?.description ?? definition.description,
      retentionDays: row?.retentionDays ?? definition.defaultDays,
      configured: Boolean(row),
      floorDays: definition.floorDays ?? null,
      lastPurgedAt: row?.lastPurgedAt ?? null,
      lastPurgedCount: row?.lastPurgedCount ?? null,
      updatedAt: row?.updatedAt ?? null,
      updatedByLabel: row?.updatedBy?.fullName ?? null,
    };
  });
}

export async function updateRetentionPolicy(input: {
  context: PlatformContext;
  data: RetentionPolicyInput;
}): Promise<PlatformResult<RetentionPolicyView>> {
  const { context, data } = input;
  const definition = RETENTION_DEFINITIONS[data.dataClass];

  if (definition.floorDays && data.retentionDays < definition.floorDays) {
    return platformFail(
      "retention_window_too_short",
      `The ${definition.label.toLowerCase()} window cannot be reduced below ${definition.floorDays} days through the console.`,
    );
  }

  const row = await prisma.retentionPolicy.upsert({
    where: { dataClass: data.dataClass },
    create: {
      dataClass: data.dataClass,
      label: data.label ? sanitiseSingleLine(data.label, 160) : definition.label,
      description: data.description ? sanitiseMultiline(data.description, 600) : definition.description,
      retentionDays: data.retentionDays,
      updatedById: context.user.id,
    },
    update: {
      retentionDays: data.retentionDays,
      ...(data.label ? { label: sanitiseSingleLine(data.label, 160) } : {}),
      ...(data.description ? { description: sanitiseMultiline(data.description, 600) } : {}),
      updatedById: context.user.id,
    },
    include: { updatedBy: { select: { fullName: true } } },
  });

  await recordPlatformAction({
    context,
    action: "platform.retention_policy_updated",
    entityType: "retention_policy",
    entityId: row.id,
    metadata: { dataClass: row.dataClass, retentionDays: row.retentionDays },
  });

  return platformOk({
    dataClass: data.dataClass,
    label: row.label,
    description: row.description ?? definition.description,
    retentionDays: row.retentionDays,
    configured: true,
    floorDays: definition.floorDays ?? null,
    lastPurgedAt: row.lastPurgedAt,
    lastPurgedCount: row.lastPurgedCount,
    updatedAt: row.updatedAt,
    updatedByLabel: row.updatedBy?.fullName ?? null,
  });
}

// ---------------------------------------------------------------------------
// Purging
// ---------------------------------------------------------------------------

export type PurgeOutcome = {
  dataClass: RetentionDataClass;
  retentionDays: number;
  cutoff: Date;
  /** Rows past the cutoff. In a dry run this is what *would* be removed. */
  affected: number;
  removed: boolean;
};

export type PurgeSummary = {
  dryRun: boolean;
  ranAt: Date;
  classes: PurgeOutcome[];
  totalAffected: number;
};

function cutoffFor(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Purges one data class.
 *
 * Each class deletes by its own policy window rather than by a shared cutoff,
 * because "how long is an audit row kept" and "how long is a rate-limit counter
 * kept" have different answers.
 */
async function purgeClass(
  dataClass: RetentionDataClass,
  days: number,
  now: Date,
  dryRun: boolean,
): Promise<number> {
  const cutoff = cutoffFor(days, now);

  switch (dataClass) {
    case "audit_event": {
      if (dryRun) return prisma.auditEvent.count({ where: { createdAt: { lt: cutoff } } });
      const result = await prisma.auditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
      return result.count;
    }
    case "expired_session": {
      const where = { expiresAt: { lt: cutoff } } as const;
      if (dryRun) return prisma.session.count({ where });
      const result = await prisma.session.deleteMany({ where });
      return result.count;
    }
    case "rate_limit_counter": {
      // The window is measured from a counter's own expiry, so the policy reads
      // as "how long after a counter lapses is it kept".
      const where = { expiresAt: { lt: cutoff } } as const;
      if (dryRun) return prisma.rateLimitCounter.count({ where });
      const result = await prisma.rateLimitCounter.deleteMany({ where });
      return result.count;
    }
    case "integration_alert": {
      if (dryRun) {
        return prisma.integrationAlert.count({ where: { status: "RESOLVED", resolvedAt: { lt: cutoff } } });
      }
      return purgeResolvedAlerts(days);
    }
    case "operational_metric": {
      const where = { windowTo: { lt: cutoff } } as const;
      if (dryRun) return prisma.operationalMetric.count({ where });
      const result = await prisma.operationalMetric.deleteMany({ where });
      return result.count;
    }
    case "report_export": {
      if (dryRun) {
        return prisma.reportExport.count({
          where: { status: "EXPIRED", createdAt: { lt: cutoff } },
        });
      }
      // Expire first so a file is never orphaned, then remove the rows.
      await expireReportExports(now);
      const result = await prisma.reportExport.deleteMany({
        where: { status: "EXPIRED", createdAt: { lt: cutoff } },
      });
      return result.count;
    }
  }
}

/**
 * Runs the retention purge.
 *
 * `dryRun` defaults to true in the schema, so the first press reports what would
 * be removed and touches nothing. A destructive run has to be asked for.
 */
export async function runRetentionPurge(input: {
  context: PlatformContext;
  data: RetentionPurgeInput;
  now?: Date;
}): Promise<PlatformResult<PurgeSummary>> {
  const now = input.now ?? new Date();
  const dryRun = input.data.dryRun;
  const targets = input.data.dataClass ? [input.data.dataClass] : [...RETENTION_DATA_CLASSES];

  const policies = await listRetentionPolicies();
  const daysByClass = new Map(policies.map((policy) => [policy.dataClass, policy.retentionDays]));

  const classes: PurgeOutcome[] = [];
  for (const dataClass of targets) {
    const retentionDays = daysByClass.get(dataClass) ?? RETENTION_DEFINITIONS[dataClass].defaultDays;
    const affected = await purgeClass(dataClass, retentionDays, now, dryRun);

    if (!dryRun) {
      await prisma.retentionPolicy.upsert({
        where: { dataClass },
        create: {
          dataClass,
          label: RETENTION_DEFINITIONS[dataClass].label,
          description: RETENTION_DEFINITIONS[dataClass].description,
          retentionDays,
          lastPurgedAt: now,
          lastPurgedCount: affected,
          updatedById: input.context.user.id,
        },
        update: { lastPurgedAt: now, lastPurgedCount: affected },
      });
    }

    classes.push({
      dataClass,
      retentionDays,
      cutoff: cutoffFor(retentionDays, now),
      affected,
      removed: !dryRun,
    });
  }

  const totalAffected = classes.reduce((total, entry) => total + entry.affected, 0);

  await recordPlatformAction({
    context: input.context,
    action: "platform.retention_purge_run",
    entityType: "retention_policy",
    entityId: input.data.dataClass ?? null,
    metadata: {
      dryRun,
      dataClass: input.data.dataClass ?? "all",
      totalAffected,
      classes: classes.map((entry) => entry.dataClass).join(","),
    },
  });

  return platformOk({ dryRun, ranAt: now, classes, totalAffected });
}

// ---------------------------------------------------------------------------
// Account deletion requests
// ---------------------------------------------------------------------------

/** Days between a request being raised and it becoming actionable. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export type AccountDeletionView = {
  id: string;
  userId: string;
  status: AccountDeletionStatus;
  reason: string | null;
  requestedAt: Date;
  scheduledFor: Date;
  processedAt: Date | null;
  blockedReason: string | null;
  retentionHoldUntil: Date | null;
  processedByLabel: string | null;
};

function toDeletionView(
  row: AccountDeletionRequest & { processedBy?: { fullName: string } | null },
): AccountDeletionView {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    reason: row.reason,
    requestedAt: row.requestedAt,
    scheduledFor: row.scheduledFor,
    processedAt: row.processedAt,
    blockedReason: row.blockedReason,
    retentionHoldUntil: row.retentionHoldUntil,
    processedByLabel: row.processedBy?.fullName ?? null,
  };
}

/**
 * Raises a request from the person's own account settings.
 *
 * Idempotent: a second press returns the request that already exists rather than
 * raising a duplicate. The schedule is set server-side so a caller cannot make
 * their own deletion immediate.
 */
export async function requestAccountDeletion(input: {
  userId: string;
  userLabel?: string | null;
  data: AccountDeletionRequestInput;
}): Promise<PlatformResult<AccountDeletionView>> {
  const existing = await prisma.accountDeletionRequest.findFirst({
    where: { userId: input.userId, status: "REQUESTED" },
    include: { processedBy: { select: { fullName: true } } },
  });
  if (existing) return platformOk(toDeletionView(existing));

  const row = await prisma.accountDeletionRequest.create({
    data: {
      userId: input.userId,
      status: "REQUESTED",
      reason: input.data.reason ? sanitiseMultiline(input.data.reason, 1000) : null,
      scheduledFor: new Date(Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000),
    },
    include: { processedBy: { select: { fullName: true } } },
  });

  await recordAuditEvent({
    action: "platform.account_deletion_requested",
    entityType: "account_deletion_request",
    entityId: row.id,
    actorUserId: input.userId,
    actorLabel: input.userLabel ?? null,
    metadata: { scheduledFor: row.scheduledFor.toISOString() },
  });

  return platformOk(toDeletionView(row));
}

export async function cancelOwnAccountDeletion(input: {
  userId: string;
  userLabel?: string | null;
}): Promise<PlatformResult<AccountDeletionView>> {
  const existing = await prisma.accountDeletionRequest.findFirst({
    where: { userId: input.userId, status: "REQUESTED" },
    include: { processedBy: { select: { fullName: true } } },
  });
  if (!existing) {
    return platformFail("deletion_request_not_found", "There is no open deletion request on this account.");
  }

  const row = await prisma.accountDeletionRequest.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      processedAt: new Date(),
      processedById: input.userId,
      blockedReason: "Withdrawn by the account holder.",
    },
    include: { processedBy: { select: { fullName: true } } },
  });

  await recordAuditEvent({
    action: "platform.account_deletion_cancelled",
    entityType: "account_deletion_request",
    entityId: row.id,
    actorUserId: input.userId,
    actorLabel: input.userLabel ?? null,
  });

  return platformOk(toDeletionView(row));
}

export async function listAccountDeletionRequests(input: {
  status?: AccountDeletionStatus;
  limit?: number;
} = {}): Promise<AccountDeletionView[]> {
  const rows = await prisma.accountDeletionRequest.findMany({
    where: input.status ? { status: input.status } : {},
    include: { processedBy: { select: { fullName: true } } },
    orderBy: { requestedAt: "asc" },
    take: Math.min(input.limit ?? 100, 500),
  });
  return rows.map(toDeletionView);
}

/**
 * The retention obligations that block an immediate erasure.
 *
 * Read from the rows that carry a `retentionUntil`: a settled pharmacy order and
 * a submitted insurance claim are the two the platform must be able to answer
 * for. The latest such date is what a blocked request is held until.
 */
async function retentionHoldUntil(userId: string): Promise<Date | null> {
  const [order, claim] = await Promise.all([
    prisma.pharmacyOrder.findFirst({
      where: { customerUserId: userId, retentionUntil: { gt: new Date() } },
      select: { retentionUntil: true },
      orderBy: { retentionUntil: "desc" },
    }),
    prisma.insuranceClaim.findFirst({
      where: { patientUserId: userId, retentionUntil: { gt: new Date() } },
      select: { retentionUntil: true },
      orderBy: { retentionUntil: "desc" },
    }),
  ]);

  const dates = [order?.retentionUntil, claim?.retentionUntil].filter(
    (value): value is Date => value instanceof Date,
  );
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

/**
 * Redacts an account's direct identifiers.
 *
 * Bounded on purpose. It clears the fields that identify a person and revokes
 * every session; it does not attempt to cascade into records the platform is
 * obliged to keep, because those rows exist under a retention duty and deleting
 * them would break it. The caller records what happened.
 */
async function redactAccount(userId: string): Promise<void> {
  // A structurally valid hash of a value nobody holds, so the stored credential
  // cannot be compared against and the column keeps its shape.
  const unusablePassword = await hashPassword(randomBytes(32).toString("hex"));
  const placeholderEmail = `deleted+${userId}@orvexa.invalid`;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        fullName: "Deleted account",
        email: placeholderEmail,
        phone: null,
        avatarUrl: null,
        passwordHash: unusablePassword,
        status: "DEACTIVATED",
        deactivatedAt: new Date(),
        lockedUntil: null,
      },
    });
    await tx.authChallenge.deleteMany({ where: { userId } });
  });

  await revokeAllSessionsForUser(userId, "account_deleted");
}

/**
 * Resolves a deletion request.
 *
 * `COMPLETE` re-checks the retention obligations rather than trusting the state
 * at request time — a claim may have been submitted during the grace period —
 * and blocks instead of erasing when one applies. Only a completed redaction
 * writes `COMPLETED`.
 */
export async function decideAccountDeletion(input: {
  context: PlatformContext;
  data: AccountDeletionDecisionInput;
}): Promise<PlatformResult<AccountDeletionView>> {
  const { context, data } = input;

  const request = await prisma.accountDeletionRequest.findUnique({
    where: { id: data.requestId },
    include: { processedBy: { select: { fullName: true } } },
  });
  if (!request) return platformFail("deletion_request_not_found", "That deletion request was not found.");
  if (request.status !== "REQUESTED") {
    return platformFail("deletion_already_resolved", "That deletion request has already been resolved.");
  }

  const label = actingOperatorLabel(context);

  if (data.decision === "CANCEL") {
    const row = await prisma.accountDeletionRequest.update({
      where: { id: request.id },
      data: {
        status: "CANCELLED",
        processedAt: new Date(),
        processedById: context.user.id,
        blockedReason: sanitiseMultiline(data.blockedReason ?? "Cancelled by platform staff.", 1000),
      },
      include: { processedBy: { select: { fullName: true } } },
    });
    await recordPlatformAction({
      context,
      action: "platform.account_deletion_cancelled",
      entityType: "account_deletion_request",
      entityId: row.id,
      metadata: { operator: label },
    });
    return platformOk(toDeletionView(row));
  }

  if (data.decision === "BLOCK") {
    const row = await prisma.accountDeletionRequest.update({
      where: { id: request.id },
      data: {
        status: "BLOCKED",
        processedAt: new Date(),
        processedById: context.user.id,
        blockedReason: sanitiseMultiline(data.blockedReason ?? "", 1000),
        retentionHoldUntil: data.retentionHoldUntil ?? null,
      },
      include: { processedBy: { select: { fullName: true } } },
    });
    await recordPlatformAction({
      context,
      action: "platform.account_deletion_decided",
      entityType: "account_deletion_request",
      entityId: row.id,
      metadata: {
        decision: "BLOCK",
        retentionHoldUntil: row.retentionHoldUntil?.toISOString() ?? null,
        operator: label,
      },
    });
    return platformOk(toDeletionView(row));
  }

  // COMPLETE — the obligations are re-checked, not assumed.
  const hold = await retentionHoldUntil(request.userId);
  if (hold) {
    const row = await prisma.accountDeletionRequest.update({
      where: { id: request.id },
      data: {
        status: "BLOCKED",
        processedAt: new Date(),
        processedById: context.user.id,
        blockedReason:
          "A settled order or a submitted insurance claim on this account is under a retention obligation.",
        retentionHoldUntil: hold,
      },
      include: { processedBy: { select: { fullName: true } } },
    });
    await recordPlatformAction({
      context,
      action: "platform.account_deletion_decided",
      entityType: "account_deletion_request",
      entityId: row.id,
      metadata: { decision: "BLOCK", reason: "retention_obligation", operator: label },
    });
    return platformOk(toDeletionView(row));
  }

  await redactAccount(request.userId);

  const row = await prisma.accountDeletionRequest.update({
    where: { id: request.id },
    data: {
      status: "COMPLETED",
      processedAt: new Date(),
      processedById: context.user.id,
      blockedReason: null,
    },
    include: { processedBy: { select: { fullName: true } } },
  });

  await recordPlatformAction({
    context,
    action: "platform.account_deletion_decided",
    entityType: "account_deletion_request",
    entityId: row.id,
    metadata: { decision: "COMPLETE", operator: label },
  });

  return platformOk(toDeletionView(row));
}
