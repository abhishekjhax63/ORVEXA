import "server-only";

import type {
  IntegrationAlert,
  IntegrationAlertKind,
  IntegrationAlertSeverity,
  IntegrationAlertStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import { logOperationalEvent } from "@/lib/security/logger";
import { sanitiseMultiline, sanitiseSingleLine } from "@/lib/security/sanitize";

/**
 * The alert queue for security and integration failures.
 *
 * ## The problem this solves
 *
 * A payment webhook that starts returning 500, a video provider that stops
 * issuing tokens, a dispatch webhook that is acknowledged by nobody: none of
 * these throw where an operator is watching. They fail quietly, and the first
 * person to notice is a customer. An alert row is what turns "quiet" into
 * "visible".
 *
 * ## Deduplication is the whole design
 *
 * A failing provider fails thousands of times. Storing one row per failure
 * produces a queue nobody can read, which is the same as no queue. Every alert
 * therefore carries a `fingerprint` — a stable string derived from *what* is
 * failing, never from *when* — and a repeat of the same fingerprint increments
 * `occurrences` and moves `lastSeenAt` instead of inserting. The queue stays
 * one row per problem, with an honest count of how often it happened.
 *
 * ## What is never stored
 *
 * `detail` is a short operator-readable summary. It is never a request body, a
 * provider response containing personal data, or a token. Metadata is typed to
 * primitives for the same reason the logger is.
 */

export type AlertMetadata = Record<string, string | number | boolean | null>;

export type RaiseAlertInput = {
  kind: IntegrationAlertKind;
  severity?: IntegrationAlertSeverity;
  /** The subsystem that failed, e.g. `payments`, `video`, `dispatch`. */
  source: string;
  title: string;
  detail?: string | null;
  /** Stable, content-derived key. See `alertFingerprint`. */
  fingerprint: string;
  metadata?: AlertMetadata;
};

/**
 * Builds a fingerprint from the parts that identify a *problem*.
 *
 * The parts are normalised so `POST /api/x?t=1` and `POST /api/x?t=2` from the
 * same failing endpoint collapse into one alert, and the result is bounded so a
 * long path cannot grow the unique index without limit.
 */
export function alertFingerprint(parts: readonly (string | number | null | undefined)[]): string {
  return parts
    .map((part) => (part === null || part === undefined ? "" : String(part)))
    .join("|")
    .replace(/\d{2,}/g, "#")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, 200);
}

/**
 * Records a failure, or folds it into the existing alert for the same problem.
 *
 * Returns the alert's id and whether this call created it, so a caller can
 * decide to notify only on the first occurrence.
 */
export async function raiseAlert(
  input: RaiseAlertInput,
): Promise<{ alertId: string; created: boolean; occurrences: number }> {
  const fingerprint = input.fingerprint.slice(0, 200);
  const now = new Date();

  const existing = await prisma.integrationAlert.findFirst({
    where: { fingerprint, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    select: { id: true, occurrences: true, status: true },
    orderBy: { lastSeenAt: "desc" },
  });

  if (existing) {
    const updated = await prisma.integrationAlert.update({
      where: { id: existing.id },
      data: {
        occurrences: { increment: 1 },
        lastSeenAt: now,
        // A recurrence after an acknowledgement reopens the alert: "we saw this
        // and ticked it" must not hide the fact that it happened again.
        status: existing.status === "ACKNOWLEDGED" ? "OPEN" : existing.status,
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.detail ? { detail: sanitiseMultiline(input.detail, 2000) } : {}),
      },
      select: { id: true, occurrences: true },
    });

    logOperationalEvent("warn", "alert.recurred", sanitiseSingleLine(input.title, 160), {
      subject: input.source,
      metadata: { alertId: updated.id, occurrences: updated.occurrences, fingerprint },
    });

    return { alertId: updated.id, created: false, occurrences: updated.occurrences };
  }

  const alert = await prisma.integrationAlert.create({
    data: {
      kind: input.kind,
      severity: input.severity ?? "WARNING",
      status: "OPEN",
      fingerprint,
      source: sanitiseSingleLine(input.source, 80),
      title: sanitiseSingleLine(input.title, 200),
      detail: input.detail ? sanitiseMultiline(input.detail, 2000) : null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    select: { id: true, occurrences: true },
  });

  await recordAuditEvent({
    action: "platform.alert_raised",
    entityType: "integration_alert",
    entityId: alert.id,
    actorUserId: null,
    metadata: { kind: input.kind, severity: input.severity ?? "WARNING", source: input.source, fingerprint },
  });

  logOperationalEvent("error", "alert.raised", sanitiseSingleLine(input.title, 160), {
    subject: input.source,
    metadata: { alertId: alert.id, severity: input.severity ?? "WARNING", fingerprint },
  });

  return { alertId: alert.id, created: true, occurrences: 1 };
}

/**
 * Runs a provider call and turns a failure into an alert before rethrowing.
 *
 * The rethrow matters: the caller must still see the failure and behave as if
 * the provider was down. Raising the alert is a side effect, not a recovery.
 */
export async function withIntegrationAlert<T>(
  options: {
    kind?: IntegrationAlertKind;
    severity?: IntegrationAlertSeverity;
    source: string;
    operation: string;
    fingerprintParts?: readonly (string | number | null | undefined)[];
    metadata?: AlertMetadata;
  },
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    await raiseAlert({
      kind: options.kind ?? "INTEGRATION",
      severity: options.severity ?? "WARNING",
      source: options.source,
      title: `${options.source} call failed: ${options.operation}`,
      detail: error instanceof Error ? error.message : "Unknown provider failure.",
      fingerprint: alertFingerprint([options.source, options.operation, ...(options.fingerprintParts ?? [])]),
      metadata: options.metadata,
    });
    throw error;
  }
}

