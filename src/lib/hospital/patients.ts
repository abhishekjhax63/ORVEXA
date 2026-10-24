import "server-only";

import type { BloodGroup, Gender, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  HOSPITAL_REFERENCE_PREFIX,
  formatScopedSequence,
  hospitalFail,
  hospitalOk,
  isUniqueViolation,
  type HospitalResult,
} from "@/lib/hospital/errors";
import { assertHospitalScope, recordHospitalRecordRead, type HospitalContext } from "@/lib/hospital/tenant";
import { recordAuditEvent } from "@/lib/security/audit";

/**
 * Patient registration and the hospital's own patient register.
 *
 * ## Why a hospital patient is not a `PatientProfile`
 *
 * A `PatientProfile` belongs to a person's ORVEXA account. A hospital
 * registration belongs to the hospital: the walk-in with no account, the
 * relative carrying somebody else's papers, the person whose identity the front
 * desk took down by hand. Those are different records and they are stored
 * differently, so nothing here reads or writes a person's own profile. The
 * optional `userId` link is the only bridge between the two.
 *
 * ## The medical record number
 *
 * The MRN is assigned by the hospital and unique only inside it — the schema's
 * `@@unique([hospitalId, mrn])` says exactly that, so two hospitals must both be
 * free to hold an "00001" without colliding. Numbers are allocated inside the
 * creating transaction, which is why two receptionists registering at the same
 * moment cannot be handed the same one.
 *
 * ## Duplicates
 *
 * Phone is the one field a front desk can check in a second, so a registration
 * that repeats a phone number already on the register is refused rather than
 * merged. This is a best-effort courtesy check, not a constraint: the same
 * person can legitimately hold two numbers, and whether a repeat is a duplicate
 * is the desk's call, not ours.
 */

// ---------------------------------------------------------------------------
// Selects and summary types
// ---------------------------------------------------------------------------

const PATIENT_SELECT = {
  id: true,
  mrn: true,
  fullName: true,
  dateOfBirth: true,
  approximateAgeYears: true,
  gender: true,
  bloodGroup: true,
  phone: true,
  email: true,
  city: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  allergies: true,
  chronicConditions: true,
  isDemo: true,
  createdAt: true,
} as const satisfies Prisma.HospitalPatientSelect;

/**
 * A patient as the register and search results show them. Derived from the
 * select, so the type can never advertise a column the query does not fetch.
 */
export type HospitalPatientSummary = Prisma.HospitalPatientGetPayload<{ select: typeof PATIENT_SELECT }>;

const PATIENT_DETAIL_SELECT = {
  ...PATIENT_SELECT,
  userId: true,
  addressLine1: true,
  state: true,
  postalCode: true,
  nationalIdLast4: true,
  notes: true,
  updatedAt: true,
} as const satisfies Prisma.HospitalPatientSelect;

export type HospitalPatientDetail = Prisma.HospitalPatientGetPayload<{ select: typeof PATIENT_DETAIL_SELECT }>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type RegisterHospitalPatientInput = {
  fullName: string;
  dateOfBirth?: Date | null;
  approximateAgeYears?: number | null;
  gender?: Gender | null;
  bloodGroup?: BloodGroup | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  /** Last four digits only; the register never holds the full identifier. */
  nationalIdLast4?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  allergies?: string[];
  chronicConditions?: string[];
  registrationSource?: string | null;
  notes?: string | null;
  /** Links the registration to an ORVEXA account, when the person has one. */
  userId?: string | null;
};

export type UpdateHospitalPatientInput = {
  fullName?: string;
  dateOfBirth?: Date | null;
  approximateAgeYears?: number | null;
  gender?: Gender | null;
  bloodGroup?: BloodGroup | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  nationalIdLast4?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  allergies?: string[];
  chronicConditions?: string[];
  notes?: string | null;
};

