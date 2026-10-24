import { z } from "zod";

import type {
  ConsultationMessageKind,
  ConsultationNoteStatus,
  TeleconsultationEventType,
  TeleconsultationStatus,
  VideoProviderKind,
} from "@prisma/client";

/**
 * Validation for everything that reaches the telemedicine domain.
 *
 * The enum value lists are declared here as literal tuples and checked against
 * the Prisma enums with `satisfies`, so the compiler fails if the database and
 * the API drift apart — while the `import type` keeps Prisma out of any client
 * bundle that also loads these schemas for inline validation.
 *
 * ## Session state
 *
 * No schema here lets a client declare a call connected, ended or failed. A
 * session moves only through the server's own session service, and only the
 * video provider's confirmed response (or its signed webhook) may mark a real
 * room ready or active. A sandbox session is stamped `isSandbox` and can never
 * present itself as a real consultation.
 *
 * ## Clinical acts
 *
 * A note or a prescription is only valid once a verified clinician finalised or
 * issued it. The schemas below carry the clinician's content; the permission
 * check and the "who did it, when" stamping live in the service, never in the
 * request body.
 */

// ---------------------------------------------------------------------------
// Literal enum tuples
// ---------------------------------------------------------------------------

export const VIDEO_PROVIDER_KINDS = ["DAILY", "SANDBOX"] as const satisfies readonly VideoProviderKind[];

export const TELECONSULTATION_STATUSES = [
  "SCHEDULED",
  "READY",
  "ACTIVE",
  "ENDED",
  "EXPIRED",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly TeleconsultationStatus[];

export const TELECONSULTATION_EVENT_TYPES = [
  "CREATED",
  "ROOM_CONFIRMED",
  "ROOM_FAILED",
  "JOIN_LINK_ISSUED",
  "WAITING_ROOM_ENTERED",
  "PATIENT_JOINED",
  "CLINICIAN_JOINED",
  "RECONNECTED",
  "DISCONNECTED",
  "ENDED",
  "EXPIRED",
  "CANCELLED",
  "NOTE",
] as const satisfies readonly TeleconsultationEventType[];

export const CONSULTATION_NOTE_STATUSES = [
  "DRAFT",
  "FINALIZED",
  "AMENDED",
] as const satisfies readonly ConsultationNoteStatus[];

export const CONSULTATION_MESSAGE_KINDS = [
  "TEXT",
  "SYSTEM",
  "INSTRUCTION",
  "ATTACHMENT",
] as const satisfies readonly ConsultationMessageKind[];

/** Kinds a patient or clinician may post. `SYSTEM` is server-authored only. */
export const POSTABLE_MESSAGE_KINDS = [
  "TEXT",
  "ATTACHMENT",
] as const satisfies readonly ConsultationMessageKind[];

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const checkboxBoolean = z.preprocess(
  (value) => value === true || value === "true" || value === "on" || value === "1",
  z.boolean(),
);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value));

const requiredText = (max: number, min = 2) => z.string().trim().min(min).max(max);

/** An ISO-8601 instant, used for every appointment time. */
const isoInstant = z
  .string()
  .trim()
  .min(10)
  .max(40)
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "Enter a valid date and time.");

const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/**
 * The video provider a session is created against is chosen by the server from
 * configuration; this tuple exists only so the portal can render the bias
 * honestly. It is never accepted as a "pretend this is live" flag.
 */
