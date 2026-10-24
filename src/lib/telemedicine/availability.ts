import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Doctor availability for virtual consultations.
 *
 * ## Why a schedule is expanded here rather than materialised up front
 *
 * A telemedicine clinic's week is expressed as a `DoctorSchedule` row per
 * weekday. Expanding it on read means a clinician who shortens a clinic
 * tomorrow changes what is bookable tomorrow, without a backfill job and
 * without leaving orphaned slots behind. Materialisation is still used for the
 * *claim*: booking writes an `AppointmentSlot` and claims it with a conditional
 * update, which is what makes two concurrent requests unable to both succeed.
 *
 * ## The timezone, stated plainly
 *
 * Clinic times (`09:30`, `18:00`) are wall-clock times in India. India has a
 * single timezone and no daylight saving, so a wall-clock time converts to an
 * instant by subtracting a fixed 5 hours 30 minutes — no timezone database is
 * needed and the conversion cannot drift with a runtime's tz data. Everything
 * stored and returned is an absolute instant.
 *
 * ## What is never offered
 *
 * A slot is not offered when the clinician is not enabled for telemedicine, is
 * not verified, is not accepting patients, has no schedule for that weekday, is
 * within the minimum lead time, is already taken by a live appointment, or is
 * blocked by the clinician. Nothing here invents a time the clinician did not
 * publish.
 */

/** India Standard Time is UTC+05:30, with no daylight saving. */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Nobody may book a consultation starting in the next half hour. */
export const MIN_LEAD_MS = 30 * 60 * 1000;

const MAX_SLOTS = 400;

// ---------------------------------------------------------------------------
// Calendar arithmetic
// ---------------------------------------------------------------------------

const DATE_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type CalendarDate = { year: number; month: number; day: number };

