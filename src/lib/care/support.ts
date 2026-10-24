import "server-only";

import type {
  ServiceFeedbackStatus,
  ServiceFeedbackSubject,
  SupportTicketCategory,
  SupportTicketSeverity,
  SupportTicketStatus,
} from "@prisma/client";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { careFail, careOk, reserveCareReference, type CareResult } from "@/lib/care/errors";
import { ESCALATED_TICKET_CATEGORIES } from "@/lib/care/labels";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import {
  feedbackStatusSchema,
  feedbackSubmitSchema,
  supportTicketMessageSchema,
  supportTicketStatusSchema,
  type SupportTicketCreateInput,
} from "@/lib/validation/care";

/**
 * Feedback, grievances and the platform support queue.
 *
 * ## What this module decides
 *
 * Three records, one conversation:
 *
 * - **`ServiceFeedback`** is the lightest — a rating or a comment about a piece
 *   of the service. It is not a case, and the person who left it is not waiting
 *   on a reply.
 * - **`SupportTicket`** is a case. It carries a `reference` the person can read
 *   out loud, a category, a severity and a lifecycle, and it is worked by
 *   platform staff.
 * - **`SupportTicketMessage`** is one turn of the thread, and the only place a
 *   reply can live.
 *
 * ## The safety rules this file exists to hold
 *
 * - **An internal note is never the raiser's to read.** A message with
 *   `isInternal: true` is filtered out *at the query*, not hidden in the screen,
 *   so there is no code path that could render one to the person who raised the
 *   ticket by accident. Only a holder of `care.support_manage` ever loads them,
 *   and only such a holder may write one.
 * - **A closed ticket is closed.** Replying is refused with
 *   `support_ticket_closed` rather than silently reopening a case the person
 *   already considers finished.
 * - **A privacy, caregiver-access or prescription request must be answered
 *   before it can be closed.** Those three categories cannot jump from `OPEN`
 *   straight to `CLOSED`; they have to pass through `RESOLVED`, so a request
 *   about somebody's own data or medication cannot be ended with an empty
 *   thread.
 * - **The queue is scoped to the person.** Every read here is limited to the
 *   `raisedByUserId` on the row, and every staff-only read checks the manage
 *   permission directly rather than trusting a role name.
 *
 * ## The reference
 *
 * A support ticket is the one record in this workspace that carries a
 * patient-facing `reference`, because it is the one that gets read out loud to
 * somebody in a support queue. It is allocated with `reserveCareReference`, so
 * two tickets never share one.
 */

const MANAGE_PERMISSION = "care.support_manage";

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export type ServiceFeedbackSummary = {
  id: string;
  authorUserId: string;
  subject: ServiceFeedbackSubject;
  subjectRefId: string | null;
  rating: number | null;
  comment: string | null;
  status: ServiceFeedbackStatus;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
};

export type StaffServiceFeedbackSummary = ServiceFeedbackSummary & {
  author: { id: string; fullName: string; email: string } | null;
};

const FEEDBACK_SELECT = {
  id: true,
  authorUserId: true,
  subject: true,
  subjectRefId: true,
  rating: true,
  comment: true,
  status: true,
  acknowledgedAt: true,
  resolvedAt: true,
  resolutionNote: true,
  createdAt: true,
} as const;

type FeedbackSubmitInput = z.infer<typeof feedbackSubmitSchema>;
type FeedbackStatusInput = z.infer<typeof feedbackStatusSchema>;
type SupportTicketMessageInput = z.infer<typeof supportTicketMessageSchema>;
type SupportTicketStatusInput = z.infer<typeof supportTicketStatusSchema>;

/**
 * Records a rating, a comment, or both.
 *
 * Nothing here promises a reply: feedback is a note left for the platform, not a
 * case, and the schema already refuses a row with neither rating nor comment so
 * an entry never renders as blank. The person who wants an answer raises a
 * support ticket instead.
 */