export const videoProviderPreferenceSchema = z.enum(VIDEO_PROVIDER_KINDS).optional();

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export const teleconsultBookingSchema = z.object({
  doctorProfileId: requiredText(64, 1),
  scheduledAt: isoInstant,
  /** Only `TELEMEDICINE` is a valid mode for this endpoint. */
  reason: optionalText(500),
  familyMemberId: optionalId,
  patientNotes: optionalText(1000),
  /** Explicit consent to a virtual consultation and its recording rules. */
  consentAcknowledged: checkboxBoolean,
  consentPolicyVersion: requiredText(80, 1),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export type TeleconsultBookingInput = z.infer<typeof teleconsultBookingSchema>;

export const teleconsultRescheduleSchema = z.object({
  appointmentId: requiredText(64, 1),
  scheduledAt: isoInstant,
  reason: optionalText(500),
});

export type TeleconsultRescheduleInput = z.infer<typeof teleconsultRescheduleSchema>;

export const teleconsultCancelSchema = z.object({
  appointmentId: requiredText(64, 1),
  reason: requiredText(500, 4),
});

export type TeleconsultCancelInput = z.infer<typeof teleconsultCancelSchema>;

export const followUpBookingSchema = z.object({
  /** The completed consultation the follow-up follows. */
  parentAppointmentId: requiredText(64, 1),
  doctorProfileId: requiredText(64, 1),
  scheduledAt: isoInstant,
  reason: optionalText(500),
  patientNotes: optionalText(1000),
  consentAcknowledged: checkboxBoolean,
  consentPolicyVersion: requiredText(80, 1),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export type FollowUpBookingInput = z.infer<typeof followUpBookingSchema>;

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export const sessionCreateSchema = z.object({
  appointmentId: requiredText(64, 1),
  /** A hint only; the server falls back to configuration and may ignore it. */
  providerPreference: videoProviderPreferenceSchema,
});

export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;

export const sessionJoinSchema = z.object({
  appointmentId: requiredText(64, 1),
});

export type SessionJoinInput = z.infer<typeof sessionJoinSchema>;

export const sessionEndSchema = z.object({
  appointmentId: requiredText(64, 1),
  reason: optionalText(400),
});

export type SessionEndInput = z.infer<typeof sessionEndSchema>;

// ---------------------------------------------------------------------------
// Consultation notes
// ---------------------------------------------------------------------------

/** A draft may be partial. Finalisation adds the stricter checks in the service. */
export const consultationNoteDraftSchema = z.object({
  appointmentId: requiredText(64, 1),
  noteId: optionalId,
  subjective: optionalText(8000),
  objective: optionalText(8000),
  assessment: optionalText(8000),
  plan: optionalText(8000),
  diagnosisSummary: optionalText(2000),
  followUpInstructions: optionalText(4000),
  followUpAfterDays: z.coerce.number().int().min(0).max(3650).optional(),
  postConsultationInstructions: optionalText(4000),
});

export type ConsultationNoteDraftInput = z.infer<typeof consultationNoteDraftSchema>;

/**
 * Finalisation. The service additionally requires a verified clinician treating
 * the appointment, and at least an assessment or a plan to exist.
 */
export const consultationNoteFinalizeSchema = z.object({
  appointmentId: requiredText(64, 1),
  noteId: requiredText(64, 1),
});

export type ConsultationNoteFinalizeInput = z.infer<typeof consultationNoteFinalizeSchema>;

export const consultationNoteAmendSchema = z.object({
  appointmentId: requiredText(64, 1),
  noteId: requiredText(64, 1),
  reason: requiredText(500, 4),
  assessment: optionalText(8000),
  plan: optionalText(8000),
  followUpInstructions: optionalText(4000),
});

export type ConsultationNoteAmendInput = z.infer<typeof consultationNoteAmendSchema>;

// ---------------------------------------------------------------------------
// Prescriptions issued from a consultation
// ---------------------------------------------------------------------------

/**
 * A medicine line as the clinician writes it. The platform records the line and
 * links it to a catalogue product only when a human matches it; it never
 * substitutes a medicine on its own.
 */
export const consultationPrescriptionItemSchema = z.object({
  prescribedName: requiredText(200, 2),
  strengthLabel: optionalText(80),
  dosageForm: optionalText(80),
  frequency: optionalText(120),
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
  quantity: z.coerce.number().int().min(1).max(100_000).optional(),
  instructions: optionalText(500),
});

export type ConsultationPrescriptionItemInput = z.infer<typeof consultationPrescriptionItemSchema>;

export const consultationPrescriptionSchema = z.object({
  appointmentId: requiredText(64, 1),
  /** At least one medicine: an empty prescription is not a prescription. */
  items: z.array(consultationPrescriptionItemSchema).min(1).max(40),
  patientNotes: optionalText(2000),
  validForDays: z.coerce.number().int().min(1).max(365).optional().default(30),
  consentAcknowledged: checkboxBoolean,
  consentPolicyVersion: requiredText(80, 1),
});

export type ConsultationPrescriptionInput = z.infer<typeof consultationPrescriptionSchema>;

// ---------------------------------------------------------------------------
// Consultation chat
// ---------------------------------------------------------------------------

export const consultationMessageSchema = z
  .object({
    appointmentId: requiredText(64, 1),
    kind: z.enum(POSTABLE_MESSAGE_KINDS).optional().default("TEXT"),
    body: requiredText(4000, 1),
    attachmentKey: optionalText(400),
    attachmentName: optionalText(200),
  })
  .refine(
    (value) => value.kind !== "ATTACHMENT" || Boolean(value.attachmentKey),
    { message: "An attachment needs an uploaded file.", path: ["attachmentKey"] },
  );

export type ConsultationMessageInput = z.infer<typeof consultationMessageSchema>;

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const teleconsultAvailabilitySchema = z.object({
  doctorProfileId: requiredText(64, 1),
  /** `YYYY-MM-DD` window start; the service expands the doctor's weekly schedule. */
  fromDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date as YYYY-MM-DD."),
  days: z.coerce.number().int().min(1).max(31).optional().default(14),
});

export type TeleconsultAvailabilityInput = z.infer<typeof teleconsultAvailabilitySchema>;

/**
 * What a consultation reference looks like, e.g. ORV-7QK4M2. Validated before a
 * reference taken from a URL reaches any lookup.
 */
export const teleconsultReferenceSchema = z
  .string()
  .trim()
  .regex(/^ORV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, "That is not a valid consultation reference.");

export type TeleconsultReferenceInput = z.infer<typeof teleconsultReferenceSchema>;