function parseDateIso(value: string): CalendarDate | null {
  const match = DATE_ISO_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** The Indian calendar date an instant falls on. */
export function istDateIso(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDaysIso(dateIso: string, days: number): string | null {
  const parsed = parseDateIso(dateIso);
  if (!parsed) return null;
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day) + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for an Indian calendar date. */
export function dayOfWeekForIso(dateIso: string): number | null {
  const parsed = parseDateIso(dateIso);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

/** `09:30` → 570. Returns null for anything that is not a clock time. */
export function parseClockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** An Indian wall-clock time on a calendar date, as an absolute instant. */
export function istWallClockToInstant(dateIso: string, minutesOfDay: number): Date | null {
  const parsed = parseDateIso(dateIso);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day) + minutesOfDay * 60_000 - IST_OFFSET_MS);
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

export type TeleconsultScheduleInput = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
};

export type TeleconsultSlot = {
  startAt: Date;
  endAt: Date;
  scheduleId: string;
  /** Label shown to the patient, in IST, e.g. `09:30`. */
  label: string;
};

function istClockLabel(minutesOfDay: number): string {
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Expands a clinician's telemedicine week into concrete instants.
 *
 * Pure: it takes schedules and a window and returns candidate times. Whether
 * each one is free is decided by the caller, which knows about appointments.
 */
export function expandTeleconsultSchedules(input: {
  schedules: readonly TeleconsultScheduleInput[];
  fromDate: string;
  days: number;
  now: Date;
  minLeadMs?: number;
  maxSlots?: number;
}): TeleconsultSlot[] {
  const minLead = input.minLeadMs ?? MIN_LEAD_MS;
  const cap = input.maxSlots ?? MAX_SLOTS;
  const earliest = new Date(input.now.getTime() + minLead);
  const slots: TeleconsultSlot[] = [];

  for (let offset = 0; offset < input.days; offset += 1) {
    const dateIso = addDaysIso(input.fromDate, offset);
    if (!dateIso) continue;
    const dayOfWeek = dayOfWeekForIso(dateIso);
    if (dayOfWeek === null) continue;

    for (const schedule of input.schedules) {
      if (schedule.dayOfWeek !== dayOfWeek) continue;
      if (schedule.effectiveFrom && schedule.effectiveFrom.getTime() > input.now.getTime()) continue;

      const startMinutes = parseClockMinutes(schedule.startTime);
      const endMinutes = parseClockMinutes(schedule.endTime);
      if (startMinutes === null || endMinutes === null) continue;
      const step = schedule.slotMinutes > 0 ? schedule.slotMinutes : 15;
      if (endMinutes <= startMinutes) continue;

      for (let minutes = startMinutes; minutes + step <= endMinutes; minutes += step) {
        const startAt = istWallClockToInstant(dateIso, minutes);
        const endAt = istWallClockToInstant(dateIso, minutes + step);
        if (!startAt || !endAt) continue;
        if (startAt.getTime() < earliest.getTime()) continue;
        if (schedule.effectiveTo && startAt.getTime() > schedule.effectiveTo.getTime()) continue;
        slots.push({
          startAt,
          endAt,
          scheduleId: schedule.id,
          label: istClockLabel(minutes),
        });
        if (slots.length >= cap) return slots;
      }
    }
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const TELEMEDICINE_SCHEDULE_SELECT = {
  id: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  slotMinutes: true,
  effectiveFrom: true,
  effectiveTo: true,
} satisfies Prisma.DoctorScheduleSelect;

export type TeleconsultDoctorSummary = {
  id: string;
  fullName: string;
  specialties: string[];
  languages: string[];
  qualifications: string[];
  yearsOfExperience: number | null;
  headline: string | null;
  teleconsultFeeInr: number | null;
  registrationNumber: string;
  verified: boolean;
};

export type TeleconsultAvailabilityResult =
  | {
      ok: true;
      doctor: TeleconsultDoctorSummary;
      slots: TeleconsultSlot[];
      windowStart: string;
      windowDays: number;
    }
  | { ok: false; code: "doctor_not_found" | "teleconsult_disabled"; message: string };

const DISABLED_MESSAGE =
  "This clinician does not offer virtual consultations on ORVEXA. Choose another clinician or book an in-person visit.";

export async function listTeleconsultAvailability(input: {
  doctorProfileId: string;
  fromDate: string;
  days: number;
  now?: Date;
}): Promise<TeleconsultAvailabilityResult> {
  const now = input.now ?? new Date();

  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: input.doctorProfileId },
    select: {
      id: true,
      registrationNumber: true,
      headline: true,
      qualifications: true,
      specialties: true,
      languages: true,
      yearsOfExperience: true,
      teleconsultFeeInr: true,
      teleconsultEnabled: true,
      acceptingNewPatients: true,
      verificationStatus: true,
      user: { select: { fullName: true, status: true } },
    },
  });

  if (!doctor || doctor.user.status !== "ACTIVE") {
    return { ok: false, code: "doctor_not_found", message: "That clinician was not found." };
  }
  if (doctor.verificationStatus !== "VERIFIED" || !doctor.teleconsultEnabled) {
    return { ok: false, code: "teleconsult_disabled", message: DISABLED_MESSAGE };
  }

  const schedules = await prisma.doctorSchedule.findMany({
    where: { doctorProfileId: doctor.id, isActive: true, mode: "TELEMEDICINE" },
    select: TELEMEDICINE_SCHEDULE_SELECT,
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  const doctorSummary: TeleconsultDoctorSummary = {
    id: doctor.id,
    fullName: doctor.user.fullName,
    specialties: doctor.specialties,
    languages: doctor.languages,
    qualifications: doctor.qualifications,
    yearsOfExperience: doctor.yearsOfExperience,
    headline: doctor.headline,
    teleconsultFeeInr: doctor.teleconsultFeeInr,
    registrationNumber: doctor.registrationNumber,
    verified: doctor.verificationStatus === "VERIFIED",
  };

  // A clinician who is not taking new patients has no bookable slots; the
  // clinician is still returned so the page can say so rather than 404.
  if (!doctor.acceptingNewPatients) {
    return { ok: true, doctor: doctorSummary, slots: [], windowStart: input.fromDate, windowDays: input.days };
  }

  const candidates = expandTeleconsultSchedules({
    schedules,
    fromDate: input.fromDate,
    days: input.days,
    now,
  });
  const slots = await dropUnavailableTeleconsultSlots({ doctorProfileId: doctor.id, slots: candidates });

  return { ok: true, doctor: doctorSummary, slots, windowStart: input.fromDate, windowDays: input.days };
}

/**
 * Removes every candidate that is genuinely unavailable.
 *
 * An appointment in any state other than CANCELLED or NO_SHOW occupies its
 * time. A slot the clinician has explicitly blocked is removed too, so a
 * blocked slot can never be booked even when the schedule still covers it.
 */
export async function dropUnavailableTeleconsultSlots(input: {
  doctorProfileId: string;
  slots: readonly TeleconsultSlot[];
}): Promise<TeleconsultSlot[]> {
  if (input.slots.length === 0) return [];

  const first = input.slots[0].startAt;
  const last = input.slots[input.slots.length - 1].endAt;

  const [taken, blocked] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        doctorProfileId: input.doctorProfileId,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        scheduledStart: { lt: last },
        scheduledEnd: { gt: first },
      },
      select: { scheduledStart: true, scheduledEnd: true },
    }),
    prisma.appointmentSlot.findMany({
      where: {
        doctorProfileId: input.doctorProfileId,
        status: { in: ["BLOCKED", "BOOKED"] },
        startAt: { gte: first, lt: last },
      },
      select: { startAt: true },
    }),
  ]);

  const blockedStarts = new Set(blocked.map((entry) => entry.startAt.getTime()));

  return input.slots.filter((slot) => {
    if (blockedStarts.has(slot.startAt.getTime())) return false;
    return !taken.some(
      (appointment) =>
        appointment.scheduledStart.getTime() < slot.endAt.getTime() &&
        appointment.scheduledEnd.getTime() > slot.startAt.getTime(),
    );
  });
}

