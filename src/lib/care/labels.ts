import type {
  AllergySeverity,
  CareProgramKind,
  CareProgramStatus,
  CareReminderChannel,
  CareReminderStatus,
  CareServiceCategory,
  CareServiceDeliveryMode,
  CareServiceRequestStatus,
  CaregiverAccessStatus,
  CaregiverScope,
  EducationResourceCategory,
  FamilyRelationship,
  HealthDeviceConnectionStatus,
  HealthDeviceIntegrationMode,
  HealthDeviceProvider,
  HealthDeviceSyncStatus,
  HealthDocumentKind,
  HealthDocumentStatus,
  HealthRecordSource,
  HealthTimelineEventKind,
  MedicalHistoryCategory,
  MedicationDoseStatus,
  MedicationScheduleStatus,
  MentalWellnessResourceKind,
  PreventiveCareKind,
  PreventiveCareStatus,
  ReminderDispatchOutcome,
  ReminderKind,
  ReminderScheduleKind,
  ServiceFeedbackStatus,
  ServiceFeedbackSubject,
  SupportedLanguage,
  SupportTicketCategory,
  SupportTicketSeverity,
  SupportTicketStatus,
  WellnessCategory,
  WellnessGoalCadence,
  WellnessGoalStatus,
  WellnessUnit,
} from "@prisma/client";

/**
 * The copy tables the patient care and wellness surface renders from.
 *
 * Client-safe by construction (type-only Prisma import, no `server-only`, no
 * environment access), following `src/lib/diagnostics/labels.ts`. Every enum
 * value maps to a label, a sentence of plain detail, and a tone the badge
 * component understands, so one component renders every state honestly.
 *
 * Two rules shape the wording throughout:
 *
 * - A reading is never described as more verified than it is. `PROVENANCE_COPY`
 *   is the only place a value's origin is turned into words, and the tones are
 *   deliberately ordered so a device import can never read as clinical.
 * - Wellness has no score. `WELLNESS_CATEGORY_COPY` names what was measured and
 *   says nothing about whether the number is good or bad, because ORVEXA is not
 *   in a position to say that about a person.
 */

export type CopyTone = "neutral" | "success" | "warning" | "emergency";

export type EnumCopy = { label: string; detail: string; tone: CopyTone };

// ---------------------------------------------------------------------------
// Provenance — where a value came from
// ---------------------------------------------------------------------------

/**
 * How a stored value came to exist.
 *
 * The tones here carry the safety rule. A clinician's entry is `success`; a
 * device import is `neutral` — not `success` — because a wristband is not a
 * clinical measurement, and dressing one up as verified is exactly the mistake
 * this phase is written to avoid. A partner figure (a laboratory's, a
 * pharmacy's) is `neutral` too: it is authoritative for what it reports and for
 * nothing else.
 */
export const PROVENANCE_COPY: Record<HealthRecordSource, EnumCopy> = {
  USER_ENTERED: {
    label: "Entered by you",
    detail: "You or someone with access to your profile typed this in. It has not been checked by a clinician.",
    tone: "neutral",
  },
  DEVICE_IMPORTED: {
    label: "From a device",
    detail: "Imported from a device or an export file. This is a consumer measurement, not a clinical reading.",
    tone: "neutral",
  },
  CLINICIAN_RECORDED: {
    label: "Recorded by a clinician",
    detail: "A clinician entered this during your care. It is part of your medical record.",
    tone: "success",
  },
  PARTNER_REPORTED: {
    label: "Reported by a partner",
    detail: "A laboratory, pharmacy or facility reported this. It describes what they observed and nothing more.",
    tone: "neutral",
  },
  DOCUMENT_UPLOADED: {
    label: "From an uploaded document",
    detail: "Taken from a document you filed in your vault. Check it against the original before relying on it.",
    tone: "neutral",
  },
};

/** Shown while a reading is still unverified, so the gap is never silent. */
export const UNVERIFIED_NOTE =
  "This has not been confirmed by a clinician. Do not change any prescribed treatment based on it.";

