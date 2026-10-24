import type {
  DiagnosticBookingEventType,
  DiagnosticBookingMode,
  DiagnosticBookingStatus,
  DiagnosticSampleType,
  LabReportAccessAction,
  LabReportStatus,
  LabResultFlag,
} from "@prisma/client";

/**
 * The copy tables the diagnostics surface renders from.
 *
 * Client-safe by construction (type-only Prisma import, no `server-only`, no
 * environment access), following `src/lib/pharmacy/labels.ts`. Every enum value
 * maps to a label, a sentence of plain detail, and a tone the badge component
 * understands, so one component renders every state honestly.
 */

export type CopyTone = "neutral" | "success" | "warning" | "emergency";

export type EnumCopy = { label: string; detail: string; tone: CopyTone };

export const SAMPLE_TYPE_COPY: Record<DiagnosticSampleType, string> = {
  BLOOD: "Blood",
  URINE: "Urine",
  STOOL: "Stool",
  SALIVA: "Saliva",
  SWAB: "Swab",
  TISSUE: "Tissue (biopsy)",
  IMAGING: "Imaging",
  OTHER: "Other",
};

export const BOOKING_MODE_COPY: Record<DiagnosticBookingMode, EnumCopy> = {
  WALK_IN: {
    label: "Visit the laboratory",
    detail: "You attend the laboratory's collection centre at the time you booked.",
    tone: "neutral",
  },
  HOME_COLLECTION: {
    label: "Home sample collection",
    detail: "A phlebotomist visits the address you gave, where the laboratory offers this.",
    tone: "neutral",
  },
};

export const BOOKING_STATUS_COPY: Record<DiagnosticBookingStatus, EnumCopy> = {
  REQUESTED: {
    label: "Requested",
    detail: "Your booking has been sent to the laboratory. It has not been confirmed yet.",
    tone: "warning",
  },
  CONFIRMED: { label: "Confirmed", detail: "The laboratory has confirmed this booking.", tone: "success" },
  SAMPLE_COLLECTED: {
    label: "Sample collected",
    detail: "The laboratory has recorded that your sample was taken.",
    tone: "success",
  },
  PROCESSING: {
    label: "Processing",
    detail: "The laboratory is analysing the sample. No result exists yet.",
    tone: "warning",
  },
  REPORT_READY: {
    label: "Report ready",
    detail: "The laboratory has published an authenticated report. You can open it from your reports.",
    tone: "success",
  },
  COMPLETED: { label: "Completed", detail: "This booking has been completed.", tone: "neutral" },
  CANCELLED: { label: "Cancelled", detail: "This booking was cancelled.", tone: "neutral" },
  NO_SHOW: {
    label: "Not attended",
    detail: "The laboratory recorded that the sample was not collected at the booked time.",
    tone: "emergency",
  },
};

/** The forward steps of a booking, for a progress timeline. */
export const BOOKING_STATUS_TIMELINE: readonly {
  status: DiagnosticBookingStatus;
  title: string;
  description: string;
}[] = [
  { status: "REQUESTED", title: "Requested", description: "Your booking is sent to the laboratory." },
  { status: "CONFIRMED", title: "Confirmed", description: "The laboratory confirms the appointment." },
  { status: "SAMPLE_COLLECTED", title: "Sample collected", description: "The sample is taken at the centre or at home." },
  { status: "PROCESSING", title: "Processing", description: "The laboratory analyses the sample." },
  { status: "REPORT_READY", title: "Report ready", description: "An authenticated report is published to you." },
  { status: "COMPLETED", title: "Completed", description: "The booking is closed." },
];

export const TERMINAL_BOOKING_STATUSES: readonly DiagnosticBookingStatus[] = ["CANCELLED", "NO_SHOW"];

export const BOOKING_EVENT_COPY: Record<DiagnosticBookingEventType, EnumCopy> = {
  REQUESTED: { label: "Booking requested", detail: "The booking was created.", tone: "neutral" },
  CONFIRMED: { label: "Confirmed", detail: "The laboratory confirmed the booking.", tone: "success" },
  REJECTED: { label: "Rejected", detail: "The laboratory could not take this booking.", tone: "emergency" },
  RESCHEDULED: { label: "Rescheduled", detail: "The appointment time was changed.", tone: "warning" },
  CANCELLED: { label: "Cancelled", detail: "The booking was cancelled.", tone: "neutral" },
  SAMPLE_COLLECTED: { label: "Sample collected", detail: "The sample was recorded as taken.", tone: "success" },
  PROCESSING_STARTED: { label: "Processing", detail: "Analysis of the sample began.", tone: "neutral" },
  REPORT_PUBLISHED: { label: "Report published", detail: "An authenticated report was released.", tone: "success" },
  COMPLETED: { label: "Completed", detail: "The booking was completed.", tone: "neutral" },
  NO_SHOW: { label: "Not attended", detail: "The sample was not collected at the booked time.", tone: "emergency" },
  NOTE: { label: "Note", detail: "A note was added to the booking.", tone: "neutral" },
};

