import "server-only";

import { Prisma } from "@prisma/client";
import type { AppointmentStatus, CancelledBy } from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { createAppointmentReference } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db/prisma";
import { sendNotification } from "@/lib/notifications/provider";
import { recordAuditEvent } from "@/lib/security/audit";
import { getRequestContext } from "@/lib/security/request";
import { checkTeleconsultSlot } from "@/lib/telemedicine/availability";
import { cancelTeleconsultSessionForAppointment } from "@/lib/telemedicine/sessions";
import type {
  FollowUpBookingInput,
  TeleconsultBookingInput,
} from "@/lib/validation/telemedicine";

/**
 * Virtual appointments: booking, rescheduling, cancelling and follow-ups.
 *
 * ## The clinician is re-read, never trusted from the request
 *
 * The client names a `doctorProfileId` and a time. Whether that clinician is
 * verified, has telemedicine switched on, is accepting patients and actually
 * published that clinic time is decided here, inside the booking transaction.
 * A time the clinician did not publish fails the booking rather than being
 * written down and argued about later.
 *
 * ## Two people cannot book one time
 *
 * The requested time is claimed as an `AppointmentSlot` and flipped from OPEN to
 * BOOKED with a conditional `updateMany` inside the transaction. Two concurrent
 * requests both read the slot as OPEN; only one `updateMany` reports a row
 * changed, and the loser is told the time was taken. This is the same mechanism
 * the in-person flow uses, rather than a second, weaker one.
 *
 * ## Idempotency
 *
 * `Appointment` carries `@@unique([createdById, idempotencyKey])`, so a double
 * tap or a retried submit resolves to the same appointment. A replay from a
 * *different* account is refused, never adopted.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type TeleconsultErrorCode =
  | "doctor_not_found"
  | "teleconsult_disabled"
  | "not_accepting_patients"
  | "family_member_not_found"
  | "consent_required"
  | "outside_schedule"
  | "slot_taken"
  | "not_found"
  | "not_reschedulable"
  | "not_cancellable"
  | "parent_not_completed"
  | "conflict";

class TeleconsultFailure extends Error {
  readonly code: TeleconsultErrorCode;

  constructor(code: TeleconsultErrorCode, message: string) {
    super(message);
    this.name = "TeleconsultFailure";
    this.code = code;
  }
}

export type TeleconsultActor = {
  userId?: string | null;
  role?: "PATIENT" | "DOCTOR" | "PLATFORM_ADMIN" | "HOSPITAL_ADMIN" | null;
  label?: string | null;
};

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const TELECONSULT_SUMMARY_SELECT = {
  id: true,
  reference: true,
  status: true,
  mode: true,
  scheduledStart: true,
  scheduledEnd: true,
  feeInr: true,
  reason: true,
  createdAt: true,
  confirmedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  followUpOfAppointmentId: true,
  patientUserId: true,
  familyMemberId: true,
  doctorProfileId: true,
  hospitalId: true,
  // The patient's name travels with the summary because the clinician's queue
  // is a list of people, not a list of references.
  patient: { select: { id: true, fullName: true } },
  doctorProfile: {
    select: {
      id: true,
      headline: true,
      specialties: true,
      languages: true,
      teleconsultEnabled: true,
      teleconsultFeeInr: true,
      verificationStatus: true,
      user: { select: { fullName: true } },
    },
  },
  teleconsultSession: {
    select: {
      id: true,
      status: true,
      provider: true,
      providerConfirmed: true,
      isSandbox: true,
      roomExpiresAt: true,
    },
  },
} satisfies Prisma.AppointmentSelect;

export type TeleconsultSummary = Prisma.AppointmentGetPayload<{ select: typeof TELECONSULT_SUMMARY_SELECT }>;

const TELECONSULT_DETAIL_SELECT = {
  ...TELECONSULT_SUMMARY_SELECT,
  patientNotes: true,
  slotId: true,
  createdById: true,
  patient: { select: { id: true, fullName: true } },
  familyMember: { select: { id: true, fullName: true, relationship: true } },
  events: {
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, fromStatus: true, toStatus: true, notes: true, createdAt: true },
  },
  consultationNotes: {
    where: { status: { in: ["FINALIZED", "AMENDED"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      diagnosisSummary: true,
      followUpInstructions: true,
      followUpAfterDays: true,
      postConsultationInstructions: true,
      finalizedByLabel: true,
      finalizedAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.AppointmentSelect;

export type TeleconsultDetail = Prisma.AppointmentGetPayload<{ select: typeof TELECONSULT_DETAIL_SELECT }>;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function reserveAppointmentReference(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = createAppointmentReference();
    const clash = await tx.appointment.findUnique({ where: { reference: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  throw new TeleconsultFailure("conflict", "An appointment reference could not be allocated. Please try again.");
}

type BookableDoctor = {
  id: string;
  registrationNumber: string;
  teleconsultEnabled: boolean;
  acceptingNewPatients: boolean;
  teleconsultFeeInr: number | null;
  verificationStatus: string;
  userFullName: string;
};

async function loadBookableDoctor(doctorProfileId: string): Promise<BookableDoctor> {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorProfileId },
    select: {
      id: true,
      registrationNumber: true,
      teleconsultEnabled: true,
      acceptingNewPatients: true,
      teleconsultFeeInr: true,
      verificationStatus: true,
      user: { select: { fullName: true, status: true } },
    },
  });
  if (!doctor || doctor.user.status !== "ACTIVE") {
    throw new TeleconsultFailure("doctor_not_found", "That clinician was not found.");
  }
  if (doctor.verificationStatus !== "VERIFIED" || !doctor.teleconsultEnabled) {
    throw new TeleconsultFailure(
      "teleconsult_disabled",
      "That clinician does not offer virtual consultations on ORVEXA.",
    );
  }
  if (!doctor.acceptingNewPatients) {
    throw new TeleconsultFailure(
      "not_accepting_patients",
      "That clinician is not accepting new patients at the moment. Choose another clinician.",
    );
  }
  return {
    id: doctor.id,
    registrationNumber: doctor.registrationNumber,
    teleconsultEnabled: doctor.teleconsultEnabled,
    acceptingNewPatients: doctor.acceptingNewPatients,
    teleconsultFeeInr: doctor.teleconsultFeeInr,
    verificationStatus: doctor.verificationStatus,
    userFullName: doctor.user.fullName,
  };
}

async function assertFamilyMemberBookable(familyMemberId: string, ownerUserId: string): Promise<void> {
  const member = await prisma.familyMember.findFirst({
    where: { id: familyMemberId, patientProfile: { userId: ownerUserId } },
    select: { id: true, canBookAppointments: true },
  });
  if (!member) {
    throw new TeleconsultFailure("family_member_not_found", "That family member is not on your account.");
  }
  if (!member.canBookAppointments) {
    throw new TeleconsultFailure(
      "family_member_not_found",
      "You do not have permission to book for that family member.",
    );
  }
}

/**
 * Claims a published clinic time.
 *
 * Runs inside the caller's transaction. The slot row is created if this is the
 * first booking at that time and then flipped OPEN → BOOKED conditionally; a
 * slot that is BLOCKED or already BOOKED reports zero rows changed and the
 * booking is refused.
 */