export const CLINICIAN_VERIFIED_NOTE = "A clinician has confirmed this reading.";

// ---------------------------------------------------------------------------
// Family and caregiver access
// ---------------------------------------------------------------------------

export const FAMILY_RELATIONSHIP_COPY: Record<FamilyRelationship, string> = {
  SPOUSE: "Spouse",
  CHILD: "Child",
  PARENT: "Parent",
  SIBLING: "Sibling",
  GUARDIAN: "Guardian",
  OTHER: "Other",
};

export const CAREGIVER_ACCESS_STATUS_COPY: Record<CaregiverAccessStatus, EnumCopy> = {
  INVITED: {
    label: "Invitation sent",
    detail: "The invitation has been sent but not accepted. No access exists until it is.",
    tone: "warning",
  },
  ACTIVE: {
    label: "Active",
    detail: "This person can do exactly what the scopes below allow, until you revoke it.",
    tone: "success",
  },
  SUSPENDED: {
    label: "Suspended",
    detail: "Access is paused. Nothing is visible to this person while it is suspended.",
    tone: "warning",
  },
  REVOKED: {
    label: "Revoked",
    detail: "Access has ended. The record of who could see what is kept.",
    tone: "neutral",
  },
  EXPIRED: {
    label: "Expired",
    detail: "This access reached the end date you set and ended on its own.",
    tone: "neutral",
  },
};

/**
 * The scope names, duplicated here from `src/lib/care/access.ts`.
 *
 * `access.ts` is `server-only`, and a client component that renders the scope
 * list cannot import it. Only the labels are duplicated; the descriptions the
 * grantor reads live beside the enforcement code so the two cannot drift.
 */
export const CAREGIVER_SCOPE_COPY: Record<CaregiverScope, string> = {
  VIEW_PROFILE: "See the health profile",
  BOOK_APPOINTMENTS: "Book and manage appointments",
  VIEW_RECORDS: "See medical history and reports",
  MANAGE_MEDICATIONS: "Manage medicine schedules",
  MANAGE_REMINDERS: "Manage reminders",
  UPLOAD_DOCUMENTS: "Add documents to the vault",
  MANAGE_WELLNESS: "Record wellness measurements",
};

/** Every scope, in the order a granting screen should list them. */
export const CAREGIVER_SCOPE_ORDER: readonly CaregiverScope[] = [
  "VIEW_PROFILE",
  "BOOK_APPOINTMENTS",
  "VIEW_RECORDS",
  "MANAGE_MEDICATIONS",
  "MANAGE_REMINDERS",
  "UPLOAD_DOCUMENTS",
  "MANAGE_WELLNESS",
];

export const CAREGIVER_SCOPE_TONES: Record<CaregiverScope, CopyTone> = {
  VIEW_PROFILE: "neutral",
  BOOK_APPOINTMENTS: "neutral",
  VIEW_RECORDS: "emergency",
  MANAGE_MEDICATIONS: "warning",
  MANAGE_REMINDERS: "neutral",
  UPLOAD_DOCUMENTS: "neutral",
  MANAGE_WELLNESS: "neutral",
};

// ---------------------------------------------------------------------------
// Medical history, allergies, immunisations and the vault
// ---------------------------------------------------------------------------

export const ALLERGY_SEVERITY_COPY: Record<AllergySeverity, EnumCopy> = {
  MILD: { label: "Mild", detail: "Discomfort without danger signs.", tone: "neutral" },
  MODERATE: { label: "Moderate", detail: "Needed treatment and interfered with daily activity.", tone: "warning" },
  SEVERE: { label: "Severe", detail: "Required urgent treatment.", tone: "emergency" },
  LIFE_THREATENING: {
    label: "Life threatening",
    detail: "Caused breathing difficulty, swelling or collapse. Carry this information with you.",
    tone: "emergency",
  },
  UNKNOWN: { label: "Not recorded", detail: "Severity was not recorded.", tone: "neutral" },
};

