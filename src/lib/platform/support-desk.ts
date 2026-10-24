import "server-only";

import type { AbuseReportStatus, ComplaintSeverity, ComplaintStatus, FeedbackCategory, RefundStatus } from "@prisma/client";

import { listSupportQueue, updateSupportTicketStatus } from "@/lib/care/support";
import { prisma } from "@/lib/db/prisma";
import { actingOperatorLabel, recordPlatformAction, type PlatformContext } from "@/lib/platform/console";
import { platformFail, platformOk, reservePlatformReference, type PlatformResult } from "@/lib/platform/errors";
import { decideRefund } from "@/lib/pharmacy/payments";
import type {
  AbuseReportCreateInput,
  AbuseReportDecisionInput,
  AbuseReportFilterInput,
  ComplaintFilterInput,
  ComplaintUpdateInput,
  RefundFilterInput,
  RefundDecisionInput,
  SupportTicketFilterInput,
  SupportTicketReplyInput,
  SupportTicketUpdateInput,
} from "@/lib/validation/platform";
import { replyToTicket } from "@/lib/care/support";

/**
 * The support, trust and money desks.
 *
 * Four queues live here, and they are kept apart on purpose:
 *
 * - **A support ticket** is a request for help. It ends when the person is
 *   helped. It is worked by support agents.
 * - **A grievance** is a `Complaint` a hospital is carrying, escalated to the
 *   platform. It is the hospital's record that the platform is reviewing, not
 *   the platform's record that the hospital owns — so nothing here rewrites the
 *   hospital's own resolution, it adds the platform's view alongside it.
 * - **An abuse report** is an allegation against somebody and ends with an
 *   enforcement decision a named operator is accountable for.
 * - **A refund** is money. The platform oversees it; the payment provider settles
 *   it, and only the provider's answer may say money moved.
 *
 * ## What this module refuses to do
 *
 * 1. **It does not claim a refund was processed.** Approving a refund hands the
 *    instruction to `decideRefund`, which records `PROCESSING` until the gateway
 *    confirms settlement. A console operator cannot type "PROCESSED".
 * 2. **It does not close an abuse report without a written decision.** An
 *    allegation that ends silently is indistinguishable from one that was
 *    ignored.
 * 3. **It does not read internal notes to the wrong reader.** Internal support
 *    notes stay behind `care.support_manage`, which only the support role holds.
 */

// ---------------------------------------------------------------------------
// Support tickets — delegated to the Phase 10 queue, which already holds the rules
// ---------------------------------------------------------------------------

/**
 * The platform support desk's view of the ticket queue.
 *
 * The Phase 10 service already owns the two rules that matter — a closed ticket
 * refuses a reply, and a privacy, caregiver-access or prescription ticket cannot
 * be closed without being resolved first — and it already checks
 * `care.support_manage`, which every `SUPPORT_AGENT` holds. Re-implementing the
 * queue here would be a second, weaker copy of those rules, so this delegates.
 */
export async function listPlatformSupportQueue(input: {
  context: PlatformContext;
  filter: SupportTicketFilterInput;
}) {
  return listSupportQueue({
    user: input.context.user,
    status: input.filter.status,
    severity: input.filter.severity,
  });
}

export async function updatePlatformSupportTicket(input: {
  context: PlatformContext;
  data: SupportTicketUpdateInput;
}) {
  const result = await updateSupportTicketStatus({
    user: input.context.user,
    ticketId: input.data.ticketId,
    data: {
      status: input.data.status ?? "OPEN",
      assignedToLabel: input.data.assignedToLabel,
      resolutionNote: input.data.resolutionNote,
    },
  });

  if (result.ok) {
    await recordPlatformAction({
      context: input.context,
      action: "platform.support_ticket_updated",
      entityType: "support_ticket",
      entityId: input.data.ticketId,
      metadata: { status: input.data.status ?? null, severity: input.data.severity ?? null },
    });
  }
  return result;
}

