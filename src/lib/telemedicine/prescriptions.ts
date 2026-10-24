import "server-only";

import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { PrescriptionSource, PrescriptionStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { sendNotification } from "@/lib/notifications/provider";
import { recordAuditEvent } from "@/lib/security/audit";
import { assertTreatingClinician, ClinicianFailure } from "@/lib/telemedicine/clinician";
import type { ConsultationPrescriptionInput } from "@/lib/validation/telemedicine";

/**
 * Prescriptions issued by a clinician from a consultation.
 *
 * ## What makes this the clinician's prescription
 *
 * Four things are recorded and none of them is taken from the request: the
 * prescriber's name, their registration number, the moment it was issued, and
 * the account that issued it. `source` is `PLATFORM_CLINICIAN` so it is never
 * confused with a scan a patient uploaded, and the status is `APPROVED` because
 * the prescribing clinician is the authority for their own prescription — there
 * is no second reviewer to wait for.
 *
 * ## The platform does not choose medicines
 *
 * Each line is stored exactly as the clinician wrote it, and `productId` stays
 * null: linking a written line to a catalogue product is a human matching step,
 * never a guess made here. Nothing in this module substitutes, doses or
 * completes a medicine.
 *
 * ## Who may issue
 *
 * Only the verified clinician treating the appointment. The check is the shared
 * one from `clinician.ts`, so a prescription cannot be issued on an appointment
 * the caller is not treating, however the request is phrased.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type PrescriptionErrorCode =
  | "not_found"
  | "not_treating_clinician"
  | "clinician_not_verified"
  | "appointment_closed"
  | "not_issuable"
  | "consent_required"
  | "empty_prescription"
  | "conflict";

export type PrescriptionActor = {
  userId: string;
  role: "DOCTOR" | "PATIENT" | "PLATFORM_ADMIN";
  label: string;
};

class PrescriptionFailure extends Error {
  readonly code: PrescriptionErrorCode;

  constructor(code: PrescriptionErrorCode, message: string) {
    super(message);
    this.name = "PrescriptionFailure";
    this.code = code;
  }
}

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** `ORX-RX-` followed by six characters: the format the pharmacy module reads. */
function createPrescriptionReference(): string {
  const bytes = randomBytes(6);
  let suffix = "";
  for (const byte of bytes) suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `ORX-RX-${suffix}`;
}

/** The appointment states a prescription may be issued from. */
const ISSUABLE_STATUSES = ["CONFIRMED", "COMPLETED"] as const;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const PRESCRIPTION_SELECT = {
  id: true,
  reference: true,
  status: true,
  source: true,
  appointmentId: true,
  prescriberName: true,
  prescriberRegistrationNumber: true,
  prescriberClinic: true,
  issuedOn: true,
  validUntil: true,
  patientNameOnDocument: true,
  patientNotes: true,
  consentAcknowledgedAt: true,
  consentPolicyVersion: true,
  reviewedAt: true,
  createdAt: true,
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      productId: true,
      prescribedName: true,
      strengthLabel: true,
      dosageForm: true,
      frequency: true,
      durationDays: true,
      quantity: true,
      instructions: true,
    },
  },
} satisfies Prisma.PrescriptionSelect;

export type ConsultationPrescriptionRow = Prisma.PrescriptionGetPayload<{ select: typeof PRESCRIPTION_SELECT }>;

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

export type IssuePrescriptionResult =
  | { ok: true; prescription: ConsultationPrescriptionRow; notice: string }
  | { ok: false; code: PrescriptionErrorCode; message: string };

/** Stated beside every issued prescription so the prescriber is never implied. */
const ISSUED_PRESCRIPTION_NOTICE =
  "This prescription was issued by the clinician named above from a virtual consultation. It names the prescriber and " +
  "their registration number. ORVEXA stores and delivers it, and never substitutes or changes a medicine on its own.";