export const MEDICAL_HISTORY_CATEGORY_COPY: Record<MedicalHistoryCategory, string> = {
  CONDITION: "Condition",
  SURGERY: "Surgery",
  HOSPITALISATION: "Hospital stay",
  FAMILY_HISTORY: "Family history",
  LIFESTYLE: "Lifestyle",
  OTHER: "Other",
};

export const HEALTH_DOCUMENT_KIND_COPY: Record<HealthDocumentKind, string> = {
  LAB_REPORT: "Laboratory report",
  IMAGING_REPORT: "Imaging report",
  PRESCRIPTION: "Prescription",
  DISCHARGE_SUMMARY: "Discharge summary",
  CONSULTATION_NOTE: "Consultation note",
  VACCINATION_CERTIFICATE: "Vaccination certificate",
  INSURANCE_POLICY: "Insurance policy",
  INSURANCE_CLAIM: "Insurance claim",
  INVOICE: "Invoice",
  REFERRAL: "Referral",
  OTHER: "Other",
};

export const HEALTH_DOCUMENT_STATUS_COPY: Record<HealthDocumentStatus, EnumCopy> = {
  ACTIVE: { label: "In the vault", detail: "This document is available to you.", tone: "neutral" },
  ARCHIVED: { label: "Archived", detail: "Hidden from the default list but still kept.", tone: "neutral" },
  REMOVED: { label: "Removed", detail: "You removed this document. It is no longer served.", tone: "neutral" },
};

export const TIMELINE_EVENT_KIND_COPY: Record<HealthTimelineEventKind, string> = {
  APPOINTMENT: "Appointment",
  TELECONSULTATION: "Online consultation",
  ADMISSION: "Hospital admission",
  DISCHARGE: "Discharge",
  LAB_REPORT: "Laboratory report",
  IMAGING: "Imaging",
  PRESCRIPTION_ISSUED: "Prescription issued",
  MEDICATION_STARTED: "Medicine started",
  MEDICATION_STOPPED: "Medicine stopped",
  VACCINATION: "Vaccination",
  SCREENING: "Screening",
  ALLERGY_RECORDED: "Allergy recorded",
  DIAGNOSIS_RECORDED: "Diagnosis recorded",
  DOCUMENT_ADDED: "Document added",
  DEVICE_IMPORT: "Device import",
  CARE_PROGRAM_ENROLLED: "Care programme joined",
  WELLNESS_GOAL_SET: "Wellness goal set",
  SUPPORT_TICKET: "Support request",
  OTHER: "Other",
};

/** How each timeline icon family reads, so the badge is never alarming by default. */
export const TIMELINE_EVENT_TONE: Record<HealthTimelineEventKind, CopyTone> = {
  APPOINTMENT: "neutral",
  TELECONSULTATION: "neutral",
  ADMISSION: "warning",
  DISCHARGE: "neutral",
  LAB_REPORT: "neutral",
  IMAGING: "neutral",
  PRESCRIPTION_ISSUED: "neutral",
  MEDICATION_STARTED: "neutral",
  MEDICATION_STOPPED: "warning",
  VACCINATION: "success",
  SCREENING: "success",
  ALLERGY_RECORDED: "warning",
  DIAGNOSIS_RECORDED: "warning",
  DOCUMENT_ADDED: "neutral",
  DEVICE_IMPORT: "neutral",
  CARE_PROGRAM_ENROLLED: "neutral",
  WELLNESS_GOAL_SET: "neutral",
  SUPPORT_TICKET: "neutral",
  OTHER: "neutral",
};

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export const REMINDER_KIND_COPY: Record<ReminderKind, string> = {
  MEDICATION: "Medicine",
  VACCINATION: "Vaccination",
  SCREENING: "Screening",
  APPOINTMENT: "Appointment",
  PREVENTIVE_CHECKUP: "Preventive checkup",
  FOLLOW_UP: "Follow-up",
  WELLNESS: "Wellness",
  MATERNAL: "Maternal care",
  CHILD: "Child care",
  SENIOR_CARE: "Senior care",
  CUSTOM: "Reminder",
};

