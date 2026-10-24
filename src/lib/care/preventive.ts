import "server-only";

import {
  Prisma,
  type CareProgramKind,
  type CareProgramStatus,
  type PreventiveCareKind,
  type PreventiveCareStatus,
  type ReminderKind,
} from "@prisma/client";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { requireScope, resolveCareSubject } from "@/lib/care/access";
import { careFail, careOk, type CareResult } from "@/lib/care/errors";
import { createReminder } from "@/lib/care/reminders";
import { buildReminderDedupeKey } from "@/lib/care/scheduling";
import { appendTimelineEvent } from "@/lib/care/timeline";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import {
  careProgramUpdateSchema,
  preventivePlanUpdateSchema,
  type CareProgramEnrollInput,
  type PreventivePlanCreateInput,
} from "@/lib/validation/care";

type PreventivePlanUpdateInput = z.infer<typeof preventivePlanUpdateSchema>;
type CareProgramUpdateInput = z.infer<typeof careProgramUpdateSchema>;

/**
 * Preventive care plans and care programmes.
 *
 * ## What a preventive plan is, and is not
 *
 * A `PreventiveCarePlan` is a restatement of guidance that is attributable to a
 * named source — a national immunisation schedule, a clinician's advice at a
 * visit. It is *not* ORVEXA's own advice, which is why `guidanceSourceLabel` is
 * required and is carried through exactly as the person entered it, never
 * defaulted and never rewritten here. ORVEXA does not tell anybody that they
 * should be screened, or that they should not; it keeps a plan against a source
 * and can remind them of it.
 *
 * ## What this file coordinates
 *
 * This module owns the plans and programmes themselves. Two things it delegates
 * rather than re-implements:
 *
 * - **Reminders.** A preventive plan can be turned into a reminder, and that is
 *   done by calling `createReminder` so the plan's reminder behaves exactly like
 *   any other — same scheduling, same quiet hours, same dispatch trail.
 * - **The timeline.** Enrolling in a programme and ending one are events on the
 *   person's record, so each appends a `HealthTimelineEvent` through
 *   `appendTimelineEvent`.
 */

// ---------------------------------------------------------------------------
// Preventive plans
// ---------------------------------------------------------------------------

export type PreventivePlanSummary = {
  id: string;
  familyMemberId: string | null;
  kind: PreventiveCareKind;
  status: PreventiveCareStatus;
  title: string;
  guidanceSourceLabel: string;
  guidanceNote: string | null;
  dueOn: Date | null;
  completedOn: Date | null;
  completedRefType: string | null;
  completedRefId: string | null;
  reminderId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const PLAN_SELECT = {
  id: true,
  familyMemberId: true,
  kind: true,
  status: true,
  title: true,
  guidanceSourceLabel: true,
  guidanceNote: true,
  dueOn: true,
  completedOn: true,
  completedRefType: true,
  completedRefId: true,
  reminderId: true,
  createdAt: true,
  updatedAt: true,
} as const;

type PlanRow = {
  id: string;
  ownerUserId: string;
  familyMemberId: string | null;
  kind: PreventiveCareKind;
  status: PreventiveCareStatus;
  title: string;
  guidanceSourceLabel: string;
  guidanceNote: string | null;
  dueOn: Date | null;
  reminderId: string | null;
};

/** Loads a plan and confirms the acting user may manage it. */
async function loadWritablePlan(user: AuthenticatedUser, planId: string): Promise<CareResult<PlanRow>> {
  const plan = await prisma.preventiveCarePlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      ownerUserId: true,
      familyMemberId: true,
      kind: true,
      status: true,
      title: true,
      guidanceSourceLabel: true,
      guidanceNote: true,
      dueOn: true,
      reminderId: true,
    },
  });
  if (!plan) return careFail("not_found", "That preventive plan was not found.");

  const subject = await resolveCareSubject({
    viewerUserId: user.id,
    ownerUserId: plan.ownerUserId,
    familyMemberId: plan.familyMemberId,
  });
  if (!subject.ok) return subject;

  const scoped = requireScope(subject.data, "MANAGE_REMINDERS");
  if (!scoped.ok) return scoped;

  return careOk(plan);
}

/**
 * The plans for one subject, soonest due first.
 *
 * Plans without a `dueOn` sort last, because a plan with no date has no claim on
 * the person's attention yet.
 */