export type TeleconsultSlotCheck =
  | { ok: true; endAt: Date; scheduleId: string }
  | { ok: false; code: "outside_schedule" | "slot_taken"; message: string };

/**
 * Verifies a requested time is one the clinician actually published and is
 * still free. Called from inside the booking transaction, so the answer is the
 * one the write is based on rather than one read a moment earlier.
 */
export async function checkTeleconsultSlot(input: {
  doctorProfileId: string;
  startAt: Date;
  now?: Date;
}): Promise<TeleconsultSlotCheck> {
  const now = input.now ?? new Date();
  if (input.startAt.getTime() < now.getTime() + MIN_LEAD_MS) {
    return {
      ok: false,
      code: "outside_schedule",
      message: "That time is too soon to book. Choose a time at least half an hour from now.",
    };
  }

  const dateIso = istDateIso(input.startAt);
  const schedules = await prisma.doctorSchedule.findMany({
    where: { doctorProfileId: input.doctorProfileId, isActive: true, mode: "TELEMEDICINE" },
    select: TELEMEDICINE_SCHEDULE_SELECT,
  });

  const candidates = expandTeleconsultSchedules({
    schedules,
    fromDate: dateIso,
    days: 1,
    now: new Date(0),
    minLeadMs: 0,
    maxSlots: 24 * 60,
  });

  const match = candidates.find((slot) => slot.startAt.getTime() === input.startAt.getTime());
  if (!match) {
    return {
      ok: false,
      code: "outside_schedule",
      message: "That time is not part of this clinician's published telemedicine clinic. Pick one of the offered times.",
    };
  }

  const [taken, blocked] = await Promise.all([
    prisma.appointment.findFirst({
      where: {
        doctorProfileId: input.doctorProfileId,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        scheduledStart: { lt: match.endAt },
        scheduledEnd: { gt: match.startAt },
      },
      select: { id: true },
    }),
    prisma.appointmentSlot.findFirst({
      where: {
        doctorProfileId: input.doctorProfileId,
        startAt: match.startAt,
        status: { in: ["BLOCKED", "BOOKED"] },
      },
      select: { id: true },
    }),
  ]);

  if (taken || blocked) {
    return {
      ok: false,
      code: "slot_taken",
      message: "That time has just been taken. Choose another time from the list.",
    };
  }

  return { ok: true, endAt: match.endAt, scheduleId: match.scheduleId };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export type TeleconsultDoctorListing = TeleconsultDoctorSummary & {
  /** False when the clinician is enabled but has published no telemedicine clinic yet. */
  hasPublishedClinic: boolean;
};

/**
 * Clinicians a patient may book virtually.
 *
 * Only verified clinicians who have switched telemedicine on and are accepting
 * patients appear. A clinician who is enabled but has published no telemedicine
 * clinic is still returned, flagged, so the page can say "no times published"
 * rather than showing an empty search that looks broken.
 */
export async function searchTeleconsultDoctors(input: {
  query?: string;
  limit?: number;
}): Promise<TeleconsultDoctorListing[]> {
  const query = input.query?.trim();

  const doctors = await prisma.doctorProfile.findMany({
    where: {
      teleconsultEnabled: true,
      verificationStatus: "VERIFIED",
      acceptingNewPatients: true,
      user: { status: "ACTIVE" },
      ...(query
        ? {
            OR: [
              { user: { fullName: { contains: query, mode: "insensitive" } } },
              { specialties: { has: query } },
              { headline: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      registrationNumber: true,
      headline: true,
      qualifications: true,
      specialties: true,
      languages: true,
      yearsOfExperience: true,
      teleconsultFeeInr: true,
      verificationStatus: true,
      user: { select: { fullName: true } },
      schedules: { where: { isActive: true, mode: "TELEMEDICINE" }, select: { id: true }, take: 1 },
    },
    orderBy: [{ verifiedAt: "desc" }, { yearsOfExperience: "desc" }],
    take: Math.max(1, Math.min(input.limit ?? 40, 60)),
  });

  return doctors.map((doctor) => ({
    id: doctor.id,
    fullName: doctor.user.fullName,
    specialties: doctor.specialties,
    languages: doctor.languages,
    qualifications: doctor.qualifications,
    yearsOfExperience: doctor.yearsOfExperience,
    headline: doctor.headline,
    teleconsultFeeInr: doctor.teleconsultFeeInr,
    registrationNumber: doctor.registrationNumber,
    verified: doctor.verificationStatus === "VERIFIED",
    hasPublishedClinic: doctor.schedules.length > 0,
  }));
}