export type SearchHospitalPatientsInput = {
  query: string;
  limit?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The next MRN in this hospital's own sequence.
 *
 * Read as the highest number already issued and add one, inside the caller's
 * transaction, rather than counting rows: a count would re-issue a number after
 * a registration is removed from the active register.
 */
async function allocateMrn(tx: Prisma.TransactionClient, hospitalId: string): Promise<string> {
  const prefix = HOSPITAL_REFERENCE_PREFIX.mrn;
  const latest = await tx.hospitalPatient.findFirst({
    where: { hospitalId, mrn: { startsWith: `${prefix}-` } },
    orderBy: { mrn: "desc" },
    select: { mrn: true },
  });
  const lastSequence = latest ? Number.parseInt(latest.mrn.slice(prefix.length + 1), 10) : 0;
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  return formatScopedSequence(prefix, nextSequence, 5);
}

// ---------------------------------------------------------------------------
// Registration and lookup
// ---------------------------------------------------------------------------

export async function registerHospitalPatient(
  context: HospitalContext,
  input: RegisterHospitalPatientInput,
): Promise<HospitalResult<{ patientId: string; mrn: string }>> {
  const fullName = input.fullName.trim();
  if (!fullName) return hospitalFail("validation", "A patient must have a name.");

  const phone = trimOrNull(input.phone);

  // The courtesy duplicate check runs before the write so the desk sees the
  // existing registration rather than a raw constraint error.
  if (phone) {
    const existing = await prisma.hospitalPatient.findFirst({
      where: { hospitalId: context.hospitalId, phone, deletedAt: null },
      select: { fullName: true, mrn: true },
    });
    if (existing) {
      return hospitalFail(
        "duplicate",
        `${existing.fullName} is already registered here with this phone number (${existing.mrn}).`,
      );
    }
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const mrn = await allocateMrn(tx, context.hospitalId);
      return tx.hospitalPatient.create({
        data: {
          hospitalId: context.hospitalId,
          mrn,
          fullName,
          userId: input.userId ?? null,
          dateOfBirth: input.dateOfBirth ?? null,
          approximateAgeYears: input.approximateAgeYears ?? null,
          gender: input.gender ?? null,
          bloodGroup: input.bloodGroup ?? null,
          phone,
          email: trimOrNull(input.email),
          addressLine1: trimOrNull(input.addressLine1),
          city: trimOrNull(input.city),
          state: trimOrNull(input.state),
          postalCode: trimOrNull(input.postalCode),
          nationalIdLast4: trimOrNull(input.nationalIdLast4),
          emergencyContactName: trimOrNull(input.emergencyContactName),
          emergencyContactPhone: trimOrNull(input.emergencyContactPhone),
          allergies: input.allergies ?? [],
          chronicConditions: input.chronicConditions ?? [],
          registrationSource: input.registrationSource ?? null,
          registeredById: context.user.id,
          notes: input.notes ?? null,
        },
        select: { id: true, mrn: true },
      });
    });

    await recordAuditEvent({
      action: "hospital.patient_registered",
      entityType: "hospital_patient",
      entityId: created.id,
      actorUserId: context.user.id,
      hospitalId: context.hospitalId,
      metadata: { mrn: created.mrn, registrationSource: input.registrationSource ?? null },
    });

    return hospitalOk({ patientId: created.id, mrn: created.mrn });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return hospitalFail("duplicate", "A patient with that record number already exists. Please try again.");
    }
    throw error;
  }
}

/**
 * MRN, name and phone search, scoped to the caller's hospital.
 *
 * Only summaries are returned. A patient belonging to another hospital is not
 * merely hidden here — the `hospitalId` predicate means the query cannot reach
 * them at all.
 */
