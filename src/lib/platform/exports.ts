import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma, ReportExport, ReportExportStatus } from "@prisma/client";

import { createAiSignedUrl, putAiObject, removeAiObject } from "@/lib/ai/storage";
import { prisma } from "@/lib/db/prisma";
import {
  actingOperatorLabel,
  recordPlatformAction,
  type PlatformContext,
} from "@/lib/platform/console";
import { platformFail, platformOk, type PlatformResult } from "@/lib/platform/errors";
import { logOperationalEvent } from "@/lib/security/logger";
import { sanitiseSingleLine } from "@/lib/security/sanitize";
import { documentChecksum } from "@/lib/documents/storage";
import type { ExportQueueFilterInput, ExportRequestInput } from "@/lib/validation/platform";

/**
 * Authorized report exports.
 *
 * ## An export is a record before it is a file
 *
 * The row is written first, with who asked, what range, why and whether the
 * result carries personal data — and only then is anything generated. A failed
 * generation leaves a `FAILED` row with its reason, so "we exported patient
 * appointment data on the 14th" stays answerable even when the file never
 * existed.
 *
 * ## The columns are chosen here, not by the caller
 *
 * Each report names its own columns. None of them include a patient's name, a
 * clinical note, a prescription body, a report finding or any free text a person
 * wrote. An export is an operational instrument; it is not a route to reading
 * medical records in bulk, and the column list is the control that keeps it that
 * way.
 *
 * ## Personal data narrows who may export
 *
 * An export whose columns identify a person requires `audit.read` — the same
 * permission that already lets an account read the audit trail — because
 * "who may see attributed operational history" is the same question. The
 * requester's own declaration is honoured, but the server's stricter answer
 * wins: declaring `false` on a report whose columns are identifiable does not
 * widen access.
 *
 * ## A file that leaves cannot be recalled
 *
 * The generated object gets a random key, is stored in the private bucket, is
 * reachable only through a short-lived signed link, and is deleted when the row
 * expires. Link creation re-checks every one of those conditions, because the
 * row and the file have independent lifetimes and the check must not be assumed
 * to have happened when the row was written.
 */

export const EXPORT_LINK_TTL_SECONDS = 300;
export const EXPORT_RETENTION_DAYS = 7;

/**
 * Above this the export is refused rather than truncated.
 *
 * A truncated export that looks complete is the failure mode to avoid: somebody
 * would reconcile against it and come up short with no indication why. Refusing
 * with "narrow the range" is the honest outcome.
 */
const MAX_EXPORT_ROWS = 10_000;

export type ReportRow = Record<string, string | number | boolean | null>;

type ReportColumn = { key: string; label: string };

type ExportReportKey = ExportRequestInput["reportKey"];

type ReportDescriptor = {
  label: string;
  /** Whether the columns can identify a person, independently of the request. */
  personalData: boolean;
  columns: readonly ReportColumn[];
  count: (from: Date, to: Date) => Promise<number>;
  run: (from: Date, to: Date) => Promise<ReportRow[]>;
};

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

/**
 * The report catalogue.
 *
 * Every query filters `isDemo` rows where the column exists, and every query
 * selects only the columns listed here — the shape of the CSV and the shape of
 * the query are the same object, so a column cannot be added to the file without
 * being added to the definition (and to the personal-data judgement above).
 */