async function claimTeleconsultSlot(
  tx: Prisma.TransactionClient,
  input: { doctorProfileId: string; startAt: Date; endAt: Date; hospitalId: string | null },
): Promise<string> {
  const slot = await tx.appointmentSlot.upsert({
    where: {
      doctorProfileId_startAt: { doctorProfileId: input.doctorProfileId, startAt: input.startAt },
    },
    create: {
      doctorProfileId: input.doctorProfileId,
      hospitalId: input.hospitalId,
      startAt: input.startAt,
      endAt: input.endAt,
      mode: "TELEMEDICINE",
      status: "OPEN",
    },
    update: {},
    select: { id: true },
  });

  const claimed = await tx.appointmentSlot.updateMany({
    where: { id: slot.id, status: "OPEN" },
    data: { status: "BOOKED" },
  });
  if (claimed.count === 0) {
    throw new TeleconsultFailure("slot_taken", "That time has just been taken. Choose another time from the list.");
  }
  return slot.id;
}

/** Releases a slot a previous appointment held, so the time becomes bookable again. */
async function releaseTeleconsultSlot(tx: Prisma.TransactionClient, slotId: string | null): Promise<void> {
  if (!slotId) return;
  await tx.appointmentSlot.updateMany({
    where: { id: slotId, status: "BOOKED" },
    data: { status: "OPEN" },
  });
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export type CreateTeleconsultResult =
  | { ok: true; appointment: TeleconsultSummary; reused: boolean }
  | { ok: false; code: TeleconsultErrorCode; message: string };

export async function createTeleconsultAppointment(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName" | "email" | "phone">;
  data: TeleconsultBookingInput;
}): Promise<CreateTeleconsultResult> {
  const { data } = input;

  if (!data.consentAcknowledged) {
    return {
      ok: false,
      code: "consent_required",
      message:
        "Confirm that you consent to a virtual consultation, to a secure session being opened and to the clinician recording a note.",
    };
  }

  const existing = await prisma.appointment.findUnique({
    where: { createdById_idempotencyKey: { createdById: input.user.id, idempotencyKey: data.idempotencyKey } },
    select: TELECONSULT_SUMMARY_SELECT,
  });
  if (existing) {
    if (existing.patientUserId !== input.user.id) {
      return { ok: false, code: "conflict", message: "That booking key has already been used on another account." };
    }
    return { ok: true, appointment: existing, reused: true };
  }

  const context = await getRequestContext();

  try {
    const doctor = await loadBookableDoctor(data.doctorProfileId);
    if (data.familyMemberId) await assertFamilyMemberBookable(data.familyMemberId, input.user.id);

    const appointment = await prisma.$transaction(async (tx) => {
      // Re-check the time against the database inside the transaction: the
      // answer the write is based on must be the answer at write time.
      const slotCheck = await checkTeleconsultSlot({
        doctorProfileId: doctor.id,
        startAt: data.scheduledAt,
      });
      if (!slotCheck.ok) throw new TeleconsultFailure(slotCheck.code, slotCheck.message);

      const slotId = await claimTeleconsultSlot(tx, {
        doctorProfileId: doctor.id,
        startAt: data.scheduledAt,
        endAt: slotCheck.endAt,
        hospitalId: null,
      });
      const reference = await reserveAppointmentReference(tx);

      const created = await tx.appointment.create({
        data: {
          reference,
          patientUserId: input.user.id,
          familyMemberId: data.familyMemberId ?? null,
          doctorProfileId: doctor.id,
          slotId,
          scheduledStart: data.scheduledAt,
          scheduledEnd: slotCheck.endAt,
          mode: "TELEMEDICINE",
          status: "PENDING",
          reason: data.reason ?? null,
          patientNotes: data.patientNotes ?? null,
          feeInr: doctor.teleconsultFeeInr ?? null,
          createdById: input.user.id,
          idempotencyKey: data.idempotencyKey,
          events: {
            create: {
              type: "CREATED",
              toStatus: "PENDING",
              actorUserId: input.user.id,
              metadata: { reference, mode: "TELEMEDICINE", scheduledStart: data.scheduledAt.toISOString() },
            },
          },
        },
        select: TELECONSULT_SUMMARY_SELECT,
      });

      // Consent is a row, not a flag: withdrawing it later is its own decision.
      await tx.consentRecord.create({
        data: {
          userId: input.user.id,
          consentType: "TELEMEDICINE_CONSULTATION_CONSENT",
          policyVersion: data.consentPolicyVersion,
          granted: true,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      });

      return created;
    });

    await recordAuditEvent({
      action: "appointment.booked",
      entityType: "appointment",
      entityId: appointment.id,
      actorUserId: input.user.id,
      actorLabel: input.user.fullName,
      metadata: {
        reference: appointment.reference,
        mode: "TELEMEDICINE",
        doctorProfileId: doctor.id,
        idempotencyKey: data.idempotencyKey,
      },
    });

    await sendNotification({
      kind: "teleconsultation_booked",
      channel: "EMAIL",
      to: input.user.email,
      subject: `Virtual consultation ${appointment.reference} requested`,
      body:
        "Your virtual consultation has been requested. You will be able to open the waiting room once the clinician confirms it. " +
        "If your symptoms become severe, call emergency services instead of waiting.",
      reference: appointment.reference,
    }).catch(() => null);

    return { ok: true, appointment, reused: false };
  } catch (error) {
    if (error instanceof TeleconsultFailure) return { ok: false, code: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        code: "conflict",
        message: "This appointment was already requested. Open your consultations to see it.",
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reschedule and cancel
// ---------------------------------------------------------------------------

const RESCHEDULABLE_STATUSES: readonly AppointmentStatus[] = ["PENDING", "CONFIRMED"];

export type ManageTeleconsultResult =
  | { ok: true; appointmentId: string; reference: string; status: AppointmentStatus }
  | { ok: false; code: TeleconsultErrorCode; message: string };

export async function rescheduleTeleconsultAppointment(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName">;
  appointmentId: string;
  scheduledAt: Date;
  reason?: string | null;
}): Promise<ManageTeleconsultResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    select: {
      id: true,
      reference: true,
      status: true,
      mode: true,
      patientUserId: true,
      doctorProfileId: true,
      slotId: true,
      scheduledStart: true,
    },
  });
  if (!appointment || appointment.patientUserId !== input.user.id) {
    return { ok: false, code: "not_found", message: "That consultation was not found on your account." };
  }
  if (!RESCHEDULABLE_STATUSES.includes(appointment.status)) {
    return {
      ok: false,
      code: "not_reschedulable",
      message: `A consultation that is ${appointment.status} can no longer be rescheduled here. Contact the clinician.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const slotCheck = await checkTeleconsultSlot({
        doctorProfileId: appointment.doctorProfileId,
        startAt: input.scheduledAt,
      });
      if (!slotCheck.ok) throw new TeleconsultFailure(slotCheck.code, slotCheck.message);

      // The old time is released before the new one is claimed so a patient can
      // move an appointment by half an hour without being told it is taken.
      await releaseTeleconsultSlot(tx, appointment.slotId);
      const slotId = await claimTeleconsultSlot(tx, {
        doctorProfileId: appointment.doctorProfileId,
        startAt: input.scheduledAt,
        endAt: slotCheck.endAt,
        hospitalId: null,
      });

      await tx.appointment.update({
        where: { id: appointment.id },
        data: { scheduledStart: input.scheduledAt, scheduledEnd: slotCheck.endAt, slotId },
      });
      await tx.appointmentEvent.create({
        data: {
          appointmentId: appointment.id,
          type: "RESCHEDULED",
          fromStatus: appointment.status,
          toStatus: appointment.status,
          actorUserId: input.user.id,
          notes: input.reason ?? null,
          metadata: {
            from: appointment.scheduledStart.toISOString(),
            to: input.scheduledAt.toISOString(),
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof TeleconsultFailure) return { ok: false, code: error.code, message: error.message };
    throw error;
  }

  await recordAuditEvent({
    action: "appointment.rescheduled",
    entityType: "appointment",
    entityId: appointment.id,
    actorUserId: input.user.id,
    actorLabel: input.user.fullName,
    metadata: { reference: appointment.reference, scheduledAt: input.scheduledAt.toISOString() },
  });

  return { ok: true, appointmentId: appointment.id, reference: appointment.reference, status: appointment.status };
}

export async function cancelTeleconsultAppointment(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName" | "email">;
  appointmentId: string;
  reason: string;
}): Promise<ManageTeleconsultResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    select: {
      id: true,
      reference: true,
      status: true,
      patientUserId: true,
      slotId: true,
      teleconsultSession: { select: { id: true, status: true } },
    },
  });
  if (!appointment || appointment.patientUserId !== input.user.id) {
    return { ok: false, code: "not_found", message: "That consultation was not found on your account." };
  }
  if (appointment.status === "CANCELLED") {
    return { ok: true, appointmentId: appointment.id, reference: appointment.reference, status: "CANCELLED" };
  }
  if (!RESCHEDULABLE_STATUSES.includes(appointment.status)) {
    return {
      ok: false,
      code: "not_cancellable",
      message: `A consultation that is ${appointment.status} can no longer be cancelled here. Contact the clinician.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "CANCELLED",
        cancelledById: input.user.id,
        cancelledByRole: mapActorToCancelledBy("PATIENT"),
        cancellationReason: input.reason,
        cancelledAt: new Date(),
      },
    });
    await tx.appointmentEvent.create({
      data: {
        appointmentId: appointment.id,
        type: "CANCELLED",
        fromStatus: appointment.status,
        toStatus: "CANCELLED",
        actorUserId: input.user.id,
        notes: input.reason,
      },
    });
    await releaseTeleconsultSlot(tx, appointment.slotId);
  });

  await recordAuditEvent({
    action: "appointment.cancelled",
    entityType: "appointment",
    entityId: appointment.id,
    actorUserId: input.user.id,
    actorLabel: input.user.fullName,
    metadata: { reference: appointment.reference, reason: input.reason },
  });

  // A cancelled appointment must not leave a live room behind. Closing the
  // session is best-effort: the appointment's cancellation is already recorded
  // and never depends on whether the video provider answered.
  if (appointment.teleconsultSession) {
    await cancelTeleconsultSessionForAppointment({
      appointmentId: appointment.id,
      actor: { userId: input.user.id, role: "PATIENT", label: input.user.fullName },
      reason: "The appointment was cancelled.",
    }).catch(() => null);
  }

  await sendNotification({
    kind: "teleconsultation_cancelled",
    channel: "EMAIL",
    to: input.user.email,
    subject: `Virtual consultation ${appointment.reference} cancelled`,
    body: "Your virtual consultation has been cancelled. Any join link issued for it no longer works.",
    reference: appointment.reference,
  }).catch(() => null);

  return { ok: true, appointmentId: appointment.id, reference: appointment.reference, status: "CANCELLED" };
}

