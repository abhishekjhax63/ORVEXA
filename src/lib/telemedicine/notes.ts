import "server-only";

import { Prisma } from "@prisma/client";
import type { ConsultationNoteStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { sendNotification } from "@/lib/notifications/provider";
import { recordAuditEvent } from "@/lib/security/audit";
import { assertTreatingClinician, ClinicianFailure } from "@/lib/telemedicine/clinician";
import type { ConsultationNoteDraftInput } from "@/lib/validation/telemedicine";

/**
 * Consultation notes.
 *
 * ## The finalise step is the clinical act
 *
 * A draft is the clinician's working text and is never shown to the patient.
 * `FINALIZED` is what turns a note into the clinical record, and it can only be
 * written by a clinician who is verified on ORVEXA *and* is the treating
 * clinician on that appointment. A draft with neither an assessment nor a plan
 * cannot be finalised: an empty note is not a record.
 *
 * ## Amendments do not overwrite
 *
 * Correcting a finalised note creates a new note that names the one it corrects
 * and carries the reason. The original stays exactly as it was signed, so the
 * record shows what was said and what changed — which is the point of a clinical
 * note in the first place.
 */

export type NoteErrorCode =
  | "not_found"
  | "not_treating_clinician"
  | "clinician_not_verified"
  | "appointment_closed"
  | "not_editable"
  | "incomplete"
  | "conflict";

export type NoteActor = {
  userId: string;
  role: "DOCTOR" | "PATIENT" | "PLATFORM_ADMIN";
  label: string;
};

class NoteFailure extends Error {
  readonly code: NoteErrorCode;

  constructor(code: NoteErrorCode, message: string) {
    super(message);
    this.name = "NoteFailure";
    this.code = code;
  }
}

const NOTE_SELECT = {
  id: true,
  appointmentId: true,
  doctorProfileId: true,
  authorUserId: true,
  authorLabel: true,
  authorRole: true,
  status: true,
  subjective: true,
  objective: true,
  assessment: true,
  plan: true,
  diagnosisSummary: true,
  followUpInstructions: true,
  followUpAfterDays: true,
  postConsultationInstructions: true,
  finalizedById: true,
  finalizedByLabel: true,
  finalizedAt: true,
  amendedFromId: true,
  amendmentReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ConsultationNoteSelect;

export type ConsultationNoteRow = Prisma.ConsultationNoteGetPayload<{ select: typeof NOTE_SELECT }>;

/**
 * Confirms the actor is the treating clinician *and* is verified.
 *
 * Both conditions are required by the platform's clinical rule; neither is
 * optional, and neither can be claimed by the request body. The rule itself
 * lives in `clinician.ts`, so a note and a prescription cannot drift apart on
 * who is allowed to sign.
 */
async function assertTreatingVerifiedClinician(input: {
  userId: string;
  appointmentId: string;
}): Promise<{
  doctorProfileId: string;
  registrationNumber: string;
  fullName: string;
  appointmentReference: string;
  patientUserId: string;
}> {
  const context = await assertTreatingClinician(input);
  return {
    doctorProfileId: context.doctorProfileId,
    registrationNumber: context.registrationNumber,
    fullName: context.fullName,
    appointmentReference: context.appointmentReference,
    patientUserId: context.patientUserId,
  };
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export type SaveNoteResult =
  | { ok: true; note: ConsultationNoteRow; created: boolean }
  | { ok: false; code: NoteErrorCode; message: string };

export async function saveConsultationNoteDraft(input: {
  actor: NoteActor;
  data: ConsultationNoteDraftInput;
}): Promise<SaveNoteResult> {
  try {
    const context = await assertTreatingVerifiedClinician({
      userId: input.actor.userId,
      appointmentId: input.data.appointmentId,
    });

    if (input.data.noteId) {
      const existing = await prisma.consultationNote.findFirst({
        where: {
          id: input.data.noteId,
          appointmentId: input.data.appointmentId,
          status: "DRAFT",
        },
        select: { id: true, authorUserId: true },
      });
      if (!existing) {
        throw new NoteFailure("not_editable", "That draft is no longer open for editing.");
      }
      if (existing.authorUserId !== input.actor.userId) {
        throw new NoteFailure("not_editable", "That draft was written by another clinician.");
      }

      const updated = await prisma.consultationNote.update({
        where: { id: existing.id },
        data: draftFields(input.data),
        select: NOTE_SELECT,
      });

      await recordAuditEvent({
        action: "consultation.note_saved",
        entityType: "consultation_note",
        entityId: updated.id,
        actorUserId: input.actor.userId,
        actorLabel: input.actor.label,
        metadata: { reference: context.appointmentReference, status: "DRAFT" },
      });

      return { ok: true, note: updated, created: false };
    }

    const openDraft = await prisma.consultationNote.findFirst({
      where: {
        appointmentId: input.data.appointmentId,
        authorUserId: input.actor.userId,
        status: "DRAFT",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const note = openDraft
      ? await prisma.consultationNote.update({
          where: { id: openDraft.id },
          data: draftFields(input.data),
          select: NOTE_SELECT,
        })
      : await prisma.consultationNote.create({
          data: {
            appointmentId: input.data.appointmentId,
            doctorProfileId: context.doctorProfileId,
            authorUserId: input.actor.userId,
            authorLabel: input.actor.label,
            authorRole: "DOCTOR",
            status: "DRAFT",
            ...draftFields(input.data),
          },
          select: NOTE_SELECT,
        });

    await recordAuditEvent({
      action: "consultation.note_saved",
      entityType: "consultation_note",
      entityId: note.id,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      metadata: { reference: context.appointmentReference, status: "DRAFT" },
    });

    return { ok: true, note, created: !openDraft };
  } catch (error) {
    if (error instanceof ClinicianFailure) return { ok: false, code: error.code, message: error.message };
    if (error instanceof NoteFailure) return { ok: false, code: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, code: "conflict", message: "That note was updated elsewhere. Reload and try again." };
    }
    throw error;
  }
}

function draftFields(data: ConsultationNoteDraftInput) {
  return {
    subjective: data.subjective ?? null,
    objective: data.objective ?? null,
    assessment: data.assessment ?? null,
    plan: data.plan ?? null,
    diagnosisSummary: data.diagnosisSummary ?? null,
    followUpInstructions: data.followUpInstructions ?? null,
    followUpAfterDays: data.followUpAfterDays ?? null,
    postConsultationInstructions: data.postConsultationInstructions ?? null,
  };
}

// ---------------------------------------------------------------------------
// Finalise
// ---------------------------------------------------------------------------

export async function finalizeConsultationNote(input: {
  actor: NoteActor;
  appointmentId: string;
  noteId: string;
}): Promise<SaveNoteResult> {
  try {
    const context = await assertTreatingVerifiedClinician({
      userId: input.actor.userId,
      appointmentId: input.appointmentId,
    });

    const note = await prisma.consultationNote.findFirst({
      where: { id: input.noteId, appointmentId: input.appointmentId },
      select: NOTE_SELECT,
    });
    if (!note) throw new NoteFailure("not_found", "That note was not found on this consultation.");
    if (note.status === "FINALIZED" || note.status === "AMENDED") {
      return { ok: true, note, created: false };
    }

    // An empty note is not a record. Either an assessment or a plan must exist,
    // and the clinician's own words are what get signed.
    if (!note.assessment && !note.plan) {
      throw new NoteFailure(
        "incomplete",
        "Write at least an assessment or a plan before finalising this note.",
      );
    }

    const finalized = await prisma.consultationNote.update({
      where: { id: note.id },
      data: {
        status: "FINALIZED",
        finalizedById: input.actor.userId,
        finalizedByLabel: input.actor.label,
        finalizedAt: new Date(),
      },
      select: NOTE_SELECT,
    });

    await recordAuditEvent({
      action: "consultation.note_finalized",
      entityType: "consultation_note",
      entityId: finalized.id,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      metadata: {
        reference: context.appointmentReference,
        registrationNumber: context.registrationNumber,
      },
    });

    await notifyPatient({
      patientUserId: context.patientUserId,
      appointmentId: input.appointmentId,
      reference: context.appointmentReference,
      subject: `Consultation note available for ${context.appointmentReference}`,
      body: "Your clinician has finalised the note for your consultation. Open your consultations to read it.",
      kind: "consultation_note_available",
    });

    return { ok: true, note: finalized, created: false };
  } catch (error) {
    if (error instanceof ClinicianFailure) return { ok: false, code: error.code, message: error.message };
    if (error instanceof NoteFailure) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Amend
// ---------------------------------------------------------------------------

export async function amendConsultationNote(input: {
  actor: NoteActor;
  appointmentId: string;
  noteId: string;
  reason: string;
  assessment?: string;
  plan?: string;
  followUpInstructions?: string;
}): Promise<SaveNoteResult> {
  try {
    const context = await assertTreatingVerifiedClinician({
      userId: input.actor.userId,
      appointmentId: input.appointmentId,
    });

    const original = await prisma.consultationNote.findFirst({
      where: { id: input.noteId, appointmentId: input.appointmentId },
      select: NOTE_SELECT,
    });
    if (!original) throw new NoteFailure("not_found", "That note was not found on this consultation.");
    if (original.status !== "FINALIZED" && original.status !== "AMENDED") {
      throw new NoteFailure("not_editable", "Only a finalised note can be amended. Finalise this draft first.");
    }

    const amendment = await prisma.consultationNote.create({
      data: {
        appointmentId: input.appointmentId,
        doctorProfileId: context.doctorProfileId,
        authorUserId: input.actor.userId,
        authorLabel: input.actor.label,
        authorRole: "DOCTOR",
        status: "AMENDED",
        subjective: original.subjective,
        objective: original.objective,
        assessment: input.assessment ?? original.assessment,
        plan: input.plan ?? original.plan,
        diagnosisSummary: original.diagnosisSummary,
        followUpInstructions: input.followUpInstructions ?? original.followUpInstructions,
        followUpAfterDays: original.followUpAfterDays,
        postConsultationInstructions: original.postConsultationInstructions,
        amendedFromId: original.id,
        amendmentReason: input.reason,
        finalizedById: input.actor.userId,
        finalizedByLabel: input.actor.label,
        finalizedAt: new Date(),
      },
      select: NOTE_SELECT,
    });

    await recordAuditEvent({
      action: "consultation.note_amended",
      entityType: "consultation_note",
      entityId: amendment.id,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      metadata: { reference: context.appointmentReference, amendedFromId: original.id },
    });

    await notifyPatient({
      patientUserId: context.patientUserId,
      appointmentId: input.appointmentId,
      reference: context.appointmentReference,
      subject: `Consultation note corrected for ${context.appointmentReference}`,
      body: "Your clinician corrected the note for your consultation. The correction explains what changed.",
      kind: "consultation_note_available",
    });

    return { ok: true, note: amendment, created: true };
  } catch (error) {
    if (error instanceof ClinicianFailure) return { ok: false, code: error.code, message: error.message };
    if (error instanceof NoteFailure) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

async function notifyPatient(input: {
  patientUserId: string;
  appointmentId: string;
  reference: string;
  subject: string;
  body: string;
  kind: "consultation_note_available";
}) {
  const patient = await prisma.user.findUnique({ where: { id: input.patientUserId }, select: { email: true } });
  if (!patient) return;
  await sendNotification({
    kind: input.kind,
    channel: "EMAIL",
    to: patient.email,
    subject: input.subject,
    body: input.body,
    reference: input.reference,
  }).catch(() => null);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every note on a consultation, for the treating clinician. */
export async function listConsultationNotesForClinician(appointmentId: string): Promise<ConsultationNoteRow[]> {
  return prisma.consultationNote.findMany({
    where: { appointmentId },
    select: NOTE_SELECT,
    orderBy: { createdAt: "desc" },
    take: 40,
  });
}

/**
 * The notes a patient may read: finalised ones only.
 *
 * A draft is the clinician's working text, so it never appears here — not
 * filtered in the UI, simply not returned.
 */
export async function listPatientConsultationNotes(input: {
  appointmentId: string;
  patientUserId: string;
}): Promise<ConsultationNoteRow[]> {
  const owned = await prisma.appointment.count({
    where: { id: input.appointmentId, patientUserId: input.patientUserId },
  });
  if (owned === 0) return [];

  return prisma.consultationNote.findMany({
    where: {
      appointmentId: input.appointmentId,
      status: { in: ["FINALIZED", "AMENDED"] satisfies ConsultationNoteStatus[] },
    },
    select: NOTE_SELECT,
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