const REPORT_SOURCES: Record<ExportReportKey, ReportDescriptor> = {
  appointments: {
    label: "Appointments",
    personalData: true,
    columns: [
      { key: "reference", label: "Reference" },
      { key: "mode", label: "Mode" },
      { key: "status", label: "Status" },
      { key: "scheduledStart", label: "Scheduled start" },
      { key: "completedAt", label: "Completed at" },
      { key: "cancelledAt", label: "Cancelled at" },
      { key: "createdAt", label: "Created at" },
    ],
    count: (from, to) => prisma.appointment.count({ where: { createdAt: { gte: from, lte: to } } }),
    run: async (from, to) => {
      const rows = await prisma.appointment.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          reference: true,
          mode: true,
          status: true,
          scheduledStart: true,
          completedAt: true,
          cancelledAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: MAX_EXPORT_ROWS,
      });
      return rows.map((row) => ({
        reference: row.reference,
        mode: row.mode,
        status: row.status,
        scheduledStart: iso(row.scheduledStart),
        completedAt: iso(row.completedAt),
        cancelledAt: iso(row.cancelledAt),
        createdAt: iso(row.createdAt),
      }));
    },
  },

  pharmacy_orders: {
    label: "Pharmacy orders",
    personalData: true,
    columns: [
      { key: "reference", label: "Reference" },
      { key: "status", label: "Status" },
      { key: "deliveryCity", label: "Delivery city" },
      { key: "totalPaise", label: "Total (paise)" },
      { key: "placedAt", label: "Placed at" },
      { key: "deliveredAt", label: "Delivered at" },
      { key: "cancelledAt", label: "Cancelled at" },
    ],
    count: (from, to) => prisma.pharmacyOrder.count({ where: { isDemo: false, placedAt: { gte: from, lte: to } } }),
    run: async (from, to) => {
      const rows = await prisma.pharmacyOrder.findMany({
        where: { isDemo: false, placedAt: { gte: from, lte: to } },
        select: {
          reference: true,
          status: true,
          deliveryCity: true,
          totalPaise: true,
          placedAt: true,
          deliveredAt: true,
          cancelledAt: true,
        },
        orderBy: { placedAt: "asc" },
        take: MAX_EXPORT_ROWS,
      });
      return rows.map((row) => ({
        reference: row.reference,
        status: row.status,
        deliveryCity: row.deliveryCity,
        totalPaise: row.totalPaise,
        placedAt: iso(row.placedAt),
        deliveredAt: iso(row.deliveredAt),
        cancelledAt: iso(row.cancelledAt),
      }));
    },
  },

  diagnostic_bookings: {
    label: "Diagnostic bookings",
    personalData: true,
    columns: [
      { key: "reference", label: "Reference" },
      { key: "mode", label: "Mode" },
      { key: "status", label: "Status" },
      { key: "scheduledAt", label: "Scheduled at" },
      { key: "sampleCollectedAt", label: "Sample collected at" },
      { key: "completedAt", label: "Completed at" },
      { key: "createdAt", label: "Created at" },
    ],
    count: (from, to) =>
      prisma.diagnosticBooking.count({ where: { isDemo: false, createdAt: { gte: from, lte: to } } }),
    run: async (from, to) => {
      const rows = await prisma.diagnosticBooking.findMany({
        where: { isDemo: false, createdAt: { gte: from, lte: to } },
        select: {
          reference: true,
          mode: true,
          status: true,
          scheduledAt: true,
          sampleCollectedAt: true,
          completedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: MAX_EXPORT_ROWS,
      });
      return rows.map((row) => ({
        reference: row.reference,
        mode: row.mode,
        status: row.status,
        scheduledAt: iso(row.scheduledAt),
        sampleCollectedAt: iso(row.sampleCollectedAt),
        completedAt: iso(row.completedAt),
        createdAt: iso(row.createdAt),
      }));
    },
  },

  insurance_claims: {
    label: "Insurance claims",
    personalData: true,
    columns: [
      { key: "reference", label: "Reference" },
      { key: "claimType", label: "Claim type" },
      { key: "status", label: "Status" },
      { key: "decision", label: "Decision" },
      { key: "claimedAmountInr", label: "Claimed (INR)" },
      { key: "approvedAmountInr", label: "Approved (INR)" },
      { key: "submittedAt", label: "Submitted at" },
      { key: "decidedAt", label: "Decided at" },
    ],
    count: (from, to) => prisma.insuranceClaim.count({ where: { isDemo: false, createdAt: { gte: from, lte: to } } }),
    run: async (from, to) => {
      const rows = await prisma.insuranceClaim.findMany({
        where: { isDemo: false, createdAt: { gte: from, lte: to } },
        select: {
          reference: true,
          claimType: true,
          status: true,
          decision: true,
          claimedAmountInr: true,
          approvedAmountInr: true,
          submittedAt: true,
          decidedAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: MAX_EXPORT_ROWS,
      });
      return rows.map((row) => ({
        reference: row.reference,
        claimType: row.claimType,
        status: row.status,
        decision: row.decision,
        claimedAmountInr: row.claimedAmountInr,
        approvedAmountInr: row.approvedAmountInr,
        submittedAt: iso(row.submittedAt),
        decidedAt: iso(row.decidedAt),
      }));
    },
  },

  support_tickets: {
    label: "Support tickets",
    personalData: true,
    columns: [
      { key: "reference", label: "Reference" },
      { key: "category", label: "Category" },
      { key: "severity", label: "Severity" },
      { key: "status", label: "Status" },
      { key: "createdAt", label: "Created at" },
      { key: "resolvedAt", label: "Resolved at" },
      { key: "closedAt", label: "Closed at" },
    ],
    // `subject` and `description` are deliberately absent: they are the person's
    // own words about their health or their account.
    count: (from, to) => prisma.supportTicket.count({ where: { createdAt: { gte: from, lte: to } } }),
    run: async (from, to) => {
      const rows = await prisma.supportTicket.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          reference: true,
          category: true,
          severity: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
          closedAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: MAX_EXPORT_ROWS,
      });
      return rows.map((row) => ({
        reference: row.reference,
        category: row.category,
        severity: row.severity,
        status: row.status,
        createdAt: iso(row.createdAt),
        resolvedAt: iso(row.resolvedAt),
        closedAt: iso(row.closedAt),
      }));
    },
  },

  provider_performance: {
    label: "Provider performance",
    personalData: false,
    columns: [
      { key: "pharmacyProfileId", label: "Pharmacy profile" },
      { key: "orders", label: "Orders placed" },
      { key: "delivered", label: "Orders delivered" },
      { key: "cancelled", label: "Orders cancelled" },
      { key: "averageAcceptMinutes", label: "Average accept (minutes)" },
    ],
    count: (from, to) =>
      prisma.pharmacyOrder
        .groupBy({ by: ["pharmacyProfileId"], where: { isDemo: false, placedAt: { gte: from, lte: to } } })
        .then((rows) => rows.length),
    run: async (from, to) => {
      const grouped = await prisma.pharmacyOrder.groupBy({
        by: ["pharmacyProfileId", "status"],
        where: { isDemo: false, placedAt: { gte: from, lte: to } },
        _count: { _all: true },
      });

      const byProfile = new Map<string, { orders: number; delivered: number; cancelled: number }>();
      for (const group of grouped) {
        const entry = byProfile.get(group.pharmacyProfileId) ?? { orders: 0, delivered: 0, cancelled: 0 };
        entry.orders += group._count._all;
        if (group.status === "DELIVERED") entry.delivered += group._count._all;
        if (group.status === "CANCELLED") entry.cancelled += group._count._all;
        byProfile.set(group.pharmacyProfileId, entry);
      }

      return [...byProfile.entries()].slice(0, MAX_EXPORT_ROWS).map(([profileId, entry]) => ({
        pharmacyProfileId: profileId,
        orders: entry.orders,
        delivered: entry.delivered,
        cancelled: entry.cancelled,
        // Left null rather than 0: this report does not compute accept latency,
        // and a zero would read as "instant".
        averageAcceptMinutes: null,
      }));
    },
  },

  service_reliability: {
    label: "Service reliability",
    personalData: false,
    columns: [
      { key: "source", label: "Source" },
      { key: "severity", label: "Severity" },
      { key: "status", label: "Status" },
      { key: "occurrences", label: "Occurrences" },
      { key: "firstSeenAt", label: "First seen at" },
      { key: "lastSeenAt", label: "Last seen at" },
    ],
    count: (from, to) => prisma.integrationAlert.count({ where: { firstSeenAt: { gte: from, lte: to } } }),
    run: async (from, to) => {
      const rows = await prisma.integrationAlert.findMany({
        where: { firstSeenAt: { gte: from, lte: to } },
        select: {
          source: true,
          severity: true,
          status: true,
          occurrences: true,
          firstSeenAt: true,
          lastSeenAt: true,
        },
        orderBy: { firstSeenAt: "asc" },
        take: MAX_EXPORT_ROWS,
      });
      return rows.map((row) => ({
        source: row.source,
        severity: row.severity,
        status: row.status,
        occurrences: row.occurrences,
        firstSeenAt: iso(row.firstSeenAt),
        lastSeenAt: iso(row.lastSeenAt),
      }));
    },
  },

  audit_activity: {
    label: "Audit activity",
    personalData: true,
    columns: [
      { key: "action", label: "Action" },
      { key: "entityType", label: "Entity type" },
      { key: "outcome", label: "Outcome" },
      { key: "actorUserId", label: "Actor user" },
      { key: "hospitalId", label: "Hospital" },
      { key: "createdAt", label: "Recorded at" },
    ],
    count: (from, to) => prisma.auditEvent.count({ where: { createdAt: { gte: from, lte: to } } }),
    run: async (from, to) => {
      const rows = await prisma.auditEvent.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          action: true,
          entityType: true,
          outcome: true,
          actorUserId: true,
          hospitalId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: MAX_EXPORT_ROWS,
      });
      return rows.map((row) => ({
        action: row.action,
        entityType: row.entityType,
        outcome: row.outcome,
        actorUserId: row.actorUserId,
        hospitalId: row.hospitalId,
        createdAt: iso(row.createdAt),
      }));
    },
  },
};