export const REPORT_STATUS_COPY: Record<LabReportStatus, EnumCopy> = {
  DRAFT: {
    label: "Being prepared",
    detail: "The laboratory is preparing this report. It is not visible to the patient yet.",
    tone: "warning",
  },
  PUBLISHED: {
    label: "Published",
    detail: "The laboratory authenticated this report and released it to the patient.",
    tone: "success",
  },
  AMENDED: {
    label: "Amended",
    detail: "This report was superseded by a corrected version. The correction is the current one.",
    tone: "warning",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    detail: "The laboratory withdrew this report. The reason it gave is shown with it.",
    tone: "emergency",
  },
};

export const RESULT_FLAG_COPY: Record<LabResultFlag, EnumCopy> = {
  NORMAL: { label: "Within range", detail: "The laboratory flagged this value as within its reference range.", tone: "success" },
  HIGH: { label: "Above range", detail: "The laboratory flagged this value as above its reference range.", tone: "warning" },
  LOW: { label: "Below range", detail: "The laboratory flagged this value as below its reference range.", tone: "warning" },
  CRITICAL_HIGH: {
    label: "Critically high",
    detail: "The laboratory flagged this value as critically high. Contact a clinician promptly.",
    tone: "emergency",
  },
  CRITICAL_LOW: {
    label: "Critically low",
    detail: "The laboratory flagged this value as critically low. Contact a clinician promptly.",
    tone: "emergency",
  },
  ABNORMAL: { label: "Abnormal", detail: "The laboratory flagged this value as abnormal.", tone: "warning" },
  INCONCLUSIVE: { label: "Inconclusive", detail: "The laboratory flagged this result as inconclusive.", tone: "warning" },
  UNKNOWN: {
    label: "Not flagged",
    detail: "The laboratory did not flag this value. That is not the same as it being within range.",
    tone: "neutral",
  },
};

export const REPORT_ACCESS_ACTION_COPY: Record<LabReportAccessAction, EnumCopy> = {
  UPLOADED: { label: "Document uploaded", detail: "A document was added to this report.", tone: "neutral" },
  PUBLISHED: { label: "Published", detail: "The report was authenticated and released.", tone: "success" },
  VIEWED: { label: "Viewed", detail: "This report was opened.", tone: "neutral" },
  DOWNLOADED: { label: "Downloaded", detail: "This report was downloaded.", tone: "neutral" },
  LINK_ISSUED: { label: "Access link issued", detail: "A short-lived link to this report was issued.", tone: "neutral" },
  AMENDED: { label: "Amended", detail: "This report was corrected and re-issued.", tone: "warning" },
  WITHDRAWN: { label: "Withdrawn", detail: "This report was withdrawn by the laboratory.", tone: "emergency" },
  SHARED: { label: "Shared", detail: "This report was shared with a named recipient.", tone: "warning" },
  SHARE_REVOKED: { label: "Share revoked", detail: "A share of this report was revoked.", tone: "neutral" },
};

/**
 * The platform's standing statement about laboratory results.
 *
 * Rendered beside every report, so the boundary travels with the information
 * wherever it is shown.
 */
export const LAB_RESULT_DISCIPLINE =
  "A laboratory result is the laboratory's. ORVEXA stores and delivers it and never authors, alters or interprets it. " +
  "A report becomes visible to you only after the laboratory authenticates it, and the name it signed with is shown on the report. " +
  "Results are not a diagnosis — discuss them with the clinician who ordered them.";

/** Version of the diagnostic sample-collection and report consent text. */
export const DIAGNOSTIC_CONSENT_POLICY_VERSION = "orvexa.diagnostics-booking.v1";

export const DIAGNOSTIC_CONSENT_STATEMENT =
  "I confirm this test is for me or for a family member I manage, and I agree to ORVEXA sharing the details needed to " +
  "collect and process the sample with the laboratory I chose, and to receiving the laboratory's authenticated report here. " +
  "I understand the platform does not produce the result and cannot change it.";

/** Version of the home-collection consent text (a distinct, narrower consent). */
export const HOME_COLLECTION_CONSENT_POLICY_VERSION = "orvexa.diagnostics-home-collection.v1";

export const HOME_COLLECTION_CONSENT_STATEMENT =
  "I agree to a phlebotomist from the laboratory I chose visiting the address I gave at the time I booked, and I confirm " +
  "the contact details are correct. I understand the collection may be rescheduled if the sample cannot be taken safely.";

/** Version of the report-sharing consent text. */
export const REPORT_SHARING_CONSENT_POLICY_VERSION = "orvexa.lab-report-sharing.v1";

export const REPORT_SHARING_CONSENT_STATEMENT =
  "I agree to ORVEXA giving the recipient I name access to this report through a link that stops working after the period " +
  "I choose. I understand I can revoke it at any time, and that sharing does not put the report anywhere public.";

/** Reassurance is never given over a critical flag. The wording is load-bearing. */
export const CRITICAL_RESULT_NOTICE =
  "One or more values were flagged critical by the laboratory. This is not a diagnosis, but it may need prompt attention. " +
  "Contact the clinician who ordered the test, or seek urgent care if you feel unwell.";
