import "server-only";

import { getSmsProviderConfig } from "@/lib/env";
import { EMAIL_NOT_CONFIGURED_MESSAGE, emailDeliveryAvailable } from "@/lib/actions/email-delivery";

/**
 * The replaceable notification interface.
 *
 * ## Why this exists
 *
 * Diagnostics and telemedicine generate notifications that a patient actually
 * needs to receive — a booking confirmed, a sample collection window, a report
 * published, a join link, a follow-up reminder. Rather than each service posting
 * to a vendor, they call `NotificationProvider` and render the honest outcome.
 *
 * ## The rule this file enforces
 *
 * A notification is reported as `sent` **only** when a transport accepted it.
 * No transport is implemented in this codebase yet, so the built-in provider
 * reports every send as `not_configured` — exactly as
 * `src/lib/actions/email-delivery.ts` and `src/lib/emergency/delivery.ts` do, in
 * the same words. This is deliberate: it is what lets a page say "we could not
 * email you this link" instead of implying an inbox received it.
 *
 * When a transport is added, implement it here and flip
 * `NOTIFICATION_TRANSPORT_IMPLEMENTED`; nothing above this file changes.
 */

export type NotificationChannel = "EMAIL" | "SMS" | "IN_APP";

export type NotificationKind =
  | "diagnostic_booking_confirmed"
  | "diagnostic_booking_rescheduled"
  | "diagnostic_booking_cancelled"
  | "diagnostic_sample_collection_reminder"
  | "lab_report_published"
  | "lab_report_shared"
  | "teleconsultation_booked"
  | "teleconsultation_reminder"
  | "teleconsultation_join_link"
  | "teleconsultation_cancelled"
  | "consultation_note_available"
  | "consultation_prescription_issued"
  // Patient care (Phase 10). Both are notices a person asked to receive through
  // the preferences they set, and like every other kind here they are reported
  // as unconfigured rather than as delivered until a transport exists.
  | "caregiver_invitation"
  | "care_reminder_due";

export type NotificationMessage = {
  kind: NotificationKind;
  channel: NotificationChannel;
  /** Recipient address for the channel: an email or a phone number. */
  to: string;
  subject: string;
  /** Plain-text body. Short-lived links go here, never a durable public URL. */
  body: string;
  /** Non-sensitive context, for logging and de-duplication at the call site. */
  reference?: string;
};

export type NotificationOutcome =
  | { status: "SENT"; transportReference: string | null; attemptedAt: Date }
  | { status: "NOT_CONFIGURED"; reason: string; attemptedAt: Date }
  | { status: "FAILED"; reason: string; attemptedAt: Date };

/**
 * No notification transport is implemented. This is a single, explicit switch so
 * that adding one is a deliberate act rather than an accidental success path.
 */
const NOTIFICATION_TRANSPORT_IMPLEMENTED = false;

const EMAIL_NOT_CONFIGURED_REASON = EMAIL_NOT_CONFIGURED_MESSAGE;

const SMS_NOT_CONFIGURED_REASON =
  "This deployment has no SMS delivery configured, so no text message can be sent from it.";

const IN_APP_NOT_CONFIGURED_REASON =
  "In-app notifications are not stored on this deployment, so nothing was delivered to the app.";

export type NotificationCapability = {
  emailAvailable: boolean;
  smsAvailable: boolean;
  inAppAvailable: boolean;
  /** True only when at least one channel can carry a message end to end. */
  anyAvailable: boolean;
  /** Shown verbatim wherever a notification is offered. Never overstates. */
  notice: string;
};

export function notificationCapability(): NotificationCapability {
  const emailAvailable = NOTIFICATION_TRANSPORT_IMPLEMENTED && emailDeliveryAvailable();
  const smsAvailable = NOTIFICATION_TRANSPORT_IMPLEMENTED && Boolean(getSmsProviderConfig());
  const inAppAvailable = false;
  const anyAvailable = emailAvailable || smsAvailable || inAppAvailable;

  return {
    emailAvailable,
    smsAvailable,
    inAppAvailable,
    anyAvailable,
    notice: anyAvailable
      ? "Notifications are delivered through the configured channels."
      : "This deployment cannot deliver email, SMS or in-app notifications, so reminder and confirmation messages are not sent. Every action still works and its result is shown on this page.",
  };
}

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export interface NotificationProvider {
  readonly id: string;
  readonly label: string;
  /**
   * Sends one message. Resolves to an outcome for every condition; it never
   * throws and never reports `SENT` unless a transport accepted the message.
   */
  send(message: NotificationMessage): Promise<NotificationOutcome>;
}

/**
 * The built-in provider. It reports every channel as unconfigured, because no
 * transport is implemented — the honest answer, and the one the UI is written
 * against. It is intentionally not a "no-op that succeeds".
 */
export function createUnavailableNotificationProvider(): NotificationProvider {
  return {
    id: "UNAVAILABLE",
    label: "Notifications not configured",
    async send(message: NotificationMessage): Promise<NotificationOutcome> {
      const attemptedAt = new Date();
      const reason =
        message.channel === "EMAIL"
          ? EMAIL_NOT_CONFIGURED_REASON
          : message.channel === "SMS"
            ? SMS_NOT_CONFIGURED_REASON
            : IN_APP_NOT_CONFIGURED_REASON;
      return { status: "NOT_CONFIGURED", reason, attemptedAt };
    },
  };
}

let cached: NotificationProvider | null = null;

export function getNotificationProvider(): NotificationProvider {
  // A configured transport would be constructed here. Until then the honest
  // provider is the only one, and it never claims a message was sent.
  if (!cached) cached = createUnavailableNotificationProvider();
  return cached;
}

/** Convenience for a call site that only needs the outcome. */
export async function sendNotification(message: NotificationMessage): Promise<NotificationOutcome> {
  return getNotificationProvider().send(message);
}