export const REPORT_KEYS = Object.keys(REPORT_SOURCES) as ExportReportKey[];

export function reportLabel(key: string): string {
  return (REPORT_SOURCES as Record<string, ReportDescriptor>)[key]?.label ?? key;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type ReportExportView = {
  id: string;
  reportKey: string;
  reportLabel: string;
  format: string;
  status: ReportExportStatus;
  containsPersonalData: boolean;
  requestedByLabel: string;
  purpose: string | null;
  rowCount: number | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
  expired: boolean;
  /** False when the file can no longer be handed over, whatever the status says. */
  downloadable: boolean;
};

function toExportView(row: ReportExport, purpose: string | null): ReportExportView {
  const expired = row.expiresAt !== null && row.expiresAt.getTime() <= Date.now();
  return {
    id: row.id,
    reportKey: row.reportKey,
    reportLabel: reportLabel(row.reportKey),
    format: row.format,
    status: row.status,
    containsPersonalData: row.containsPersonalData,
    requestedByLabel: row.requestedByLabel,
    purpose,
    rowCount: row.rowCount,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    expiresAt: row.expiresAt,
    expired,
    downloadable: row.status === "READY" && row.fileKey !== null && !expired,
  };
}

function purposeFromFilters(filters: Prisma.JsonValue | null): string | null {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return null;
  const purpose = (filters as Record<string, unknown>).purpose;
  return typeof purpose === "string" ? purpose : null;
}

// ---------------------------------------------------------------------------
// Requesting
// ---------------------------------------------------------------------------

export async function requestReportExport(input: {
  context: PlatformContext;
  data: ExportRequestInput;
}): Promise<PlatformResult<ReportExportView>> {
  const { context, data } = input;
  const source = REPORT_SOURCES[data.reportKey];
  if (!source) return platformFail("report_unknown", "That report is not one this platform produces.");

  // The stricter of the requester's declaration and the catalogue's own answer.
  const carriesPersonalData = data.containsPersonalData || source.personalData;
  if (carriesPersonalData && !context.permissions.has("audit.read")) {
    return platformFail(
      "export_scope_denied",
      "An export that identifies people is limited to accounts that can read the audit trail.",
    );
  }

  const row = await prisma.reportExport.create({
    data: {
      requestedById: context.user.id,
      requestedByLabel: actingOperatorLabel(context),
      reportKey: data.reportKey,
      format: data.format,
      containsPersonalData: carriesPersonalData,
      status: "QUEUED",
      filters: {
        purpose: sanitiseSingleLine(data.purpose, 300),
        from: data.range.from.toISOString(),
        to: data.range.to.toISOString(),
        granularity: data.range.granularity,
        declaredPersonalData: data.containsPersonalData,
      },
      expiresAt: new Date(Date.now() + EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await recordPlatformAction({
    context,
    action: "platform.report_export_requested",
    entityType: "report_export",
    entityId: row.id,
    metadata: {
      reportKey: data.reportKey,
      format: data.format,
      containsPersonalData: carriesPersonalData,
      from: data.range.from.toISOString(),
      to: data.range.to.toISOString(),
    },
  });

  return platformOk(toExportView(row, data.purpose));
}

export async function listReportExports(input: {
  filter: ExportQueueFilterInput;
}): Promise<ReportExportView[]> {
  const { filter } = input;
  const rows = await prisma.reportExport.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.reportKey ? { reportKey: filter.reportKey } : {}),
    },
    orderBy: { createdAt: "desc" },
    skip: (filter.page - 1) * filter.pageSize,
    take: filter.pageSize,
  });
  return rows.map((row) => toExportView(row, purposeFromFilters(row.filters)));
}

// ---------------------------------------------------------------------------
// Generating
// ---------------------------------------------------------------------------

function toCsv(columns: readonly ReportColumn[], rows: ReportRow[]): string {
  const escape = (value: string | number | boolean | null): string => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    // A value that begins with =, +, - or @ is executed by some spreadsheets.
    // Prefixing with a quote keeps a free-text field from becoming a formula.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  const header = columns.map((column) => escape(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => escape(row[column.key] ?? null)).join(","));
  return [header, ...body].join("\r\n");
}

/**
 * Builds the file for a queued export and stores it.
 *
 * Runs synchronously in the request; the reports are bounded and indexed, and a
 * queued row that nobody ever generates would be a worse outcome than a slow
 * request. The row is left `QUEUED` on a recoverable failure so it can be run
 * again, and `FAILED` with the reason when the failure is the data's fault.
 */
export async function generateReportExport(input: {
  context: PlatformContext;
  exportId: string;
}): Promise<PlatformResult<ReportExportView>> {
  const row = await prisma.reportExport.findUnique({ where: { id: input.exportId } });
  if (!row) return platformFail("export_not_found", "That export was not found.");
  if (row.status === "READY") {
    return platformOk(toExportView(row, purposeFromFilters(row.filters)));
  }
  if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
    await prisma.reportExport.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    return platformFail("export_expired", "That export passed its retention date before it was generated.");
  }

  const source = REPORT_SOURCES[row.reportKey as ExportReportKey];
  if (!source) return platformFail("report_unknown", "That report is not one this platform produces.");

  const filters = (row.filters ?? {}) as Record<string, unknown>;
  const from = new Date(String(filters.from));
  const to = new Date(String(filters.to));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    await prisma.reportExport.update({
      where: { id: row.id },
      data: { status: "FAILED", errorMessage: "The stored window is not a valid date range." },
    });
    return platformFail("range_invalid", "The stored window is not a valid date range.");
  }

  const population = await source.count(from, to);
  if (population > MAX_EXPORT_ROWS) {
    const message = `That window holds ${population} rows, above the ${MAX_EXPORT_ROWS}-row export limit. Narrow the range.`;
    await prisma.reportExport.update({
      where: { id: row.id },
      data: { status: "FAILED", errorMessage: message },
    });
    await recordPlatformAction({
      context: input.context,
      action: "platform.report_export_failed",
      entityType: "report_export",
      entityId: row.id,
      outcome: "FAILURE",
      metadata: { reportKey: row.reportKey, population, reason: "row_limit_exceeded" },
    });
    return platformFail("range_invalid", message);
  }

  const reportRows = await source.run(from, to);

  const bytes =
    row.format === "json"
      ? new TextEncoder().encode(JSON.stringify(reportRows, null, 2))
      : new TextEncoder().encode(toCsv(source.columns, reportRows));

  // A random key rather than one derived from the id: the storage key is opaque
  // so a leaked key cannot be walked to a neighbouring export.
  const fileKey = `platform-exports/${row.id}/${randomUUID()}.${row.format}`;
  const stored = await putAiObject({ key: fileKey, bytes, contentType: row.format === "json" ? "application/json" : "text/csv" });
  if (!stored.ok) {
    logOperationalEvent("error", "export.generate_failed", "Report export could not be stored", {
      subject: "platform_exports",
      metadata: { exportId: row.id, reportKey: row.reportKey, storageError: stored.error.kind },
    });
    if (stored.error.kind === "not_configured") {
      await prisma.reportExport.update({
        where: { id: row.id },
        data: { status: "FAILED", errorMessage: "Private file storage is not configured, so no file was produced." },
      });
      await recordPlatformAction({
        context: input.context,
        action: "platform.report_export_failed",
        entityType: "report_export",
        entityId: row.id,
        outcome: "FAILURE",
        metadata: { reportKey: row.reportKey, reason: "storage_not_configured" },
      });
      return platformFail("export_not_ready", "Private file storage is not configured on this deployment, so no file was produced.");
    }
    return platformFail("export_not_ready", "The file could not be stored. The export is still queued and can be retried.");
  }

  const updated = await prisma.reportExport.update({
    where: { id: row.id },
    data: {
      status: "READY",
      rowCount: reportRows.length,
      fileKey: stored.data.key,
      checksum: documentChecksum(bytes),
      completedAt: new Date(),
      errorMessage: null,
    },
  });

  await recordPlatformAction({
    context: input.context,
    action: "platform.report_export_completed",
    entityType: "report_export",
    entityId: row.id,
    metadata: {
      reportKey: row.reportKey,
      format: row.format,
      rowCount: reportRows.length,
      containsPersonalData: row.containsPersonalData,
    },
  });

  return platformOk(toExportView(updated, purposeFromFilters(updated.filters)));
}

