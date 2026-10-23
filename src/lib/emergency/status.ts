import type { EmergencyIncidentEventType, EmergencyIncidentStatus, EmergencyRequestStatus } from "@prisma/client";

/**
 * Incident status vocabulary and the copy that goes with it.
 *
 * Client-safe: this module holds no data access, so the status card, the
 * timeline and the SMS-style summary can all render from the same source of
 * truth. The wording is the safety boundary of the whole feature. A status is
 * only ever described as "a responder is coming" when a provider integration has
 * actually confirmed it — anything short of that says plainly that nobody has
 * accepted yet.
 */

export const INCIDENT_STATUS_LABELS: Record<EmergencyIncidentStatus, string> = {
  SEEKING_RESPONDERS: "Seeking responders",
  ACKNOWLEDGED: "Acknowledged",
  RESPONDER_ACCEPTED: "Responder accepted",
  EN_ROUTE: "Responder en route",
  ON_SCENE: "Responder on scene",
  TRANSPORTING: "Transporting to hospital",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  UNANSWERED: "No responder accepted",
};

export type IncidentStatusTone = "pending" | "confirmed" | "terminal" | "closed";

/** Drives badge colour; "pending" is deliberately the loudest of the four. */
export const INCIDENT_STATUS_TONE: Record<EmergencyIncidentStatus, IncidentStatusTone> = {
  SEEKING_RESPONDERS: "pending",
  UNANSWERED: "pending",
  ACKNOWLEDGED: "confirmed",
  RESPONDER_ACCEPTED: "confirmed",
  EN_ROUTE: "confirmed",
  ON_SCENE: "confirmed",
  TRANSPORTING: "confirmed",
  RESOLVED: "closed",
  CANCELLED: "closed",
  EXPIRED: "terminal",
};

/**
 * Rank used to keep the lifecycle monotonic. SEEKING_RESPONDERS and UNANSWERED
 * share rank 0 because the platform may still be answered late — but neither is
 * a confirmation, so neither may be described as a response.
 */
const STATUS_RANK: Record<EmergencyIncidentStatus, number> = {
  SEEKING_RESPONDERS: 0,
  UNANSWERED: 0,
  ACKNOWLEDGED: 1,
  RESPONDER_ACCEPTED: 2,
  EN_ROUTE: 3,
  ON_SCENE: 4,
  TRANSPORTING: 5,
  RESOLVED: 6,
  CANCELLED: 6,
  EXPIRED: 6,
};

export const TERMINAL_INCIDENT_STATUSES = ["RESOLVED", "CANCELLED", "EXPIRED"] as const;

export function isTerminalIncidentStatus(status: EmergencyIncidentStatus) {
  return (TERMINAL_INCIDENT_STATUSES as readonly EmergencyIncidentStatus[]).includes(status);
}

/** Incidents a dashboard should keep polling and surface above everything else. */
export const ACTIVE_INCIDENT_STATUSES = [
  "SEEKING_RESPONDERS",
  "UNANSWERED",
  "ACKNOWLEDGED",
  "RESPONDER_ACCEPTED",
  "EN_ROUTE",
  "ON_SCENE",
  "TRANSPORTING",
] as const satisfies readonly EmergencyIncidentStatus[];

export function isActiveIncidentStatus(status: EmergencyIncidentStatus) {
  return (ACTIVE_INCIDENT_STATUSES as readonly EmergencyIncidentStatus[]).includes(status);
}

/**
 * True only for statuses written from a verified provider acknowledgement. Every
 * UI that says "help is on the way" must check this first.
 */
export function isResponderConfirmed(status: EmergencyIncidentStatus) {
  return STATUS_RANK[status] >= STATUS_RANK.ACKNOWLEDGED;
}

/** Statuses may only move forward, and never out of a terminal state. */
export function canAdvanceIncidentStatus(from: EmergencyIncidentStatus, to: EmergencyIncidentStatus) {
  if (isTerminalIncidentStatus(from)) return false;
  if (from === to) return false;
  return STATUS_RANK[to] > STATUS_RANK[from];
}

export type IncidentStatusCopy = {
  headline: string;
  detail: string;
  /** The single most important sentence; also used for screen readers. */
  assurance: string;
};