function mapActorToCancelledBy(role: NonNullable<TeleconsultActor["role"]>): CancelledBy {
  if (role === "PATIENT") return "PATIENT";
  if (role === "PLATFORM_ADMIN") return "PLATFORM";
  return "PROVIDER";
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

/**
 * Books a follow-up against a completed consultation.
 *
 * The parent must be the patient's own appointment and must be COMPLETED — a
 * follow-up to a consultation that never happened is not a follow-up. The new
 * appointment carries `followUpOfAppointmentId`, which is what makes the link
 * visible on both records.
 */
export async function createFollowUpAppointment(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName" | "email">;
  data: FollowUpBookingInput;
}): Promise<CreateTeleconsultResult> {
  const { data } = input;

  if (!data.consentAcknowledged) {
    return {
      ok: false,
      code: "consent_required",
      message: "Confirm that you consent to a further virtual consultation under the same terms.",
    };
  }

  const existing = await prisma.appointment.findUnique({
    where: { createdById_idempotencyKey: { createdById: input.user.id, idempotencyKey: data.idempotencyKey } },
    select: TELECONSULT_SUMMARY_SELECT,
  });
  if (existing) {
    if (existing.patientUserId !== input.user.id) {
      return { ok: false, code: "conflict", message: "That booking key has already been used on another account." };
    }
    return { ok: true, appointment: existing, reused: true };
  }

  const parent = await prisma.appointment.findUnique({
    where: { id: data.parentAppointmentId },
    select: { id: true, reference: true, status: true, patientUserId: true, familyMemberId: true, followUpOfAppointmentId: true },
  });
  if (!parent || parent.patientUserId !== input.user.id) {
    return { ok: false, code: "not_found", message: "That consultation was not found on your account." };
  }
  if (parent.status !== "COMPLETED") {
    return {
      ok: false,
      code: "parent_not_completed",
      message: "A follow-up can be booked once the consultation it follows has been completed.",
    };
  }
  // A follow-up of a follow-up is refused: the parent chain is kept one deep so
  // a record cannot be detached from the consultation it actually belongs to.
  const rootId = parent.followUpOfAppointmentId ?? parent.id;

  const context = await getRequestContext();

  try {
    const doctor = await loadBookableDoctor(data.doctorProfileId);

    const appointment = await prisma.$transaction(async (tx) => {
      const slotCheck = await checkTeleconsultSlot({
        doctorProfileId: doctor.id,
        startAt: data.scheduledAt,
      });
      if (!slotCheck.ok) throw new TeleconsultFailure(slotCheck.code, slotCheck.message);

      const slotId = await claimTeleconsultSlot(tx, {
        doctorProfileId: doctor.id,
        startAt: data.scheduledAt,
        endAt: slotCheck.endAt,
        hospitalId: null,
      });
      const reference = await reserveAppointmentReference(tx);

      const created = await tx.appointment.create({
        data: {
          reference,
          patientUserId: input.user.id,
          familyMemberId: parent.familyMemberId ?? null,
          doctorProfileId: doctor.id,
          slotId,
          scheduledStart: data.scheduledAt,
          scheduledEnd: slotCheck.endAt,
          mode: "TELEMEDICINE",
          status: "PENDING",
          reason: data.reason ?? null,
          patientNotes: data.patientNotes ?? null,
          feeInr: doctor.teleconsultFeeInr ?? null,
          followUpOfAppointmentId: rootId,
          createdById: input.user.id,
          idempotencyKey: data.idempotencyKey,
          events: {
            create: {
              type: "CREATED",
              toStatus: "PENDING",
              actorUserId: input.user.id,
              metadata: { reference, followUpOf: parent.reference, scheduledStart: data.scheduledAt.toISOString() },
            },
          },
        },
        select: TELECONSULT_SUMMARY_SELECT,
      });

      await tx.consentRecord.create({
        data: {
          userId: input.user.id,
          consentType: "TELEMEDICINE_CONSULTATION_CONSENT",
          policyVersion: data.consentPolicyVersion,
          granted: true,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      });

      return created;
    });

    await recordAuditEvent({
      action: "appointment.booked",
      entityType: "appointment",
      entityId: appointment.id,
      actorUserId: input.user.id,
      actorLabel: input.user.fullName,
      metadata: {
        reference: appointment.reference,
        followUpOf: parent.reference,
        mode: "TELEMEDICINE",
      },
    });

    await sendNotification({
      kind: "teleconsultation_booked",
      channel: "EMAIL",
      to: input.user.email,
      subject: `Follow-up consultation ${appointment.reference} requested`,
      body: "Your follow-up virtual consultation has been requested.",
      reference: appointment.reference,
    }).catch(() => null);

    return { ok: true, appointment, reused: false };
  } catch (error) {
    if (error instanceof TeleconsultFailure) return { ok: false, code: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, code: "conflict", message: "This follow-up was already requested." };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reads — patient
// ---------------------------------------------------------------------------

export async function listPatientTeleconsultations(userId: string): Promise<TeleconsultSummary[]> {
  return prisma.appointment.findMany({
    where: { patientUserId: userId, mode: "TELEMEDICINE" },
    select: TELECONSULT_SUMMARY_SELECT,
    orderBy: [{ scheduledStart: "desc" }],
    take: 100,
  });
}

export async function getPatientTeleconsultationByReference(input: {
  userId: string;
  reference: string;
}): Promise<TeleconsultDetail | null> {
  return prisma.appointment.findFirst({
    where: { reference: input.reference, patientUserId: input.userId, mode: "TELEMEDICINE" },
    select: TELECONSULT_DETAIL_SELECT,
  });
}

// ---------------------------------------------------------------------------
// Reads — clinician
// ---------------------------------------------------------------------------

/** The doctor profile owned by a signed-in account, if any. */
export async function getDoctorProfileForOwner(userId: string) {
  return prisma.doctorProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      registrationNumber: true,
      registrationCouncil: true,
      headline: true,
      specialties: true,
      teleconsultEnabled: true,
      teleconsultFeeInr: true,
      acceptingNewPatients: true,
      verificationStatus: true,
      user: { select: { fullName: true, email: true } },
    },
  });
}