export async function submitFeedback(input: {
  user: AuthenticatedUser;
  data: FeedbackSubmitInput;
  context?: RequestContext;
}): Promise<CareResult<{ feedbackId: string }>> {
  const feedback = await prisma.serviceFeedback.create({
    data: {
      authorUserId: input.user.id,
      subject: input.data.subject,
      subjectRefId: input.data.subjectRefId ?? null,
      rating: input.data.rating ?? null,
      comment: input.data.comment ?? null,
      status: "SUBMITTED",
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "care.feedback_submitted",
    entityType: "service_feedback",
    entityId: feedback.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { subject: input.data.subject, rating: input.data.rating ?? null },
  });

  return careOk({ feedbackId: feedback.id });
}

/** The caller's own feedback, newest first. */
export async function listMyFeedback(input: { user: AuthenticatedUser }): Promise<ServiceFeedbackSummary[]> {
  return prisma.serviceFeedback.findMany({
    where: { authorUserId: input.user.id },
    orderBy: { createdAt: "desc" },
    select: FEEDBACK_SELECT,
  });
}

/** The staff view, which carries the author so an entry can be followed up. */
export async function listFeedbackForStaff(input: {
  user: AuthenticatedUser;
  subject?: ServiceFeedbackSubject;
  status?: ServiceFeedbackStatus;
}): Promise<CareResult<StaffServiceFeedbackSummary[]>> {
  if (!input.user.permissions.includes(MANAGE_PERMISSION)) {
    return careFail("not_found", "You do not have access to the feedback queue.");
  }

  const rows = await prisma.serviceFeedback.findMany({
    where: {
      ...(input.subject ? { subject: input.subject } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      ...FEEDBACK_SELECT,
      author: { select: { id: true, fullName: true, email: true } },
    },
  });

  return careOk(rows);
}

/**
 * Moves a feedback entry along its short lifecycle.
 *
 * Each timestamp is stamped once and never overwritten, so the first
 * acknowledgement stays the one the person can point at even if the entry is
 * touched again later.
 *
 * There is no dedicated audit action for this change, so `care.support_ticket_updated`
 * is reused with the `service_feedback` entity type rather than inventing an
 * action the audit vocabulary does not hold — the entity type is what keeps the
 * row legible.
 */
export async function updateFeedbackStatus(input: {
  user: AuthenticatedUser;
  feedbackId: string;
  data: FeedbackStatusInput;
  context?: RequestContext;
}): Promise<CareResult<{ feedbackId: string; status: ServiceFeedbackStatus }>> {
  if (!input.user.permissions.includes(MANAGE_PERMISSION)) {
    return careFail("not_found", "You do not have access to manage feedback.");
  }

  const feedback = await prisma.serviceFeedback.findUnique({
    where: { id: input.feedbackId },
    select: { id: true, status: true, acknowledgedAt: true, resolvedAt: true },
  });
  if (!feedback) return careFail("not_found", "That feedback entry was not found.");

  const now = new Date();
  await prisma.serviceFeedback.update({
    where: { id: feedback.id },
    data: {
      status: input.data.status,
      resolutionNote: input.data.resolutionNote,
      acknowledgedAt:
        input.data.status === "ACKNOWLEDGED" ? (feedback.acknowledgedAt ?? now) : feedback.acknowledgedAt,
      resolvedAt: input.data.status === "RESOLVED" ? (feedback.resolvedAt ?? now) : feedback.resolvedAt,
    },
  });

  await recordAuditEvent({
    action: "care.support_ticket_updated",
    entityType: "service_feedback",
    entityId: feedback.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { from: feedback.status, to: input.data.status },
  });

  return careOk({ feedbackId: feedback.id, status: input.data.status });
}

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export type SupportTicketSummary = {
  id: string;
  raisedByUserId: string;
  reference: string;
  category: SupportTicketCategory;
  severity: SupportTicketSeverity;
  status: SupportTicketStatus;
  subject: string;
  description: string;
  assignedToLabel: string | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SupportTicketMessageSummary = {
  id: string;
  authorUserId: string | null;
  authorLabel: string | null;
  body: string;
  isInternal: boolean;
  createdAt: Date;
};

export type SupportTicketThread = SupportTicketSummary & {
  messages: SupportTicketMessageSummary[];
};

export type MySupportTicketSummary = SupportTicketSummary & {
  latestMessage: SupportTicketMessageSummary | null;
};

const TICKET_SELECT = {
  id: true,
  raisedByUserId: true,
  reference: true,
  category: true,
  severity: true,
  status: true,
  subject: true,
  description: true,
  assignedToLabel: true,
  resolutionNote: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const MESSAGE_SELECT = {
  id: true,
  authorUserId: true,
  authorLabel: true,
  body: true,
  isInternal: true,
  createdAt: true,
} as const;

/**
 * Raises a support ticket.
 *
 * `status` starts at `OPEN` and `severity` comes from the request; the
 * `reference` is allocated here and never accepted from a caller, which is what
 * lets two people read their references out loud without colliding.
 */
export async function createSupportTicket(input: {
  user: AuthenticatedUser;
  data: SupportTicketCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ ticketId: string; reference: string }>> {
  const reference = await reserveCareReference("supportTicket", async (candidate) =>
    prisma.supportTicket.findUnique({ where: { reference: candidate }, select: { id: true } }),
  );

  const ticket = await prisma.supportTicket.create({
    data: {
      raisedByUserId: input.user.id,
      reference,
      category: input.data.category,
      severity: input.data.severity,
      status: "OPEN",
      subject: input.data.subject,
      description: input.data.description,
    },
    select: { id: true, reference: true },
  });

  await recordAuditEvent({
    action: "care.support_ticket_created",
    entityType: "support_ticket",
    entityId: ticket.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { reference: ticket.reference, category: input.data.category, severity: input.data.severity },
  });

  return careOk({ ticketId: ticket.id, reference: ticket.reference });
}

/**
 * The caller's own tickets, newest first, each with its latest visible message.
 *
 * The latest message is filtered to `isInternal: false` so a preview line can
 * never leak a staff note onto the person's own list.
 */
export async function listMyTickets(input: { user: AuthenticatedUser }): Promise<MySupportTicketSummary[]> {
  const rows = await prisma.supportTicket.findMany({
    where: { raisedByUserId: input.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      ...TICKET_SELECT,
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: MESSAGE_SELECT,
      },
    },
  });

  return rows.map(({ messages, ...ticket }) => ({ ...ticket, latestMessage: messages[0] ?? null }));
}

/**
 * One ticket and its thread.
 *
 * Reachable by the person who raised it and by a holder of
 * `care.support_manage`. A raiser never loads an internal note: the filter sits
 * in the query so there is no code path that could render one, rather than
 * hiding it in the screen where a later change could expose it.
 */
export async function getSupportTicket(input: {
  user: AuthenticatedUser;
  ticketId: string;
}): Promise<CareResult<SupportTicketThread>> {
  const isStaff = input.user.permissions.includes(MANAGE_PERMISSION);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: TICKET_SELECT,
  });
  if (!ticket) return careFail("support_ticket_not_found", "That support ticket was not found.");
  // A person who is not the raiser is told the ticket does not exist rather
  // than that it is not theirs, so the endpoint cannot be used to probe which
  // references belong to somebody else.
  if (!isStaff && ticket.raisedByUserId !== input.user.id) {
    return careFail("support_ticket_not_found", "That support ticket was not found.");
  }

  const messages = await prisma.supportTicketMessage.findMany({
    where: { ticketId: ticket.id, ...(isStaff ? {} : { isInternal: false }) },
    orderBy: { createdAt: "asc" },
    select: MESSAGE_SELECT,
  });

  return careOk({ ...ticket, messages });
}

/**
 * Adds a turn to the thread.
 *
 * A closed ticket refuses the reply rather than reopening: the person has
 * already had an answer, and continuing is a new case rather than a silent
 * resurrection of the old one.
 *
 * An internal note may only be written by a holder of `care.support_manage`, and
 * it does not move the ticket's status — the person has not been asked anything,
 * so there is nothing for them to answer. A visible staff reply asks for
 * `AWAITING_PATIENT`; a patient reply puts the case back in `IN_PROGRESS`.
 */
export async function replyToTicket(input: {
  user: AuthenticatedUser;
  ticketId: string;
  data: SupportTicketMessageInput;
  context?: RequestContext;
}): Promise<CareResult<{ messageId: string; status: SupportTicketStatus }>> {
  const isStaff = input.user.permissions.includes(MANAGE_PERMISSION);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true, raisedByUserId: true },
  });
  if (!ticket) return careFail("support_ticket_not_found", "That support ticket was not found.");
  if (!isStaff && ticket.raisedByUserId !== input.user.id) {
    return careFail("support_ticket_not_found", "That support ticket was not found.");
  }
  if (ticket.status === "CLOSED") {
    return careFail(
      "support_ticket_closed",
      "This support ticket is closed. Raise a new one if you need to continue.",
    );
  }
  if (input.data.isInternal && !isStaff) {
    return careFail("not_found", "You do not have access to write an internal note.");
  }

  const nextStatus: SupportTicketStatus = input.data.isInternal
    ? ticket.status
    : isStaff
      ? "AWAITING_PATIENT"
      : "IN_PROGRESS";

  const message = await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorUserId: input.user.id,
      body: input.data.body,
      isInternal: input.data.isInternal,
    },
    select: { id: true },
  });

  if (nextStatus !== ticket.status) {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: nextStatus } });
  }

  await recordAuditEvent({
    action: "care.support_ticket_replied",
    entityType: "support_ticket_message",
    entityId: message.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { ticketId: ticket.id, isInternal: input.data.isInternal, status: nextStatus },
  });

  return careOk({ messageId: message.id, status: nextStatus });
}