export async function searchHospitalPatients(
  context: HospitalContext,
  input: SearchHospitalPatientsInput,
): Promise<HospitalPatientSummary[]> {
  const term = input.query.trim();
  if (!term) return [];

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

  return prisma.hospitalPatient.findMany({
    where: {
      hospitalId: context.hospitalId,
      deletedAt: null,
      OR: [
        { mrn: { contains: term, mode: "insensitive" } },
        { fullName: { contains: term, mode: "insensitive" } },
        { phone: { contains: term } },
      ],
    },
    orderBy: [{ fullName: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: PATIENT_SELECT,
  });
}

/**
 * One patient by id.
 *
 * Fetched by primary key and then scope-checked, so a probe for another
 * hospital's patient is refused and written to the audit trail rather than
 * quietly resolving to nothing.
 */
export async function getHospitalPatient(
  context: HospitalContext,
  patientId: string,
): Promise<HospitalResult<HospitalPatientDetail>> {
  const scope = await prisma.hospitalPatient.findUnique({
    where: { id: patientId },
    select: { hospitalId: true },
  });
  if (!scope) return hospitalFail("not_found", "That patient was not found.");

  await assertHospitalScope({
    context,
    rowHospitalId: scope.hospitalId,
    entityType: "hospital_patient",
    entityId: patientId,
  });

  const patient = await prisma.hospitalPatient.findUnique({
    where: { id: patientId },
    select: PATIENT_DETAIL_SELECT,
  });
  if (!patient) return hospitalFail("not_found", "That patient was not found.");

  await recordHospitalRecordRead({
    context,
    entityType: "hospital_patient",
    entityId: patientId,
    metadata: { mrn: patient.mrn },
  });

  return hospitalOk(patient);
}

export async function updateHospitalPatient(
  context: HospitalContext,
  patientId: string,
  input: UpdateHospitalPatientInput,
): Promise<HospitalResult<{ patientId: string }>> {
  const scope = await prisma.hospitalPatient.findUnique({
    where: { id: patientId },
    select: { hospitalId: true },
  });
  if (!scope) return hospitalFail("not_found", "That patient was not found.");

  await assertHospitalScope({
    context,
    rowHospitalId: scope.hospitalId,
    entityType: "hospital_patient",
    entityId: patientId,
  });

  const data: Prisma.HospitalPatientUpdateInput = {};
  if (input.fullName !== undefined) {
    const fullName = input.fullName.trim();
    if (!fullName) return hospitalFail("validation", "A patient must have a name.");
    data.fullName = fullName;
  }
  if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth;
  if (input.approximateAgeYears !== undefined) data.approximateAgeYears = input.approximateAgeYears;
  if (input.gender !== undefined) data.gender = input.gender;
  if (input.bloodGroup !== undefined) data.bloodGroup = input.bloodGroup;
  if (input.phone !== undefined) data.phone = trimOrNull(input.phone);
  if (input.email !== undefined) data.email = trimOrNull(input.email);
  if (input.addressLine1 !== undefined) data.addressLine1 = trimOrNull(input.addressLine1);
  if (input.city !== undefined) data.city = trimOrNull(input.city);
  if (input.state !== undefined) data.state = trimOrNull(input.state);
  if (input.postalCode !== undefined) data.postalCode = trimOrNull(input.postalCode);
  if (input.nationalIdLast4 !== undefined) data.nationalIdLast4 = trimOrNull(input.nationalIdLast4);
  if (input.emergencyContactName !== undefined) {
    data.emergencyContactName = trimOrNull(input.emergencyContactName);
  }
  if (input.emergencyContactPhone !== undefined) {
    data.emergencyContactPhone = trimOrNull(input.emergencyContactPhone);
  }
  if (input.allergies !== undefined) data.allergies = input.allergies;
  if (input.chronicConditions !== undefined) data.chronicConditions = input.chronicConditions;
  if (input.notes !== undefined) data.notes = input.notes;

  if (Object.keys(data).length === 0) {
    return hospitalFail("validation", "There is nothing to update.");
  }

  await prisma.hospitalPatient.update({ where: { id: patientId }, data });

  await recordAuditEvent({
    action: "hospital.patient_updated",
    entityType: "hospital_patient",
    entityId: patientId,
    actorUserId: context.user.id,
    hospitalId: context.hospitalId,
    metadata: { fields: Object.keys(data) },
  });

  return hospitalOk({ patientId });
}

/**
 * How many patients the hospital's register holds.
 *
 * A plain stored-row count: one for every registration row that has not been
 * removed from the active register. It is not a headcount of people currently
 * in the building, and nothing labels it as one.
 */
export async function countHospitalPatients(context: HospitalContext): Promise<number> {
  return prisma.hospitalPatient.count({
    where: { hospitalId: context.hospitalId, deletedAt: null },
  });
}