export const REMINDER_SCHEDULE_KIND_COPY: Record<ReminderScheduleKind, string> = {
  ONE_OFF: "Once",
  DAILY: "Every day",
  WEEKLY: "Certain days of the week",
  MONTHLY: "Once a month",
  INTERVAL: "At an interval",
};

export const CARE_REMINDER_STATUS_COPY: Record<CareReminderStatus, EnumCopy> = {
  ACTIVE: { label: "On", detail: "This reminder will be sent at the times you chose.", tone: "success" },
  PAUSED: { label: "Paused", detail: "Kept but not sent until you turn it back on.", tone: "warning" },
  COMPLETED: { label: "Finished", detail: "This reminder ran its course and has ended.", tone: "neutral" },
  CANCELLED: { label: "Cancelled", detail: "You cancelled this reminder.", tone: "neutral" },
};

export const REMINDER_CHANNEL_COPY: Record<CareReminderChannel, string> = {
  IN_APP: "In the app",
  EMAIL: "Email",
  SMS: "Text message",
  WHATSAPP: "WhatsApp",
  PUSH: "Push notification",
};

/**
 * Why a reminder did or did not go out.
 *
 * A suppression is shown to the person rather than hidden, because "we chose not
 * to send this twice" and "we held it back during your quiet hours" are both
 * things they are entitled to see.
 */
export const REMINDER_DISPATCH_OUTCOME_COPY: Record<ReminderDispatchOutcome, EnumCopy> = {
  QUEUED: { label: "Queued", detail: "Waiting to be sent.", tone: "neutral" },
  SENT: { label: "Sent", detail: "Delivered to the channel you chose.", tone: "success" },
  SUPPRESSED_DUPLICATE: {
    label: "Already sent",
    detail: "This occurrence had already gone out, so it was not sent a second time.",
    tone: "neutral",
  },
  SUPPRESSED_QUIET_HOURS: {
    label: "Held for quiet hours",
    detail: "This fell inside the quiet hours you set and was not sent.",
    tone: "warning",
  },
  SUPPRESSED_CHANNEL_DISABLED: {
    label: "Channel turned off",
    detail: "The channel this reminder uses is switched off in your preferences.",
    tone: "warning",
  },
  FAILED: { label: "Could not send", detail: "Delivery failed. Nothing was delivered.", tone: "emergency" },
};

// ---------------------------------------------------------------------------
// Preventive health and care programmes
// ---------------------------------------------------------------------------

export const PREVENTIVE_CARE_KIND_COPY: Record<PreventiveCareKind, string> = {
  VACCINATION: "Vaccination",
  SCREENING: "Screening",
  PREVENTIVE_CHECKUP: "Preventive checkup",
  DENTAL: "Dental",
  VISION: "Vision",
  MENTAL_WELLNESS: "Mental wellness",
};

export const PREVENTIVE_CARE_STATUS_COPY: Record<PreventiveCareStatus, EnumCopy> = {
  PLANNED: { label: "Planned", detail: "Not due yet.", tone: "neutral" },
  DUE: { label: "Due", detail: "Due now, according to the guidance recorded against it.", tone: "warning" },
  COMPLETED: { label: "Done", detail: "Recorded as completed.", tone: "success" },
  OVERDUE: { label: "Overdue", detail: "The date it was due has passed.", tone: "emergency" },
  DECLINED: { label: "Declined", detail: "You chose not to go ahead with this.", tone: "neutral" },
};

export const CARE_PROGRAM_KIND_COPY: Record<CareProgramKind, string> = {
  MATERNAL: "Maternal care",
  CHILD: "Child health",
  SENIOR: "Senior care",
  CHRONIC_CONDITION: "Chronic condition",
  REHABILITATION: "Rehabilitation",
};