export async function replyToPlatformSupportTicket(input: {
  context: PlatformContext;
  data: SupportTicketReplyInput;
}) {
  const result = await replyToTicket({
    user: input.context.user,
    ticketId: input.data.ticketId,
    data: { body: input.data.body, isInternal: input.data.isInternal },
  });

  if (result.ok) {
    await recordPlatformAction({
      context: input.context,
      action: "platform.support_ticket_replied",
      entityType: "support_ticket_message",
      entityId: result.data.messageId,
      metadata: { ticketId: input.data.ticketId, isInternal: input.data.isInternal },
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Grievances (hospital complaints escalated to the platform)
// ---------------------------------------------------------------------------

export type GrievanceQueueItem = {
  id: string;
  reference: string;
  hospitalId: string;
  hospitalName: string;
  category: FeedbackCategory;
  severity: ComplaintSeverity;
  subject: string;
  description: string | null;
  status: ComplaintStatus;
  raisedByName: string | null;
  assignedToLabel: string | null;
  resolutionNotes: string | null;
  isDemo: boolean;
  openedForDays: number;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Grievances across every hospital, most severe first and oldest first within a
 * severity.
 *
 * `isDemo` is surfaced rather than filtered out. A demonstration complaint is
 * not evidence of anything, and a queue that hid it would let a synthetic row be
 * counted as a real grievance by whoever reads the screen next.
 *
 * `openedForDays` is computed here from `createdAt` and the current time, so the
 * number on the screen is derived from the row rather than from a stored field
 * that could go stale.
 */
export async function listGrievances(input: {
  context: PlatformContext;
  filter: ComplaintFilterInput;
}): Promise<PlatformResult<{ items: GrievanceQueueItem[]; total: number }>> {
  const { filter } = input;

  const where = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.severity ? { severity: filter.severity } : {}),
    ...(filter.hospitalId ? { hospitalId: filter.hospitalId } : {}),
    ...(filter.query
      ? {
          OR: [
            { subject: { contains: filter.query, mode: "insensitive" as const } },
            { reference: { contains: filter.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.complaint.findMany({
      where,
      orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        reference: true,
        hospitalId: true,
        category: true,
        severity: true,
        subject: true,
        description: true,
        status: true,
        raisedByName: true,
        resolutionNotes: true,
        isDemo: true,
        escalatedAt: true,
        resolvedAt: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        hospital: { select: { name: true } },
      },
    }),
    prisma.complaint.count({ where }),
  ]);

  const now = Date.now();
  return platformOk({
    items: rows.map((row) => ({
      ...row,
      hospitalName: row.hospital.name,
      assignedToLabel: null,
      openedForDays: Math.max(0, Math.floor((now - row.createdAt.getTime()) / 86_400_000)),
    })),
    total,
  });
}

/**
 * Moves a grievance along, and records what the platform said about it.
 *
 * The update is written as a `ComplaintUpdate` row rather than only as a change
 * to the complaint, so the hospital reading its own complaint can see that the
 * platform intervened and why — a status change with no accompanying note would
 * look to them like their own record was edited from outside.
 */
export async function updateGrievance(input: {
  context: PlatformContext;
  data: ComplaintUpdateInput;
}): Promise<PlatformResult<{ complaintId: string; status: ComplaintStatus }>> {
  const { context, data } = input;

  if ((data.status === "RESOLVED" || data.status === "CLOSED") && (data.resolutionNotes ?? "").trim().length < 10) {
    return platformFail("validation", "Resolving or closing a grievance needs a resolution note.");
  }

  const complaint = await prisma.complaint.findUnique({
    where: { id: data.complaintId },
    select: { id: true, status: true, severity: true, hospitalId: true, resolvedAt: true, escalatedAt: true },
  });
  if (!complaint) return platformFail("complaint_not_found", "That grievance was not found.");

  const now = new Date();
  const label = actingOperatorLabel(context);

  await prisma.$transaction(async (tx) => {
    await tx.complaint.update({
      where: { id: complaint.id },
      data: {
        status: data.status ?? undefined,
        severity: data.severity ?? undefined,
        resolutionNotes: data.resolutionNotes ?? undefined,
        resolvedAt:
          data.status === "RESOLVED" ? (complaint.resolvedAt ?? now) : complaint.resolvedAt,
        escalatedAt:
          data.status === "ESCALATED" ? (complaint.escalatedAt ?? now) : complaint.escalatedAt,
        closedAt: data.status === "CLOSED" ? now : undefined,
      },
    });

    await tx.complaintUpdate.create({
      data: {
        complaintId: complaint.id,
        authorMemberId: null,
        authorLabel: `ORVEXA platform · ${label}`,
        status: data.status ?? null,
        note: data.note ?? data.resolutionNotes ?? null,
      },
    });
  });

  await recordPlatformAction({
    context,
    action: "platform.grievance_updated",
    entityType: "complaint",
    entityId: complaint.id,
    // The hospital is recorded on the audit row so that hospital's administrator
    // can find the platform's intervention in their own trail.
    metadata: {
      previousStatus: complaint.status,
      status: data.status ?? null,
      severity: data.severity ?? null,
    },
  });

  return platformOk({ complaintId: complaint.id, status: data.status ?? complaint.status });
}

// ---------------------------------------------------------------------------
// Abuse reports
// ---------------------------------------------------------------------------

export type AbuseReportQueueItem = {
  id: string;
  reference: string;
  category: string;
  severity: ComplaintSeverity;
  status: AbuseReportStatus;
  subjectKind: string;
  subjectId: string | null;
  subjectLabel: string | null;
  summary: string;
  detail: string | null;
  evidenceCount: number;
  reporterLabel: string | null;
  assignedToLabel: string | null;
  resolutionNotes: string | null;
  decidedByLabel: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listAbuseReports(input: {
  context: PlatformContext;
  filter: AbuseReportFilterInput;
}): Promise<PlatformResult<{ items: AbuseReportQueueItem[]; total: number }>> {
  const { filter } = input;

  const where = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.severity ? { severity: filter.severity } : {}),
    ...(filter.query
      ? {
          OR: [
            { summary: { contains: filter.query, mode: "insensitive" as const } },
            { reference: { contains: filter.query, mode: "insensitive" as const } },
            { subjectLabel: { contains: filter.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.abuseReport.findMany({
      where,
      orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        reference: true,
        category: true,
        severity: true,
        status: true,
        subjectKind: true,
        subjectId: true,
        subjectLabel: true,
        summary: true,
        detail: true,
        evidenceKeys: true,
        reporterLabel: true,
        assignedToLabel: true,
        resolutionNotes: true,
        decidedAt: true,
        createdAt: true,
        updatedAt: true,
        decidedBy: { select: { fullName: true } },
      },
    }),
    prisma.abuseReport.count({ where }),
  ]);

  return platformOk({
    items: rows.map(({ evidenceKeys, decidedBy, ...row }) => ({
      ...row,
      evidenceCount: evidenceKeys.length,
      decidedByLabel: decidedBy?.fullName ?? null,
    })),
    total,
  });
}

/**
 * Records an abuse report.
 *
 * The reference is allocated here, never accepted from a caller, so one report's
 * reference can never be used to overwrite another's. When the reporter is signed
 * in their account is recorded; `reporterLabel` is only a display fallback for a
 * report taken over the phone, and is never used to resolve an identity.
 */
export async function createAbuseReport(input: {
  context: PlatformContext;
  data: AbuseReportCreateInput;
}): Promise<PlatformResult<{ reportId: string; reference: string }>> {
  const { context, data } = input;

  const reference = await reservePlatformReference("abuseReport", (candidate) =>
    prisma.abuseReport.findUnique({ where: { reference: candidate }, select: { id: true } }),
  );

  const report = await prisma.abuseReport.create({
    data: {
      reference,
      reporterUserId: context.user.id,
      reporterLabel: data.reporterLabel ?? actingOperatorLabel(context),
      subjectKind: data.subjectKind,
      subjectId: data.subjectId ?? null,
      subjectLabel: data.subjectLabel ?? null,
      category: data.category,
      severity: data.severity,
      summary: data.summary,
      detail: data.detail ?? null,
      evidenceKeys: data.evidenceKeys,
      status: "OPEN",
    },
    select: { id: true, reference: true },
  });

  await recordPlatformAction({
    context,
    action: "platform.abuse_report_created",
    entityType: "abuse_report",
    entityId: report.id,
    metadata: { reference: report.reference, category: data.category, severity: data.severity, subjectKind: data.subjectKind },
  });

  return platformOk({ reportId: report.id, reference: report.reference });
}

/**
 * Records the enforcement decision on an abuse report.
 *
 * `ACTIONED` and `DISMISSED` are terminal, and both require written reasoning —
 * the schema enforces it and so does this. The deciding operator's name is
 * stamped so the allegation has an owner, and the report is never deleted: an
 * abuse report is the evidence that a complaint was taken seriously.
 */
export async function decideAbuseReport(input: {
  context: PlatformContext;
  data: AbuseReportDecisionInput;
}): Promise<PlatformResult<{ reportId: string; status: AbuseReportStatus }>> {
  const { context, data } = input;

  const terminal = data.decision === "ACTIONED" || data.decision === "DISMISSED";
  if (terminal && (data.resolutionNotes ?? "").trim().length < 10) {
    return platformFail("validation", "Closing a report needs a written decision of at least 10 characters.");
  }

  const report = await prisma.abuseReport.findUnique({
    where: { id: data.reportId },
    select: { id: true, status: true, severity: true, category: true },
  });
  if (!report) return platformFail("abuse_report_not_found", "That abuse report was not found.");
  if (report.status === "ACTIONED" || report.status === "DISMISSED") {
    return platformFail("abuse_report_already_closed", "That report has already been closed.");
  }

  const now = new Date();
  await prisma.abuseReport.update({
    where: { id: report.id },
    data: {
      status: data.decision,
      assignedToLabel: data.assignedToLabel ?? undefined,
      resolutionNotes: data.resolutionNotes ?? undefined,
      decidedById: terminal ? context.user.id : undefined,
      decidedAt: terminal ? now : undefined,
    },
  });

  await recordPlatformAction({
    context,
    action: "platform.abuse_report_decided",
    entityType: "abuse_report",
    entityId: report.id,
    metadata: {
      decision: data.decision,
      previousStatus: report.status,
      category: report.category,
      severity: report.severity,
      assigned: Boolean(data.assignedToLabel),
    },
  });

  return platformOk({ reportId: report.id, status: data.decision });
}

// ---------------------------------------------------------------------------
// Refunds — oversight only; the provider settles, and only it may say so
// ---------------------------------------------------------------------------

export type RefundQueueItem = {
  id: string;
  orderId: string;
  orderReference: string | null;
  amountPaise: number;
  reason: string;
  status: RefundStatus;
  requestedByLabel: string | null;
  approvedByLabel: string | null;
  failureReason: string | null;
  isSandbox: boolean;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The refund queue.
 *
 * `isSandbox` is carried into the view rather than hidden: a sandbox refund is
 * not a real movement of money, and a console that showed one identically to a
 * live refund would invite an operator to report settlement that never happened.
 */
export async function listRefunds(input: {
  context: PlatformContext;
  filter: RefundFilterInput;
}): Promise<PlatformResult<{ items: RefundQueueItem[]; total: number }>> {
  const { filter } = input;

  const where = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.query
      ? {
          OR: [
            { reason: { contains: filter.query, mode: "insensitive" as const } },
            { order: { reference: { contains: filter.query, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.pharmacyRefund.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        orderId: true,
        amountPaise: true,
        reason: true,
        status: true,
        requestedByLabel: true,
        approvedByLabel: true,
        failureReason: true,
        isSandbox: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
        order: { select: { reference: true } },
      },
    }),
    prisma.pharmacyRefund.count({ where }),
  ]);

  return platformOk({
    items: rows.map(({ order, ...row }) => ({ ...row, orderReference: order.reference })),
    total,
  });
}

/**
 * Approves a refund for settlement, or declines it.
 *
 * The approval path calls the Phase 6 settlement code rather than writing a
 * status directly. That code records `PROCESSING` when the gateway accepts the
 * instruction and `PROCESSED` only when the gateway confirms it — so the console
 * cannot produce a refund that claims to have settled when it has not. This
 * function's own audit row records the platform's decision; the settlement
 * code's row records what the provider did.
 */
export async function decidePlatformRefund(input: {
  context: PlatformContext;
  data: RefundDecisionInput;
}): Promise<PlatformResult<{ refundId: string; status: RefundStatus }>> {
  const { context, data } = input;

  const refund = await prisma.pharmacyRefund.findUnique({
    where: { id: data.refundId },
    select: { id: true, orderId: true, status: true, amountPaise: true, isSandbox: true },
  });
  if (!refund) return platformFail("refund_not_found", "That refund was not found.");
  if (refund.status === "PROCESSED") {
    return platformFail("refund_not_settleable", "That refund has already settled and cannot be changed.");
  }
  if (refund.status === "CANCELLED" && data.status === "PROCESSING") {
    return platformFail("refund_not_settleable", "That refund was cancelled. Raise a new one instead.");
  }

  const result = await decideRefund({
    actor: { userId: context.user.id, role: "PLATFORM_ADMIN", label: actingOperatorLabel(context) },
    refundId: refund.id,
    approve: data.status === "PROCESSING",
    note: data.notes,
  });

  if (!result.ok) {
    return platformFail("refund_not_settleable", result.message);
  }

  // Read back what the settlement code actually persisted. Its return type is a
  // plain string, and the value the console reports to an operator has to be the
  // state on the row, not a value a caller passed in.
  const settled = await prisma.pharmacyRefund.findUnique({
    where: { id: refund.id },
    select: { status: true },
  });
  if (!settled) {
    return platformFail("refund_not_found", "That refund was not found.");
  }

  await recordPlatformAction({
    context,
    action: "platform.refund_decided",
    entityType: "pharmacy_refund",
    entityId: refund.id,
    metadata: {
      orderId: refund.orderId,
      amountPaise: refund.amountPaise,
      decision: data.status,
      settledByProvider: settled.status === "PROCESSING",
      isSandbox: refund.isSandbox,
    },
  });

  return platformOk({ refundId: refund.id, status: settled.status });
}