export async function acknowledgeAlert(input: {
  alertId: string;
  actorUserId: string;
  actorLabel?: string | null;
  /** Optional context from the operator, kept on the audit row, not on the alert. */
  note?: string | null;
}): Promise<IntegrationAlert> {
  const alert = await prisma.integrationAlert.update({
    where: { id: input.alertId },
    data: { status: "ACKNOWLEDGED", acknowledgedById: input.actorUserId, acknowledgedAt: new Date() },
  });

  await recordAuditEvent({
    action: "platform.alert_acknowledged",
    entityType: "integration_alert",
    entityId: alert.id,
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel ?? null,
    metadata: { source: alert.source, fingerprint: alert.fingerprint, note: input.note ?? null },
  });

  return alert;
}

export async function resolveAlert(input: {
  alertId: string;
  actorUserId: string;
  actorLabel?: string | null;
  /** Optional context from the operator, kept on the audit row, not on the alert. */
  note?: string | null;
}): Promise<IntegrationAlert> {
  const alert = await prisma.integrationAlert.update({
    where: { id: input.alertId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  await recordAuditEvent({
    action: "platform.alert_resolved",
    entityType: "integration_alert",
    entityId: alert.id,
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel ?? null,
    metadata: { source: alert.source, fingerprint: alert.fingerprint, note: input.note ?? null },
  });

  return alert;
}

export type AlertSummary = {
  id: string;
  kind: IntegrationAlertKind;
  severity: IntegrationAlertSeverity;
  status: IntegrationAlertStatus;
  source: string;
  title: string;
  detail: string | null;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
};

export async function listAlerts(input: {
  kind?: IntegrationAlertKind;
  status?: IntegrationAlertStatus;
  severity?: IntegrationAlertSeverity;
  source?: string;
  limit?: number;
} = {}): Promise<AlertSummary[]> {
  const alerts = await prisma.integrationAlert.findMany({
    where: {
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.severity ? { severity: input.severity } : {}),
      ...(input.source ? { source: input.source } : {}),
    },
    // Unresolved and severe first: the queue is read top-down under pressure.
    orderBy: [{ status: "asc" }, { severity: "desc" }, { lastSeenAt: "desc" }],
    take: Math.min(input.limit ?? 100, 200),
    select: {
      id: true,
      kind: true,
      severity: true,
      status: true,
      source: true,
      title: true,
      detail: true,
      occurrences: true,
      firstSeenAt: true,
      lastSeenAt: true,
      acknowledgedAt: true,
      resolvedAt: true,
    },
  });

  return alerts;
}

/** Counts by status, for the console header and the health check. */
export async function alertCounts(): Promise<{
  open: number;
  acknowledged: number;
  resolved: number;
  criticalOpen: number;
}> {
  const [open, acknowledged, resolved, criticalOpen] = await Promise.all([
    prisma.integrationAlert.count({ where: { status: "OPEN" } }),
    prisma.integrationAlert.count({ where: { status: "ACKNOWLEDGED" } }),
    prisma.integrationAlert.count({ where: { status: "RESOLVED" } }),
    prisma.integrationAlert.count({ where: { status: "OPEN", severity: "CRITICAL" } }),
  ]);
  return { open, acknowledged, resolved, criticalOpen };
}

/** Purges resolved alerts past their retention window. */
export async function purgeResolvedAlerts(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.integrationAlert.deleteMany({
    where: { status: "RESOLVED", resolvedAt: { lt: cutoff } },
  });
  return result.count;
}
