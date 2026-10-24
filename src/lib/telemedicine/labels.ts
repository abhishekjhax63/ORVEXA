import type {
  AppointmentEventType,
  AppointmentStatus,
  ConsultationMessageKind,
  ConsultationNoteStatus,
  TeleconsultationEventType,
  TeleconsultationStatus,
} from "@prisma/client";

/**
 * The copy tables the telemedicine surface renders from.
 *
 * Client-safe by construction (type-only Prisma import, no `server-only`, no
 * environment access), following `src/lib/diagnostics/labels.ts`. Every enum
 * value maps to a label, a sentence of plain detail and a tone the badge
 * component understands, so one component renders every state honestly.
 *
 * Two rules run through the wording:
 *
 *  - A state is never described as more advanced than it is. `READY` says a room
 *    is open, not that anyone is in it; `ACTIVE` is only ever reached from a
 *    signed provider callback, so the copy for it says the provider reported it.
 *  - A draft is never described as a clinical record. Only a finalised note is.
 */

export type CopyTone = "neutral" | "success" | "warning" | "emergency";

export type EnumCopy = { label: string; detail: string; tone: CopyTone };

export const TELECONSULT_STATUS_COPY: Record<TeleconsultationStatus, EnumCopy> = {
  SCHEDULED: {
    label: "Not opened yet",
    detail: "The appointment is booked. No consultation room has been opened for it yet.",
    tone: "neutral",
  },
  READY: {
    label: "Room open",
    detail: "The video provider confirmed the room exists. A join link can be used from the waiting room.",
    tone: "success",
  },
  ACTIVE: {
    label: "In progress",
    detail: "The video provider reported that the consultation is under way.",
    tone: "success",
  },
  ENDED: { label: "Ended", detail: "This consultation was closed.", tone: "neutral" },
  EXPIRED: {
    label: "Window passed",
    detail: "The room's window passed without the consultation being held.",
    tone: "warning",
  },
  FAILED: {
    label: "Could not open",
    detail: "The video provider refused or failed, so no room was opened. The appointment itself is unaffected.",
    tone: "emergency",
  },
  CANCELLED: {
    label: "Cancelled",
    detail: "This consultation session was cancelled. Its join links no longer work.",
    tone: "neutral",
  },
};

export const TELECONSULT_EVENT_COPY: Record<TeleconsultationEventType, EnumCopy> = {
  CREATED: { label: "Session created", detail: "A session was recorded for this appointment.", tone: "neutral" },
  ROOM_CONFIRMED: { label: "Room confirmed", detail: "The video provider confirmed the room exists.", tone: "success" },
  ROOM_FAILED: { label: "Room failed", detail: "The video provider did not open a room.", tone: "emergency" },
  JOIN_LINK_ISSUED: { label: "Join link issued", detail: "A short-lived join link was issued to a participant.", tone: "neutral" },
  WAITING_ROOM_ENTERED: { label: "Waiting room", detail: "A participant opened the waiting room.", tone: "neutral" },
  PATIENT_JOINED: { label: "Patient joined", detail: "The patient opened the consultation room.", tone: "success" },
  CLINICIAN_JOINED: { label: "Clinician joined", detail: "The clinician opened the consultation room.", tone: "success" },
  RECONNECTED: { label: "Reconnected", detail: "A participant rejoined after a disconnection.", tone: "warning" },
  DISCONNECTED: { label: "Disconnected", detail: "A participant's connection dropped.", tone: "warning" },
  ENDED: { label: "Ended", detail: "The consultation session was closed.", tone: "neutral" },
  EXPIRED: { label: "Expired", detail: "The room's window passed.", tone: "warning" },
  CANCELLED: { label: "Cancelled", detail: "This session was cancelled.", tone: "neutral" },
  NOTE: { label: "Note", detail: "A note was added to the session.", tone: "neutral" },
};

export const CONSULTATION_NOTE_STATUS_COPY: Record<ConsultationNoteStatus, EnumCopy> = {
  DRAFT: {
    label: "Draft",
    detail: "Written by the clinician and not finalised. A draft is never shown to the patient.",
    tone: "warning",
  },
  FINALIZED: {
    label: "Finalised",
    detail: "A verified clinician signed this note. It is the clinical record for the consultation.",
    tone: "success",
  },
  AMENDED: {
    label: "Amended",
    detail: "This note corrects an earlier finalised note. The reason for the correction is shown with it.",
    tone: "warning",
  },
};

export const CONSULTATION_MESSAGE_KIND_COPY: Record<ConsultationMessageKind, EnumCopy> = {
  TEXT: { label: "Message", detail: "A message sent inside the consultation.", tone: "neutral" },
  SYSTEM: { label: "System", detail: "A notice written by the platform, not by a person.", tone: "neutral" },
  INSTRUCTION: {
    label: "Instruction",
    detail: "An instruction from the clinician. It is not a prescription.",
    tone: "warning",
  },
  ATTACHMENT: { label: "Attachment", detail: "A file shared inside the consultation.", tone: "neutral" },
};