export const CARE_PROGRAM_STATUS_COPY: Record<CareProgramStatus, EnumCopy> = {
  ACTIVE: { label: "Active", detail: "Currently being followed.", tone: "success" },
  ON_HOLD: { label: "On hold", detail: "Paused for now.", tone: "warning" },
  COMPLETED: { label: "Completed", detail: "This programme has finished.", tone: "neutral" },
  WITHDRAWN: { label: "Withdrawn", detail: "You chose to stop this programme.", tone: "neutral" },
};

/**
 * The sentence every preventive plan carries.
 *
 * ORVEXA does not issue a screening schedule of its own. A plan is a reminder of
 * what a professional or a published national schedule already says, which is
 * why the guidance source is required and is shown next to the plan.
 */
export const PREVENTIVE_GUIDANCE_DISCLAIMER =
  "ORVEXA does not set its own screening or vaccination schedule. This plan repeats guidance recorded against it. Ask a clinician what is right for you.";

// ---------------------------------------------------------------------------
// Medicines
// ---------------------------------------------------------------------------

export const MEDICATION_SCHEDULE_STATUS_COPY: Record<MedicationScheduleStatus, EnumCopy> = {
  ACTIVE: { label: "Taking", detail: "This medicine is on your current list.", tone: "success" },
  PAUSED: { label: "Paused", detail: "Not currently being taken, but kept on the list.", tone: "warning" },
  COMPLETED: { label: "Completed", detail: "The course finished.", tone: "neutral" },
  STOPPED: { label: "Stopped", detail: "You recorded that you stopped taking this.", tone: "warning" },
};

export const MEDICATION_DOSE_STATUS_COPY: Record<MedicationDoseStatus, EnumCopy> = {
  SCHEDULED: { label: "Due", detail: "Not logged yet.", tone: "neutral" },
  TAKEN: { label: "Taken", detail: "Logged as taken at the scheduled time.", tone: "success" },
  TAKEN_LATE: { label: "Taken late", detail: "Logged as taken after the scheduled time.", tone: "warning" },
  SKIPPED: { label: "Skipped", detail: "You recorded that you deliberately skipped this dose.", tone: "warning" },
  MISSED: { label: "Not logged", detail: "No dose was logged for this time.", tone: "emergency" },
};

/**
 * The sentence shown wherever a prescriber's schedule appears.
 *
 * A `CLINICIAN_RECORDED` schedule cannot be edited or stopped by the person or
 * by an import: changing a prescribed medicine is a clinical decision. The app
 * records that somebody stopped taking it; it does not rewrite the prescription.
 */
export const PRESCRIBED_SCHEDULE_LOCKED_NOTE =
  "This schedule was recorded by a clinician. You can log the doses you take, but changing or stopping it is a clinical decision — talk to your prescriber.";

export const SELF_REPORTED_SCHEDULE_NOTE =
  "You entered this schedule. It is not a prescription and has not been checked by a clinician.";

// ---------------------------------------------------------------------------
// Wellness
// ---------------------------------------------------------------------------

export const WELLNESS_CATEGORY_COPY: Record<WellnessCategory, string> = {
  NUTRITION: "Nutrition",
  ACTIVITY: "Activity",
  SLEEP: "Sleep",
  MOOD: "Mood",
  WEIGHT: "Weight",
  BLOOD_PRESSURE: "Blood pressure",
  BLOOD_GLUCOSE: "Blood glucose",
  HYDRATION: "Hydration",
  PAIN: "Pain",
  OTHER: "Other",
};

export const WELLNESS_UNIT_COPY: Record<WellnessUnit, string> = {
  KCAL: "kcal",
  GRAM: "g",
  MILLILITRE: "ml",
  MINUTE: "min",
  HOUR: "h",
  STEP: "steps",
  COUNT: "count",
  KILOGRAM: "kg",
  CENTIMETRE: "cm",
  MMHG: "mmHg",
  MG_DL: "mg/dL",
  SELF_REPORT_SCALE: "1–10",
  NONE: "",
};