export async function listClinicianTeleconsultations(input: {
  doctorUserId: string;
  from?: Date;
  limit?: number;
}): Promise<TeleconsultSummary[]> {
  return prisma.appointment.findMany({
    where: {
      mode: "TELEMEDICINE",
      doctorProfile: { userId: input.doctorUserId },
      ...(input.from ? { scheduledStart: { gte: input.from } } : {}),
    },
    select: TELECONSULT_SUMMARY_SELECT,
    orderBy: [{ scheduledStart: "asc" }],
    take: Math.max(1, Math.min(input.limit ?? 100, 200)),
  });
}

const CLINICIAN_WORKSPACE_SELECT = {
  ...TELECONSULT_DETAIL_SELECT,
  consultationNotes: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      authorLabel: true,
      authorUserId: true,
      subjective: true,
      objective: true,
      assessment: true,
      plan: true,
      diagnosisSummary: true,
      followUpInstructions: true,
      followUpAfterDays: true,
      postConsultationInstructions: true,
      finalizedByLabel: true,
      finalizedAt: true,
      amendedFromId: true,
      amendmentReason: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  prescriptions: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      status: true,
      source: true,
      issuedOn: true,
      validUntil: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  },
} satisfies Prisma.AppointmentSelect;

export type ClinicianConsultation = Prisma.AppointmentGetPayload<{ select: typeof CLINICIAN_WORKSPACE_SELECT }>;

/**
 * The full consultation workspace for the treating clinician.
 *
 * Scoped by `doctorProfile.userId` in the query itself, so a clinician cannot
 * open another clinician's consultation by guessing an id — the row simply is
 * not returned.
 */
export async function getClinicianConsultation(input: {
  doctorUserId: string;
  appointmentId: string;
}): Promise<ClinicianConsultation | null> {
  return prisma.appointment.findFirst({
    where: { id: input.appointmentId, doctorProfile: { userId: input.doctorUserId } },
    select: CLINICIAN_WORKSPACE_SELECT,
  });
}

/** True only when this account is the treating clinician for the appointment. */
export async function isTreatingClinician(input: {
  doctorUserId: string;
  appointmentId: string;
}): Promise<boolean> {
  const count = await prisma.appointment.count({
    where: { id: input.appointmentId, doctorProfile: { userId: input.doctorUserId } },
  });
  return count > 0;
}

/** True only when this account is the patient on the appointment. */
export async function isAppointmentPatient(input: {
  userId: string;
  appointmentId: string;
}): Promise<boolean> {
  const count = await prisma.appointment.count({ where: { id: input.appointmentId, patientUserId: input.userId } });
  return count > 0;
}