export function describeIncidentStatus(status: EmergencyIncidentStatus, responderLabel?: string | null): IncidentStatusCopy {
  const who = responderLabel ?? "the responding team";
  switch (status) {
    case "SEEKING_RESPONDERS":
      return {
        headline: "Requesting help",
        detail:
          "Your incident has been recorded and requests are being sent to the nearest registered responders. Nobody has accepted yet.",
        assurance: "No responder has accepted this incident yet. If you can, call the emergency number now.",
      };
    case "UNANSWERED":
      return {
        headline: "No responder has accepted",
        detail:
          "Every registered responder we reached has either declined or not replied. Preservation of this record continues, and you can retry or cancel.",
        assurance: "Nobody has accepted this incident. Call the emergency number now if you have not already.",
      };
    case "ACKNOWLEDGED":
      return {
        headline: "A responder has seen your request",
        detail: `${who} has acknowledged the incident but has not yet confirmed that a vehicle is coming.`,
        assurance: "A responder has acknowledged this incident. A vehicle is not yet confirmed.",
      };
    case "RESPONDER_ACCEPTED":
      return {
        headline: "A responder has accepted",
        detail: `${who} accepted this incident. The vehicle has not yet reported that it is moving.`,
        assurance: "A responder has accepted this incident.",
      };
    case "EN_ROUTE":
      return {
        headline: "Responder is on the way",
        detail: `${who} has confirmed they are travelling to your location.`,
        assurance: "A responder is on their way to you.",
      };
    case "ON_SCENE":
      return {
        headline: "Responder has arrived",
        detail: `${who} has reported arrival at your location.`,
        assurance: "A responder has reached your location.",
      };
    case "TRANSPORTING":
      return {
        headline: "Moving the patient",
        detail: `${who} has started the journey to the receiving facility.`,
        assurance: "The patient is being moved by the responding team.",
      };
    case "RESOLVED":
      return {
        headline: "Closed as resolved",
        detail: "The responding team or the patient recorded this incident as resolved.",
        assurance: "This incident is closed.",
      };
    case "CANCELLED":
      return {
        headline: "Cancelled by the reporter",
        detail: "This incident was cancelled. No further requests will be sent for it.",
        assurance: "This incident was cancelled.",
      };
    case "EXPIRED":
      return {
        headline: "Expired without an accepted response",
        detail:
          "The response window closed before any responder accepted. The record is retained for the audit trail but no requests are active.",
        assurance: "This incident expired with no accepted responder. Call the emergency number if help is still needed.",
      };
  }
}

export const REQUEST_STATUS_LABELS: Record<EmergencyRequestStatus, string> = {
  PENDING: "Queued",
  DELIVERED: "Delivered",
  ACKNOWLEDGED: "Seen",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  FAILED: "Not delivered",
};

/**
 * Whether a request status may be presented as a human having seen it. `DELIVERED`
 * means the transport reported success — which is a delivery receipt, not a
 * human acknowledgement, so it is deliberately excluded.
 */
export function hasHumanAcknowledged(status: EmergencyRequestStatus) {
  return status === "ACKNOWLEDGED" || status === "ACCEPTED" || status === "DECLINED";
}

/** Requests that are still worth retrying. */
export function isRetryableRequestStatus(status: EmergencyRequestStatus) {
  return status === "PENDING" || status === "DELIVERED" || status === "FAILED";
}

export const INCIDENT_EVENT_LABELS: Record<EmergencyIncidentEventType, string> = {
  CREATED: "Incident created",
  LOCATION_CAPTURED: "Location recorded",
  DISPATCH_REQUESTED: "Request sent",
  RESPONDER_ACKNOWLEDGED: "Responder acknowledged",
  RESPONDER_ACCEPTED: "Responder accepted",
  RESPONDER_DECLINED: "Responder declined",
  DISPATCH_FAILED: "Request could not be delivered",
  RETRY_SCHEDULED: "Retry scheduled",
  CONTACT_NOTIFIED: "Emergency contact notified",
  LOCATION_SHARED: "Location link issued",
  STATUS_CHANGED: "Status updated",
  CANCELLED: "Incident cancelled",
  RESOLVED: "Incident resolved",
  EXPIRED: "Response window expired",
  NOTE: "Note added",
};