export const WELLNESS_GOAL_STATUS_COPY: Record<WellnessGoalStatus, EnumCopy> = {
  ACTIVE: { label: "Active", detail: "Being tracked.", tone: "success" },
  ACHIEVED: { label: "Reached", detail: "You marked this goal as reached.", tone: "success" },
  ARCHIVED: { label: "Archived", detail: "No longer tracked.", tone: "neutral" },
};

export const WELLNESS_GOAL_CADENCE_COPY: Record<WellnessGoalCadence, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

/**
 * The rule this whole module is written around, in one sentence.
 *
 * It is exported rather than written into a component because it has to appear
 * in the same words on the tracker, the goal screen and the device screen.
 */
export const WELLNESS_IS_NOT_A_DIAGNOSIS =
  "These are your own observations, not a medical assessment. ORVEXA does not score your health and cannot tell you whether a reading is normal. Bring anything that worries you to a clinician.";

export const WEARABLE_DOES_NOT_CHANGE_TREATMENT =
  "Do not change any prescribed medicine or treatment because of a device reading. Contact your prescriber first.";

// ---------------------------------------------------------------------------
// Health devices
// ---------------------------------------------------------------------------

export const DEVICE_PROVIDER_COPY: Record<HealthDeviceProvider, string> = {
  MANUAL_UPLOAD: "Import a file",
  APPLE_HEALTH: "Apple Health",
  GOOGLE_FIT: "Google Fit",
  FITBIT: "Fitbit",
  GARMIN: "Garmin",
  SAMSUNG_HEALTH: "Samsung Health",
  WITHINGS: "Withings",
  OMROM: "Omron",
  OTHER: "Other device",
};

/**
 * Whether ORVEXA actually talks to a vendor.
 *
 * `NOT_CONFIGURED` is the honest default and the UI renders it as text rather
 * than as a button, so nobody is offered a connection that does nothing.
 */
export const DEVICE_INTEGRATION_MODE_COPY: Record<HealthDeviceIntegrationMode, EnumCopy> = {
  NOT_CONFIGURED: {
    label: "Not available yet",
    detail: "ORVEXA has no working connection to this provider. You can still import a file exported from it.",
    tone: "warning",
  },
  FILE_IMPORT: {
    label: "Import a file",
    detail: "Export your data from the device's own app and upload it here. Nothing is sent automatically.",
    tone: "neutral",
  },
  PARTNER_API: {
    label: "Connected automatically",
    detail: "ORVEXA reads directly from this provider once you authorise it.",
    tone: "success",
  },
};

export const DEVICE_CONNECTION_STATUS_COPY: Record<HealthDeviceConnectionStatus, EnumCopy> = {
  PENDING: { label: "Not finished", detail: "The connection has not been completed.", tone: "warning" },
  CONNECTED: { label: "Connected", detail: "Imports are allowed while this connection is active.", tone: "success" },
  ERROR: { label: "Needs attention", detail: "The last attempt failed. The reason is shown below.", tone: "emergency" },
  REVOKED: { label: "Disconnected", detail: "You disconnected this source. Nothing more will be imported.", tone: "neutral" },
};

export const DEVICE_SYNC_STATUS_COPY: Record<HealthDeviceSyncStatus, EnumCopy> = {
  STARTED: { label: "Running", detail: "This import has not finished yet.", tone: "neutral" },
  SUCCEEDED: { label: "Finished", detail: "Everything that was found was imported.", tone: "success" },
  PARTIAL: { label: "Partly imported", detail: "Some readings were imported and some were skipped as duplicates.", tone: "warning" },
  FAILED: { label: "Failed", detail: "Nothing from this run was imported.", tone: "emergency" },
};

// ---------------------------------------------------------------------------
// Care services, mental wellness and education
// ---------------------------------------------------------------------------