export const TELECONSULT_APPOINTMENT_COPY: Record<AppointmentStatus, EnumCopy> = {
  PENDING: {
    label: "Awaiting confirmation",
    detail: "The clinician has not confirmed this virtual appointment yet.",
    tone: "warning",
  },
  CONFIRMED: { label: "Confirmed", detail: "The clinician confirmed this virtual appointment.", tone: "success" },
  COMPLETED: { label: "Completed", detail: "This consultation has been completed.", tone: "neutral" },
  CANCELLED: { label: "Cancelled", detail: "This appointment was cancelled.", tone: "neutral" },
  NO_SHOW: {
    label: "Not attended",
    detail: "The clinician recorded that the consultation did not take place.",
    tone: "emergency",
  },
};

/**
 * The appointment's own event log, which is a different record from the video
 * session's. Read together, they are what happened to the booking and what the
 * video provider confirmed — kept apart because they are written by different
 * things.
 */
export const APPOINTMENT_EVENT_COPY: Record<AppointmentEventType, EnumCopy> = {
  CREATED: { label: "Requested", detail: "The consultation was requested.", tone: "neutral" },
  CONFIRMED: { label: "Confirmed", detail: "The clinician confirmed the consultation.", tone: "success" },
  RESCHEDULED: { label: "Rescheduled", detail: "The consultation time was changed.", tone: "warning" },
  CANCELLED: { label: "Cancelled", detail: "The consultation was cancelled.", tone: "neutral" },
  COMPLETED: { label: "Completed", detail: "The consultation was completed.", tone: "neutral" },
  NO_SHOW: { label: "Not attended", detail: "The clinician recorded that the consultation did not take place.", tone: "emergency" },
  NOTES_UPDATED: { label: "Notes updated", detail: "The record for this consultation was updated.", tone: "neutral" },
  REMINDER_QUEUED: { label: "Reminder queued", detail: "A reminder was scheduled for this consultation.", tone: "neutral" },
};

/** The forward steps of a virtual appointment, for a progress timeline. */
export const TELECONSULT_TIMELINE: readonly { title: string; description: string }[] = [
  { title: "Booked", description: "You choose a time and consent to a virtual consultation." },
  { title: "Confirmed", description: "The clinician confirms the appointment." },
  { title: "Waiting room", description: "A join link is issued shortly before the appointment." },
  { title: "Consultation", description: "You and the clinician meet in the secure room." },
  { title: "Notes & prescription", description: "The clinician finalises the note and issues any prescription." },
];

/** Version of the virtual-consultation consent text. */
export const TELEMEDICINE_CONSENT_POLICY_VERSION = "orvexa.telemedicine-consultation.v1";

export const TELEMEDICINE_CONSENT_STATEMENT =
  "I consent to consulting this clinician by video or chat, to a secure session being opened for it, and to the clinician " +
  "recording a clinical note against this consultation. I understand a virtual consultation has limits — the clinician may " +
  "ask me to attend in person or to seek urgent care, and I will say so if my condition changes before the appointment.";

/**
 * Version of the consent text that covers issuing a prescription from a
 * consultation. Deliberately separate from the consultation consent: agreeing
 * to be seen virtually is not the same as agreeing to be prescribed for.
 */
export const CONSULTATION_PRESCRIPTION_CONSENT_POLICY_VERSION = "orvexa.consultation-prescription.v1";

export const CONSULTATION_PRESCRIPTION_CONSENT_STATEMENT =
  "I confirm I have assessed this patient in this consultation and that the medicines written below are appropriate for " +
  "them as I have recorded them. I understand ORVEXA stores and delivers this prescription and never substitutes or " +
  "changes a medicine on its own.";

/**
 * The platform's standing statement about virtual consultations.
 *
 * Rendered beside every consultation surface, so the boundary travels with the
 * information wherever it is shown.
 */
export const TELEMEDICINE_DISCIPLINE_NOTICE =
  "A virtual consultation is held between you and the clinician on a third-party video service that ORVEXA does not " +
  "control and cannot record on your behalf. ORVEXA opens the room, delivers the clinical record and never writes it. " +
  "A consultation is not a substitute for emergency care: if you have severe or worsening symptoms, call emergency " +
  "services instead of waiting for an appointment.";

/** Shown on every sandbox session. The wording is load-bearing. */
export const SANDBOX_SESSION_NOTICE =
  "This is a sandbox session. No video provider is configured on this deployment, so no call can be placed and no " +
  "consultation takes place — the booking, waiting-room, note and follow-up workflow is exercised only.";

/** Version of the telemedicine policy the console states it follows. */
export const TELEMEDICINE_POLICY_VERSION = "orvexa.telemedicine.v1";

export const TELEMEDICINE_POLICY_STATEMENT =
  "Virtual consultations on ORVEXA follow the applicable Indian telemedicine practice requirements: the prescribing " +
  "clinician is registered and verified before any consultation, the clinician records a note for every consultation, " +
  "and a prescription issued here always names the prescriber and their registration number.";
