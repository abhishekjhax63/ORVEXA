import "server-only";

import type { AppointmentStatus, ConsultationMode } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Who may act as the clinician on a consultation.
 *
 * Every clinical act — finalising a note, issuing a prescription, controlling
 * the room — resolves the acting account through this one function, so there is
 * a single definition of "the treating clinician" rather than one per feature.
 *
 * The appointment is read from the database and the clinician is identified by
 * `doctorProfile.userId`. Nothing about the requester's role is taken from the
 * request, and the appointment id in the body is only ever a lookup key: an id
 * belonging to another clinician's appointment resolves to a refusal, never to
 * that appointment.
 *
 * A clinical act additionally requires the clinician to be verified on ORVEXA.
 * An unverified profile may hold the DOCTOR role and still browse, but it
 * cannot sign a note or issue a prescription, because both are attributed to a
 * registered practitioner.
 */

export type ClinicianErrorCode =
  | "not_found"
  | "not_treating_clinician"
  | "clinician_not_verified"
  | "appointment_closed";

export class ClinicianFailure extends Error {
  readonly code: ClinicianErrorCode;

  constructor(code: ClinicianErrorCode, message: string) {
    super(message);
    this.name = "ClinicianFailure";
    this.code = code;
  }
}

export type TreatingClinicianContext = {
  appointmentId: string;
  appointmentReference: string;
  appointmentStatus: AppointmentStatus;
  appointmentMode: ConsultationMode;
  doctorProfileId: string;
  fullName: string;
  registrationNumber: string;
  registrationCouncil: string | null;
  /** The clinician's primary active affiliation, when one is on record. */
  clinicName: string | null;
  patientUserId: string;
  patientName: string;
};

/**
 * Resolves the treating clinician, or fails with a reason the caller can show.
 *
 * `requireVerified` defaults to true because the callers are clinical acts. The
 * consultation workspace read passes false: reading the appointment you are
 * treating is not a clinical act, and a clinician locked out of their own
 * schedule would have no way to see why verification is pending.
 */
export async function assertTreatingClinician(input: {
  userId: string;
  appointmentId: string;
  requireVerified?: boolean;
}): Promise<TreatingClinicianContext> {
  const requireVerified = input.requireVerified ?? true;

  const appointment = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    select: {
      id: true,
      reference: true,
      status: true,
      mode: true,
      patientUserId: true,
      patient: { select: { fullName: true } },
      doctorProfile: {
        select: {
          id: true,
          userId: true,
          registrationNumber: true,
          registrationCouncil: true,
          verificationStatus: true,
          user: { select: { fullName: true, status: true } },
          affiliations: {
            where: { isActive: true },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { hospital: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!appointment) {
    throw new ClinicianFailure("not_found", "That consultation was not found.");
  }

  const doctor = appointment.doctorProfile;
  if (doctor.userId !== input.userId) {
    throw new ClinicianFailure(
      "not_treating_clinician",
      "Only the clinician treating this consultation can act on it.",
    );
  }

  if (appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
    throw new ClinicianFailure(
      "appointment_closed",
      "This consultation was cancelled, so no clinical record can be added to it.",
    );
  }

  if (requireVerified && (doctor.verificationStatus !== "VERIFIED" || doctor.user.status !== "ACTIVE")) {
    throw new ClinicianFailure(
      "clinician_not_verified",
      "Your clinician profile is not verified on ORVEXA, so a clinical act cannot be signed from this account.",
    );
  }

  return {
    appointmentId: appointment.id,
    appointmentReference: appointment.reference,
    appointmentStatus: appointment.status,
    appointmentMode: appointment.mode,
    doctorProfileId: doctor.id,
    fullName: doctor.user.fullName,
    registrationNumber: doctor.registrationNumber,
    registrationCouncil: doctor.registrationCouncil,
    clinicName: doctor.affiliations[0]?.hospital.name ?? null,
    patientUserId: appointment.patientUserId,
    patientName: appointment.patient.fullName,
  };
}