// ---------------------------------------------------------------------------
// Downloading
// ---------------------------------------------------------------------------

/**
 * Mints a short-lived link to a generated export.
 *
 * Every condition is re-checked here rather than trusted from the row: the
 * status must be `READY`, a file key must exist and the row must not have
 * expired. A row whose file was already deleted by retention is marked `EXPIRED`
 * on the way through, so the queue stops offering it.
 */
export async function createReportExportLink(input: {
  context: PlatformContext;
  exportId: string;
}): Promise<PlatformResult<{ url: string; expiresAt: Date; fileName: string }>> {
  const row = await prisma.reportExport.findUnique({ where: { id: input.exportId } });
  if (!row) return platformFail("export_not_found", "That export was not found.");
  if (row.status !== "READY" || row.fileKey === null) {
    return platformFail("export_not_ready", "That export has not been generated yet.");
  }
  if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
    await prisma.reportExport.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    return platformFail("export_expired", "That export passed its retention date and its file has been removed.");
  }
  if (row.containsPersonalData && !input.context.permissions.has("audit.read")) {
    return platformFail(
      "export_scope_denied",
      "This export identifies people and is limited to accounts that can read the audit trail.",
    );
  }

  const link = await createAiSignedUrl(row.fileKey, EXPORT_LINK_TTL_SECONDS);
  if (!link.ok) {
    return platformFail(
      link.error.kind === "not_found" ? "export_expired" : "export_not_ready",
      link.error.kind === "not_found"
        ? "That export's file is no longer in storage."
        : "A download link could not be created. Try again.",
    );
  }

  await recordPlatformAction({
    context: input.context,
    action: "platform.report_export_downloaded",
    entityType: "report_export",
    entityId: row.id,
    metadata: { reportKey: row.reportKey, containsPersonalData: row.containsPersonalData },
  });

  const fileName = `${row.reportKey}-${row.createdAt.toISOString().slice(0, 10)}.${row.format}`;
  return platformOk({ url: link.data.url, expiresAt: link.data.expiresAt, fileName });
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export type ExportExpirySummary = { scanned: number; expired: number; filesRemoved: number };

/**
 * Expires exports past their retention date and deletes their files.
 *
 * Called by the maintenance job. The file is deleted before the row is marked,
 * so a deletion that fails leaves the row `READY` and the next run tries again
 * rather than orphaning an object nobody will look for.
 */
export async function expireReportExports(now: Date = new Date()): Promise<ExportExpirySummary> {
  const due = await prisma.reportExport.findMany({
    where: { expiresAt: { lte: now }, status: { in: ["READY", "QUEUED", "FAILED"] } },
    select: { id: true, fileKey: true, reportKey: true },
    take: 200,
  });

  let filesRemoved = 0;
  let expired = 0;

  for (const row of due) {
    if (row.fileKey) {
      const removed = await removeAiObject(row.fileKey);
      if (!removed.ok && removed.error.kind !== "not_found") {
        // Leave the row alone: the next run will try to delete the file again.
        continue;
      }
      filesRemoved += 1;
    }

    await prisma.reportExport.update({
      where: { id: row.id },
      data: { status: "EXPIRED", fileKey: null },
    });
    expired += 1;
  }

  return { scanned: due.length, expired, filesRemoved };
}