export const CARE_SERVICE_CATEGORY_COPY: Record<CareServiceCategory, string> = {
  PHYSIOTHERAPY: "Physiotherapy",
  REHABILITATION: "Rehabilitation",
  HOME_NURSING: "Home nursing",
  HOME_HEALTHCARE: "Home healthcare",
  HOME_SAMPLE_COLLECTION: "Home sample collection",
  MENTAL_WELLNESS: "Mental wellness",
  NUTRITION_COUNSELLING: "Nutrition counselling",
  ELDER_CARE: "Elder care",
  POST_SURGICAL_CARE: "Post-surgical care",
  OTHER: "Other",
};

export const CARE_SERVICE_DELIVERY_MODE_COPY: Record<CareServiceDeliveryMode, string> = {
  AT_FACILITY: "At the facility",
  AT_HOME: "At home",
  ONLINE: "Online",
};

export const CARE_SERVICE_REQUEST_STATUS_COPY: Record<CareServiceRequestStatus, EnumCopy> = {
  REQUESTED: { label: "Requested", detail: "Sent to the provider. They have not responded yet.", tone: "warning" },
  ACKNOWLEDGED: { label: "Acknowledged", detail: "The provider has seen your request.", tone: "neutral" },
  SCHEDULED: { label: "Scheduled", detail: "The provider has given you a time.", tone: "success" },
  IN_PROGRESS: { label: "In progress", detail: "The service is under way.", tone: "neutral" },
  COMPLETED: { label: "Completed", detail: "The provider has marked this complete.", tone: "success" },
  CANCELLED: { label: "Cancelled", detail: "This request was cancelled.", tone: "neutral" },
  DECLINED: { label: "Declined", detail: "The provider could not take this request.", tone: "warning" },
};

export const MENTAL_WELLNESS_RESOURCE_KIND_COPY: Record<MentalWellnessResourceKind, string> = {
  ARTICLE: "Article",
  GUIDE: "Guide",
  HELPLINE: "Helpline",
  SELF_ASSESSMENT: "Self-assessment",
  GUIDED_EXERCISE: "Guided exercise",
  VIDEO: "Video",
};

export const EDUCATION_CATEGORY_COPY: Record<EducationResourceCategory, string> = {
  GENERAL_HEALTH: "General health",
  MATERNAL_HEALTH: "Maternal health",
  CHILD_HEALTH: "Child health",
  SENIOR_HEALTH: "Senior health",
  NUTRITION: "Nutrition",
  MENTAL_HEALTH: "Mental health",
  CHRONIC_CONDITION: "Chronic conditions",
  MEDICATION_SAFETY: "Medicine safety",
  EMERGENCY_AWARENESS: "Emergency awareness",
};

/** Each language, written in itself, so a reader recognises their own. */
export const SUPPORTED_LANGUAGE_COPY: Record<SupportedLanguage, string> = {
  ENGLISH: "English",
  HINDI: "हिन्दी",
  KANNADA: "ಕನ್ನಡ",
  TAMIL: "தமிழ்",
  TELUGU: "తెలుగు",
  MALAYALAM: "മലയാളം",
  MARATHI: "मराठी",
  BENGALI: "বাংলা",
  GUJARATI: "ગુજરાતી",
  ODIA: "ଓଡ଼ିଆ",
  PUNJABI: "ਪੰਜਾਬੀ",
  ASSAMESE: "অসমীয়া",
  URDU: "اردو",
};

/**
 * Whether ORVEXA holds reviewed material in a language.
 *
 * False for everything except English until a translation exists and has been
 * reviewed. The education screen reads this and says so rather than rendering an
 * English article under a Hindi heading.
 */
export const LANGUAGE_HAS_REVIEWED_CONTENT: Record<SupportedLanguage, boolean> = {
  ENGLISH: true,
  HINDI: false,
  KANNADA: false,
  TAMIL: false,
  TELUGU: false,
  MALAYALAM: false,
  MARATHI: false,
  BENGALI: false,
  GUJARATI: false,
  ODIA: false,
  PUNJABI: false,
  ASSAMESE: false,
  URDU: false,
};

export const LANGUAGE_CONTENT_PENDING_NOTE =
  "Reviewed material is not yet available in this language. ORVEXA does not publish machine translations as if a clinician had read them.";