export async function issueConsultationPrescription(input: {
  actor: PrescriptionActor;
  data: ConsultationPrescriptionInput;
}): Promise<IssuePrescriptionResult> {
  const { data } = input;

  if (!data.consentAcknowledged) {
    return {
      ok: false,
      code: "consent_required",
      message: "Confirm that you have assessed this patient and that the medicines written are the ones you intend to prescribe.",
    };
  }
  if (data.items.length === 0) {
    return { ok: false, code: "empty_prescription", message: "Write at least one medicine before issuing a prescription." };
  }

  try {
    const context = await assertTreatingClinician({
      userId: input.actor.userId,
      appointmentId: data.appointmentId,
    });

    if (context.appointmentMode !== "TELEMEDICINE") {
      throw new PrescriptionFailure("not_issuable", "That appointment is not a virtual consultation.");
    }
    if (!ISSUABLE_STATUSES.includes(context.appointmentStatus as (typeof ISSUABLE_STATUSES)[number])) {
      throw new PrescriptionFailure(
        "not_issuable",
        `A prescription cannot be issued from a consultation that is ${context.appointmentStatus}. Confirm the appointment first.`,
      );
    }

    const issuedOn = new Date();
    const validUntil = new Date(issuedOn.getTime() + data.validForDays * 24 * 60 * 60 * 1000);

    const prescription = await prisma.$transaction(async (tx) => {
      let reference = "";
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = createPrescriptionReference();
        const clash = await tx.prescription.findUnique({ where: { reference: candidate }, select: { id: true } });
        if (!clash) {
          reference = candidate;
          break;
        }
      }
      if (!reference) {
        throw new PrescriptionFailure("conflict", "A prescription reference could not be allocated. Please try again.");
      }

      const created = await tx.prescription.create({
        data: {
          reference,
          ownerUserId: context.patientUserId,
          appointmentId: context.appointmentId,
          source: "PLATFORM_CLINICIAN" satisfies PrescriptionSource,
          status: "APPROVED" satisfies PrescriptionStatus,
          prescriberName: context.fullName,
          prescriberRegistrationNumber: context.registrationNumber,
          prescriberClinic: context.clinicName,
          issuedOn,
          validUntil,
          patientNameOnDocument: context.patientName,
          patientNotes: data.patientNotes ?? null,
          // The prescribing clinician is the reviewer of their own prescription,
          // and the record says exactly that rather than implying a second check.
          reviewedById: input.actor.userId,
          reviewedByLabel: input.actor.label,
          reviewedAt: issuedOn,
          consentAcknowledgedAt: issuedOn,
          consentPolicyVersion: data.consentPolicyVersion,
          items: {
            create: data.items.map((item) => ({
              prescribedName: item.prescribedName,
              strengthLabel: item.strengthLabel ?? null,
              dosageForm: item.dosageForm ?? null,
              frequency: item.frequency ?? null,
              durationDays: item.durationDays ?? null,
              quantity: item.quantity ?? null,
              instructions: item.instructions ?? null,
            })),
          },
          reviews: {
            create: {
              status: "APPROVED" satisfies PrescriptionStatus,
              actorUserId: input.actor.userId,
              actorRole: "DOCTOR",
              actorLabel: input.actor.label,
              note: `Issued by the treating clinician from consultation ${context.appointmentReference}.`,
            },
          },
        },
        select: PRESCRIPTION_SELECT,
      });

      return created;
    });

    await recordAuditEvent({
      action: "consultation.prescription_issued",
      entityType: "prescription",
      entityId: prescription.id,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      metadata: {
        reference: prescription.reference,
        appointmentReference: context.appointmentReference,
        registrationNumber: context.registrationNumber,
        itemCount: prescription.items.length,
      },
    });

    await notifyPatient({
      patientUserId: context.patientUserId,
      subject: `Prescription issued for consultation ${context.appointmentReference}`,
      body:
        "Your clinician issued a prescription from your consultation. Open your consultations to read it. It can be " +
        "handed to a pharmacy through ORVEXA when you are ready.",
      reference: prescription.reference,
    });

    return { ok: true, prescription, notice: ISSUED_PRESCRIPTION_NOTICE };
  } catch (error) {
    if (error instanceof ClinicianFailure) return { ok: false, code: error.code, message: error.message };
    if (error instanceof PrescriptionFailure) return { ok: false, code: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, code: "conflict", message: "That prescription was already issued. Reload the consultation." };
    }
    throw error;
  }
}

async function notifyPatient(input: { patientUserId: string; subject: string; body: string; reference: string }) {
  const patient = await prisma.user.findUnique({ where: { id: input.patientUserId }, select: { email: true } });
  if (!patient) return;
  await sendNotification({
    kind: "consultation_prescription_issued",
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

/** Every prescription issued from a consultation, for the treating clinician. */
export async function listConsultationPrescriptionsForClinician(
  appointmentId: string,
): Promise<ConsultationPrescriptionRow[]> {
  return prisma.prescription.findMany({
    where: { appointmentId, source: "PLATFORM_CLINICIAN" },
    select: PRESCRIPTION_SELECT,
    orderBy: { createdAt: "desc" },
    take: 40,
  });
}

/**
 * The prescriptions a patient may read from one of their own consultations.
 *
 * The ownership check is a query, not a filter in the page: an appointment that
 * is not this patient's returns an empty list without revealing whether the
 * appointment exists.
 */
export async function listPatientConsultationPrescriptions(input: {
  appointmentId: string;
  patientUserId: string;
}): Promise<ConsultationPrescriptionRow[]> {
  const owned = await prisma.appointment.count({
    where: { id: input.appointmentId, patientUserId: input.patientUserId },
  });
  if (owned === 0) return [];

  return prisma.prescription.findMany({
    where: {
      appointmentId: input.appointmentId,
      ownerUserId: input.patientUserId,
      source: "PLATFORM_CLINICIAN",
      deletedAt: null,
    },
    select: PRESCRIPTION_SELECT,
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

/** One prescription by reference, for the patient who owns it. */
export async function getPatientConsultationPrescriptionByReference(input: {
  patientUserId: string;
  reference: string;
}): Promise<ConsultationPrescriptionRow | null> {
  return prisma.prescription.findFirst({
    where: { reference: input.reference, ownerUserId: input.patientUserId, deletedAt: null },
    select: PRESCRIPTION_SELECT,
  });
}