export async function listPreventivePlans(input: {
  user: AuthenticatedUser;
  ownerUserId?: string;
  familyMemberId?: string;
  status?: PreventiveCareStatus;
}): Promise<CareResult<PreventivePlanSummary[]>> {
  const subject = await resolveCareSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.ownerUserId ?? null,
    familyMemberId: input.familyMemberId ?? null,
  });
  if (!subject.ok) return subject;

  const scoped = requireScope(subject.data, "VIEW_RECORDS");
  if (!scoped.ok) return scoped;

  return careOk(
    await prisma.preventiveCarePlan.findMany({
      where: {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      select: PLAN_SELECT,
    }),
  );
}

/**
 * Records a plan.
 *
 * `guidanceSourceLabel` is required by the schema and is stored exactly as given.
 * A plan without an attributable source would be ORVEXA issuing screening
 * advice, which it does not do, so there is no default here to fall back on.
 */
export async function createPreventivePlan(input: {
  user: AuthenticatedUser;
  data: PreventivePlanCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ planId: string }>> {
  const { user, data } = input;

  const subject = await resolveCareSubject({
    viewerUserId: user.id,
    ownerUserId: data.ownerUserId ?? null,
    familyMemberId: data.familyMemberId ?? null,
  });
  if (!subject.ok) return subject;

  const scoped = requireScope(subject.data, "MANAGE_REMINDERS");
  if (!scoped.ok) return scoped;

  const plan = await prisma.preventiveCarePlan.create({
    data: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      kind: data.kind,
      status: "PLANNED",
      title: data.title,
      guidanceSourceLabel: data.guidanceSourceLabel,
      guidanceNote: data.guidanceNote ?? null,
      dueOn: data.dueOn ?? null,
      createdById: user.id,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "care.preventive_plan_created",
    entityType: "preventive_care_plan",
    entityId: plan.id,
    actorUserId: user.id,
    context: input.context,
    metadata: { kind: data.kind, guidanceSourceLabel: data.guidanceSourceLabel },
  });

  return careOk({ planId: plan.id });
}

/**
 * Edits the descriptive fields of a plan.
 *
 * Lifecycle status is not changed here; a status move goes through
 * `changePreventivePlanStatus`, which is the single place `completedOn` is set
 * or cleared, so the two can never disagree.
 */
export async function updatePreventivePlan(input: {
  user: AuthenticatedUser;
  planId: string;
  data: PreventivePlanUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ planId: string }>> {
  const loaded = await loadWritablePlan(input.user, input.planId);
  if (!loaded.ok) return loaded;
  const plan = loaded.data;
  const { data } = input;

  await prisma.preventiveCarePlan.update({
    where: { id: plan.id },
    data: {
      kind: data.kind,
      title: data.title,
      guidanceSourceLabel: data.guidanceSourceLabel,
      guidanceNote: data.guidanceNote,
      dueOn: data.dueOn,
    },
  });

  await recordAuditEvent({
    action: "care.record_written",
    entityType: "preventive_care_plan",
    entityId: plan.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      fields: Object.keys(data).filter((key) => data[key as keyof typeof data] !== undefined),
    },
  });

  return careOk({ planId: plan.id });
}

/** When a plan is completed it carries the date; otherwise it does not. */
function completionFieldsFor(
  status: PreventiveCareStatus,
  completedRefType?: string | null,
  completedRefId?: string | null,
): { completedOn: Date | null; completedRefType: string | null; completedRefId: string | null } {
  if (status === "COMPLETED") {
    return {
      completedOn: new Date(),
      completedRefType: completedRefType ?? null,
      completedRefId: completedRefId ?? null,
    };
  }
  return { completedOn: null, completedRefType: null, completedRefId: null };
}

/**
 * Moves a plan's lifecycle status.
 *
 * `completedOn` is set when the plan becomes `COMPLETED` and cleared for every
 * other status, including a move back out of `COMPLETED`. A plan that is no
 * longer done must not still look done.
 */
export async function changePreventivePlanStatus(input: {
  user: AuthenticatedUser;
  planId: string;
  status: PreventiveCareStatus;
  completedRefType?: string;
  completedRefId?: string;
  context?: RequestContext;
}): Promise<CareResult<{ planId: string; status: PreventiveCareStatus }>> {
  const loaded = await loadWritablePlan(input.user, input.planId);
  if (!loaded.ok) return loaded;
  const plan = loaded.data;

  await prisma.preventiveCarePlan.update({
    where: { id: plan.id },
    data: { status: input.status, ...completionFieldsFor(input.status, input.completedRefType, input.completedRefId) },
  });

  await recordAuditEvent({
    action: "care.preventive_plan_status_changed",
    entityType: "preventive_care_plan",
    entityId: plan.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { from: plan.status, to: input.status },
  });

  return careOk({ planId: plan.id, status: input.status });
}

/**
 * Marks plans that have come due, and then plans that have been overdue too long.
 *
 * A job, with no acting user. `PLANNED` plans whose `dueOn` has passed become
 * `DUE`; `DUE` plans more than thirty days past due become `OVERDUE`. It runs in
 * that order, so a plan that was created long ago and never revisited catches up
 * in a single sweep. Each change is audited, because a plan silently changing
 * status is the sort of thing a person should be able to explain afterwards.
 */
export async function refreshPreventivePlanStatuses(
  options: { now?: Date } = {},
): Promise<{ markedDue: number; markedOverdue: number }> {
  const now = options.now ?? new Date();
  const overdueCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const plannedToDue = await prisma.preventiveCarePlan.findMany({
    where: { status: "PLANNED", dueOn: { not: null, lte: now } },
    select: { id: true },
  });
  if (plannedToDue.length > 0) {
    await prisma.preventiveCarePlan.updateMany({
      where: { id: { in: plannedToDue.map((row) => row.id) } },
      data: { status: "DUE" },
    });
    for (const row of plannedToDue) {
      await recordAuditEvent({
        action: "care.preventive_plan_status_changed",
        entityType: "preventive_care_plan",
        entityId: row.id,
        actorUserId: null,
        metadata: { from: "PLANNED", to: "DUE" },
      });
    }
  }

  const dueToOverdue = await prisma.preventiveCarePlan.findMany({
    where: { status: "DUE", dueOn: { not: null, lte: overdueCutoff } },
    select: { id: true },
  });
  if (dueToOverdue.length > 0) {
    await prisma.preventiveCarePlan.updateMany({
      where: { id: { in: dueToOverdue.map((row) => row.id) } },
      data: { status: "OVERDUE" },
    });
    for (const row of dueToOverdue) {
      await recordAuditEvent({
        action: "care.preventive_plan_status_changed",
        entityType: "preventive_care_plan",
        entityId: row.id,
        actorUserId: null,
        metadata: { from: "DUE", to: "OVERDUE" },
      });
    }
  }

  return { markedDue: plannedToDue.length, markedOverdue: dueToOverdue.length };
}

/** The reminder kind a plan of this kind produces. */
function reminderKindForPlan(kind: PreventiveCareKind): ReminderKind {
  if (kind === "VACCINATION") return "VACCINATION";
  if (kind === "SCREENING") return "SCREENING";
  return "PREVENTIVE_CHECKUP";
}

async function defaultLeadMinutesFor(ownerUserId: string): Promise<number> {
  const preference = await prisma.reminderPreference.findUnique({
    where: { userId: ownerUserId },
    select: { defaultLeadMinutes: true },
  });
  return preference?.defaultLeadMinutes ?? 15;
}

/**
 * Turns a plan into a reminder and links the two.
 *
 * The reminder is created through `createReminder`, so it is an ordinary reminder
 * in every respect. The `dedupeKey` is derived from the plan's id, and the
 * reminder table is unique on `(ownerUserId, dedupeKey)` — which is why running
 * this twice cannot produce a second reminder. A second run finds the existing
 * reminder (the `duplicate` outcome carries the key) and re-links it, so the plan
 * always points at exactly one reminder.
 */
export async function planReminderForPreventivePlan(input: {
  user: AuthenticatedUser;
  planId: string;
  leadMinutes?: number;
  context?: RequestContext;
}): Promise<CareResult<{ planId: string; reminderId: string }>> {
  const loaded = await loadWritablePlan(input.user, input.planId);
  if (!loaded.ok) return loaded;
  const plan = loaded.data;

  const reminderKind = reminderKindForPlan(plan.kind);
  const dueAt = plan.dueOn ?? new Date();
  const leadMinutes = input.leadMinutes ?? (await defaultLeadMinutesFor(plan.ownerUserId));
  const startAt = new Date(dueAt.getTime() - leadMinutes * 60_000);

  const created = await createReminder({
    user: input.user,
    context: input.context,
    data: {
      ownerUserId: plan.ownerUserId,
      familyMemberId: plan.familyMemberId ?? undefined,
      kind: reminderKind,
      title: plan.title,
      notes: plan.guidanceNote ?? undefined,
      scheduleKind: "ONE_OFF",
      startAt,
      dedupeKey: plan.id,
    },
  });

  let reminderId: string;
  if (created.ok) {
    reminderId = created.data.reminderId;
  } else if (created.code === "duplicate") {
    // The reminder already exists from an earlier run; re-link to it instead of
    // creating a second one.
    const dedupeKey = buildReminderDedupeKey({
      kind: reminderKind,
      familyMemberId: plan.familyMemberId,
      label: plan.id,
    });
    const existing = await prisma.reminder.findFirst({
      where: { ownerUserId: plan.ownerUserId, dedupeKey },
      select: { id: true },
    });
    if (!existing) return created;
    reminderId = existing.id;
  } else {
    return created;
  }

  if (plan.reminderId !== reminderId) {
    await prisma.preventiveCarePlan.update({ where: { id: plan.id }, data: { reminderId } });
    await recordAuditEvent({
      action: "care.record_written",
      entityType: "preventive_care_plan",
      entityId: plan.id,
      actorUserId: input.user.id,
      context: input.context,
      metadata: { reminderId, derived: "preventive_plan_reminder" },
    });
  }

  return careOk({ planId: plan.id, reminderId });
}

// ---------------------------------------------------------------------------
// Care programmes
// ---------------------------------------------------------------------------

export type CareProgramSummary = {
  id: string;
  familyMemberId: string | null;
  kind: CareProgramKind;
  status: CareProgramStatus;
  title: string;
  coordinatorLabel: string | null;
  enrolledOn: Date;
  endedOn: Date | null;
  details: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const PROGRAM_SELECT = {
  id: true,
  familyMemberId: true,
  kind: true,
  status: true,
  title: true,
  coordinatorLabel: true,
  enrolledOn: true,
  endedOn: true,
  details: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ProgramRow = {
  id: string;
  ownerUserId: string;
  familyMemberId: string | null;
  kind: CareProgramKind;
  status: CareProgramStatus;
  title: string;
};

/** Loads a programme and confirms the acting user may manage it. */
async function loadWritableProgram(
  user: AuthenticatedUser,
  programId: string,
): Promise<CareResult<ProgramRow>> {
  const program = await prisma.careProgramEnrollment.findUnique({
    where: { id: programId },
    select: {
      id: true,
      ownerUserId: true,
      familyMemberId: true,
      kind: true,
      status: true,
      title: true,
    },
  });
  if (!program) return careFail("not_found", "That care programme was not found.");

  const subject = await resolveCareSubject({
    viewerUserId: user.id,
    ownerUserId: program.ownerUserId,
    familyMemberId: program.familyMemberId,
  });
  if (!subject.ok) return subject;

  const scoped = requireScope(subject.data, "MANAGE_REMINDERS");
  if (!scoped.ok) return scoped;

  return careOk(program);
}

export async function listCarePrograms(input: {
  user: AuthenticatedUser;
  ownerUserId?: string;
  familyMemberId?: string;
  kind?: CareProgramKind;
}): Promise<CareResult<CareProgramSummary[]>> {
  const subject = await resolveCareSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.ownerUserId ?? null,
    familyMemberId: input.familyMemberId ?? null,
  });
  if (!subject.ok) return subject;

  const scoped = requireScope(subject.data, "VIEW_RECORDS");
  if (!scoped.ok) return scoped;

  return careOk(
    await prisma.careProgramEnrollment.findMany({
      where: {
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        ...(input.kind ? { kind: input.kind } : {}),
      },
      orderBy: [{ status: "asc" }, { enrolledOn: "desc" }],
      select: PROGRAM_SELECT,
    }),
  );
}

/**
 * Enrols somebody in a structured care programme.
 *
 * The enrolment is a fact about the person's record, so it is written to the
 * timeline as well as to its own row — joining a maternity or senior-care
 * programme should be visible in the same history as everything else.
 */
export async function enrollCareProgram(input: {
  user: AuthenticatedUser;
  data: CareProgramEnrollInput;
  context?: RequestContext;
}): Promise<CareResult<{ programId: string }>> {
  const { user, data } = input;

  const subject = await resolveCareSubject({
    viewerUserId: user.id,
    ownerUserId: data.ownerUserId ?? null,
    familyMemberId: data.familyMemberId ?? null,
  });
  if (!subject.ok) return subject;

  const scoped = requireScope(subject.data, "MANAGE_REMINDERS");
  if (!scoped.ok) return scoped;

  const now = new Date();
  const enrollment = await prisma.careProgramEnrollment.create({
    data: {
      ownerUserId: subject.data.ownerUserId,
      familyMemberId: subject.data.familyMemberId,
      kind: data.kind,
      status: "ACTIVE",
      title: data.title,
      coordinatorLabel: data.coordinatorLabel ?? null,
      enrolledOn: now,
      details: data.details as Prisma.InputJsonValue | undefined,
      notes: data.notes ?? null,
      createdById: user.id,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "care.care_program_enrolled",
    entityType: "care_program_enrollment",
    entityId: enrollment.id,
    actorUserId: user.id,
    context: input.context,
    metadata: { kind: data.kind },
  });

  await appendTimelineEvent({
    ownerUserId: subject.data.ownerUserId,
    familyMemberId: subject.data.familyMemberId,
    kind: "CARE_PROGRAM_ENROLLED",
    source: "USER_ENTERED",
    title: `Joined ${data.title}`,
    summary: data.coordinatorLabel ? `Coordinated by ${data.coordinatorLabel}.` : null,
    occurredAt: now,
    refType: "CareProgramEnrollment",
    refId: enrollment.id,
  });

  return careOk({ programId: enrollment.id });
}

/** Edits the descriptive fields of a programme. Status moves separately. */
export async function updateCareProgram(input: {
  user: AuthenticatedUser;
  programId: string;
  data: CareProgramUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ programId: string }>> {
  const loaded = await loadWritableProgram(input.user, input.programId);
  if (!loaded.ok) return loaded;
  const program = loaded.data;
  const { data } = input;

  await prisma.careProgramEnrollment.update({
    where: { id: program.id },
    data: {
      title: data.title,
      coordinatorLabel: data.coordinatorLabel,
      details: data.details as Prisma.InputJsonValue | undefined,
      notes: data.notes,
    },
  });

  await recordAuditEvent({
    action: "care.record_written",
    entityType: "care_program_enrollment",
    entityId: program.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      fields: Object.keys(data).filter((key) => data[key as keyof typeof data] !== undefined),
    },
  });

  return careOk({ programId: program.id });
}

/**
 * Moves a programme's status.
 *
 * `endedOn` is set for `COMPLETED` and `WITHDRAWN` and cleared otherwise, so a
 * programme that is put back on hold stops claiming an end date it no longer has.
 * Ending a programme also appends a timeline event, because the end of a course
 * of care is part of the person's history.
 */
export async function changeCareProgramStatus(input: {
  user: AuthenticatedUser;
  programId: string;
  status: CareProgramStatus;
  context?: RequestContext;
}): Promise<CareResult<{ programId: string; status: CareProgramStatus }>> {
  const loaded = await loadWritableProgram(input.user, input.programId);
  if (!loaded.ok) return loaded;
  const program = loaded.data;
  const now = new Date();
  const ends = input.status === "COMPLETED" || input.status === "WITHDRAWN";

  await prisma.careProgramEnrollment.update({
    where: { id: program.id },
    data: { status: input.status, endedOn: ends ? now : null },
  });

  await recordAuditEvent({
    action: "care.care_program_status_changed",
    entityType: "care_program_enrollment",
    entityId: program.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { from: program.status, to: input.status },
  });

  if (ends) {
    await appendTimelineEvent({
      ownerUserId: program.ownerUserId,
      familyMemberId: program.familyMemberId,
      kind: "OTHER",
      source: "USER_ENTERED",
      title: input.status === "COMPLETED" ? `${program.title} completed` : `${program.title} withdrawn`,
      summary: "This care programme has ended.",
      occurredAt: now,
      refType: "CareProgramEnrollment",
      refId: program.id,
    });
  }

  return careOk({ programId: program.id, status: input.status });
}