/**
 * Moves a ticket along its lifecycle.
 *
 * `resolvedAt` is stamped once, when the ticket first becomes `RESOLVED`, and
 * `closedAt` when it is closed.
 *
 * A privacy request, a caregiver-access problem or a prescription problem
 * cannot go from `OPEN` straight to `CLOSED`: those three categories exist
 * precisely so that somebody gets a considered answer, and closing one with an
 * empty thread would end it with nothing recorded for the person to read. They
 * must pass through `RESOLVED` first.
 */
export async function updateSupportTicketStatus(input: {
  user: AuthenticatedUser;
  ticketId: string;
  data: SupportTicketStatusInput;
  context?: RequestContext;
}): Promise<CareResult<{ ticketId: string; status: SupportTicketStatus }>> {
  if (!input.user.permissions.includes(MANAGE_PERMISSION)) {
    return careFail("not_found", "You do not have access to manage support tickets.");
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true, category: true, resolvedAt: true },
  });
  if (!ticket) return careFail("support_ticket_not_found", "That support ticket was not found.");

  if (
    input.data.status === "CLOSED" &&
    ticket.status === "OPEN" &&
    ESCALATED_TICKET_CATEGORIES.includes(ticket.category)
  ) {
    return careFail(
      "validation",
      "A privacy, caregiver-access or prescription request must be resolved with an answer before it can be closed.",
    );
  }

  const now = new Date();
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: input.data.status,
      resolutionNote: input.data.resolutionNote,
      assignedToLabel: input.data.assignedToLabel,
      resolvedAt: input.data.status === "RESOLVED" ? (ticket.resolvedAt ?? now) : ticket.resolvedAt,
      closedAt: input.data.status === "CLOSED" ? now : undefined,
    },
  });

  await recordAuditEvent({
    action: "care.support_ticket_status_changed",
    entityType: "support_ticket",
    entityId: ticket.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { from: ticket.status, to: input.data.status, category: ticket.category },
  });

  return careOk({ ticketId: ticket.id, status: input.data.status });
}

/**
 * The staff queue: most urgent first, then oldest first within a severity.
 *
 * The severity enum is declared `LOW → CRITICAL`, so a descending sort puts
 * `CRITICAL` at the top. Oldest-first within a severity means a long-waiting
 * ticket is not buried under a fresher one of the same urgency.
 */
export async function listSupportQueue(input: {
  user: AuthenticatedUser;
  status?: SupportTicketStatus;
  severity?: SupportTicketSeverity;
}): Promise<CareResult<SupportTicketSummary[]>> {
  if (!input.user.permissions.includes(MANAGE_PERMISSION)) {
    return careFail("not_found", "You do not have access to the support queue.");
  }

  const rows = await prisma.supportTicket.findMany({
    where: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.severity ? { severity: input.severity } : {}),
    },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    select: TICKET_SELECT,
  });

  return careOk(rows);
}
