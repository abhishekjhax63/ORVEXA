import type {
  EmergencyIncidentEventType,
  EmergencyIncidentStatus,
  EmergencyIncidentType,
  EmergencyRequestChannel,
  EmergencyRequestStatus,
  EmergencyResponderKind,
  LocationShareStatus,
} from "@prisma/client";

/**
 * Serialisable view models passed from Server Components to Client Components.
 *
 * Everything is a plain value with ISO date strings rather than `Date`
 * instances, so the status card, the timeline and the polling route handler all
 * consume exactly the same shape and nothing is lost in serialisation.
 */

export type IncidentLocationSummary = {
  latitude: number | null;
  longitude: number | null;
  accuracyMetres: number | null;
  addressText: string | null;
  locality: string | null;
  city: string | null;
  /** Set only when the reporter consented to sharing it for this incident. */
  consentAtISO: string | null;
};

export type IncidentTimelineEntry = {
  id: string;
  eventType: EmergencyIncidentEventType;
  label: string;
  notes: string | null;
  actorLabel: string | null;
  fromStatus: EmergencyIncidentStatus | null;
  toStatus: EmergencyIncidentStatus | null;
  atISO: string;
};

export type DispatchRequestSummary = {
  id: string;
  responderKind: EmergencyResponderKind;
  responderLabel: string;
  status: EmergencyRequestStatus;
  channel: EmergencyRequestChannel;
  attemptCount: number;
  lastAttemptAtISO: string | null;
  acknowledgedAtISO: string | null;
  respondedAtISO: string | null;
  declineReason: string | null;
  failureReason: string | null;
  distanceMetres: number | null;
  etaMinutes: number | null;
  /** True only when a provider integration confirmed a human acted on it. */
  acknowledged: boolean;
};

export type LocationShareSummary = {
  id: string;
  contactLabel: string;
  status: LocationShareStatus;
  expiresAtISO: string;
  viewedAtISO: string | null;
  viewCount: number;
  /**
   * Populated only in the response that creates the link — the plaintext token is
   * never stored, so it cannot be re-read afterwards.
   */
  link: string | null;
};

export type IncidentSummary = {
  id: string;
  reference: string;
  incidentType: EmergencyIncidentType;
  injuryDescription: string | null;
  status: EmergencyIncidentStatus;
  isDemo: boolean;
  createdAtISO: string;
  updatedAtISO: string;
  expiresAtISO: string;
  acknowledgedAtISO: string | null;
  cancelledAtISO: string | null;
  cancellationReason: string | null;
  resolvedAtISO: string | null;
  retryCount: number;
  lastRetryAtISO: string | null;
  contactShareConsent: boolean;
  patientLabel: string | null;
  location: IncidentLocationSummary | null;
  timeline: IncidentTimelineEntry[];
  requests: DispatchRequestSummary[];
  locationShares: LocationShareSummary[];
};

export type IncidentCapabilitySummary = {
  /** At least one transport exists and the deployment may attempt a send. */
  automatedDispatchAvailable: boolean;
  /** The deployment has been told to attempt outbound requests at all. */
  dispatchModeAllowsSending: boolean;
  /** Whether the region's dial numbers have been confirmed for this release. */
  numbersVerified: boolean;
  /** Human-readable explanation shown next to the manual-call fallback. */
  fallbackNotice: string;
};