// ---------------------------------------------------------------------------
// Feedback and support
// ---------------------------------------------------------------------------

export const FEEDBACK_SUBJECT_COPY: Record<ServiceFeedbackSubject, string> = {
  APPOINTMENT: "An appointment",
  TELECONSULTATION: "An online consultation",
  LAB_BOOKING: "A laboratory booking",
  PHARMACY_ORDER: "A pharmacy order",
  CARE_SERVICE: "A care service",
  HOSPITAL_VISIT: "A hospital visit",
  PLATFORM: "The ORVEXA platform",
};

export const FEEDBACK_STATUS_COPY: Record<ServiceFeedbackStatus, EnumCopy> = {
  SUBMITTED: { label: "Received", detail: "Thank you. Your feedback has been recorded.", tone: "neutral" },
  ACKNOWLEDGED: { label: "Read", detail: "Somebody has read this.", tone: "neutral" },
  RESOLVED: { label: "Resolved", detail: "This was acted on and closed.", tone: "success" },
  DISMISSED: { label: "Closed", detail: "This was closed without further action.", tone: "neutral" },
};

export const SUPPORT_TICKET_CATEGORY_COPY: Record<SupportTicketCategory, string> = {
  BOOKING_ISSUE: "A booking problem",
  PAYMENT_ISSUE: "A payment or refund problem",
  PRESCRIPTION_ISSUE: "A prescription problem",
  REPORT_ISSUE: "A report problem",
  ACCOUNT_ACCESS: "Signing in or account access",
  PRIVACY_REQUEST: "A privacy or data request",
  CAREGIVER_ACCESS: "Family and caregiver access",
  TECHNICAL: "Something not working",
  OTHER: "Something else",
};

export const SUPPORT_TICKET_SEVERITY_COPY: Record<SupportTicketSeverity, EnumCopy> = {
  LOW: { label: "Low", detail: "Not urgent.", tone: "neutral" },
  NORMAL: { label: "Normal", detail: "Standard queue.", tone: "neutral" },
  HIGH: { label: "High", detail: "Needs attention soon.", tone: "warning" },
  CRITICAL: {
    label: "Urgent",
    detail: "Needs immediate attention. For a medical emergency, use the emergency actions instead.",
    tone: "emergency",
  },
};

export const SUPPORT_TICKET_STATUS_COPY: Record<SupportTicketStatus, EnumCopy> = {
  OPEN: { label: "Open", detail: "Waiting to be picked up.", tone: "warning" },
  IN_PROGRESS: { label: "Being handled", detail: "Somebody is working on this.", tone: "neutral" },
  AWAITING_PATIENT: { label: "Waiting for you", detail: "We have asked you something. Reply to continue.", tone: "warning" },
  RESOLVED: { label: "Resolved", detail: "We believe this is settled.", tone: "success" },
  CLOSED: { label: "Closed", detail: "This request is finished.", tone: "neutral" },
};

/** The categories that must never be closed without an answer. */
export const ESCALATED_TICKET_CATEGORIES: readonly SupportTicketCategory[] = [
  "PRIVACY_REQUEST",
  "CAREGIVER_ACCESS",
  "PRESCRIPTION_ISSUE",
] as const;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A short, human-readable unit suffix, or an empty string. */
export function wellnessUnitSuffix(unit: WellnessUnit): string {
  const label = WELLNESS_UNIT_COPY[unit];
  return label ? ` ${label}` : "";
}

/**
 * The word for whoever typed a value.
 *
 * Kept next to the copy tables because "you" versus a caregiver's name is a
 * wording decision, and the screen should not have to work out that an entry
 * written by somebody with access to a dependent's profile is still not the
 * account holder's own note.
 */
export function enteredByLabel(input: { actorUserId: string; viewerUserId: string; actorName?: string | null }): string {
  if (input.actorUserId === input.viewerUserId) return "You";
  return input.actorName ?? "Someone with access";
}
