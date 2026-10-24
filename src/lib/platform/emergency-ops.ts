import "server-only";

import type {
  EmergencyIncidentStatus,
  EmergencyRequestChannel,
  EmergencyRequestStatus,
  EmergencyResponderKind,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { emergencyConfig } from "@/lib/emergency/config";
import { getDispatchCapability } from "@/lib/emergency/delivery";
import { appendIncidentEvent, loadIncidentById } from "@/lib/emergency/incidents";
import { INCIDENT_STATUS_LABELS } from "@/lib/emergency/status";
import {
  getEmailProviderConfig,
  getEmergencyDispatchConfig,
  getLabIntegrationConfig,
  getMapsServerConfig,
  getPaymentProviderConfig,
  getSmsProviderConfig,
  getVideoProviderConfig,
} from "@/lib/env";
import { actingOperatorLabel, recordPlatformAction, type PlatformContext } from "@/lib/platform/console";
import { platformFail, platformOk, type PlatformResult } from "@/lib/platform/errors";
import { alertFingerprint, listAlerts, raiseAlert, resolveAlert } from "@/lib/security/alerts";
import { sanitiseMultiline } from "@/lib/security/sanitize";
import type { EmergencyOperatorNoteInput, IntegrationProbeInput } from "@/lib/validation/platform";

/**
 * Emergency operations for the console.
 *
 * ## What this module can and cannot do
 *
 * It reads the emergency record and it can annotate it. It cannot move an
 * incident's status, acknowledge a dispatch, accept on a crew's behalf or
 * declare that help is coming. Those transitions belong to the response service
 * and only ever happen when a provider-side integration confirms them — see
 * `EmergencyDispatchRequest`'s comment in the schema. An operator watching this
 * queue is a *reader*: their job is to notice that nobody has acknowledged an
 * SOS and to escalate out of band, and the console's copy says exactly that.
 *
 * ## The number that matters
 *
 * `awaitingAcknowledgement` is the count that makes this queue worth having. An
 * incident in `SEEKING_RESPONDERS` whose requests were all delivered but none
 * acknowledged is the state where a person believes help was called and nobody
 * has answered. Counting "requests sent" would hide it; counting acknowledged
 * requests against total requests is what surfaces it.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type DispatchRequestView = {
  id: string;
  responderKind: EmergencyResponderKind;
  responderLabel: string;
  channel: EmergencyRequestChannel;
  status: EmergencyRequestStatus;
  attemptCount: number;
  lastAttemptAt: Date | null;
  acknowledgedAt: Date | null;
  respondedAt: Date | null;
  declineReason: string | null;
  failureReason: string | null;
  etaMinutes: number | null;
};

export type DispatchProgress = {
  total: number;
  pending: number;
  delivered: number;
  acknowledged: number;
  accepted: number;
  declined: number;
  failed: number;
  /** True when requests exist, none is acknowledged, and the incident is still seeking. */
  awaitingAcknowledgement: boolean;
};

export type EmergencyIncidentListItem = {
  id: string;
  reference: string;
  status: EmergencyIncidentStatus;
  statusLabel: string;
  incidentType: string;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  locality: string | null;
  city: string | null;
  dispatch: DispatchProgress;
};

export type EmergencyIncidentDetail = EmergencyIncidentListItem & {
  injuryDescription: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMetres: number | null;
  addressText: string | null;
  requests: DispatchRequestView[];
  events: Array<{
    id: string;
    eventType: string;
    notes: string | null;
    actorLabel: string | null;
    createdAt: Date;
  }>;
};

export type EmergencyQueueSummary = {
  active: number;
  awaitingAcknowledgement: number;
  failedRequests: number;
  expiredLast24Hours: number;
};

export type EmergencyIncidentQuery = {
  status?: EmergencyIncidentStatus;
  /** Defaults to real incidents only; demo rows must be asked for. */
  includeDemo?: boolean;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Statuses where the incident is still live and a responder is still expected. */
const ACTIVE_STATUSES: EmergencyIncidentStatus[] = [
  "SEEKING_RESPONDERS",
  "ACKNOWLEDGED",
  "RESPONDER_ACCEPTED",
  "EN_ROUTE",
  "ON_SCENE",
  "TRANSPORTING",
];

function progressFrom(requests: ReadonlyArray<{ status: EmergencyRequestStatus }>, status: EmergencyIncidentStatus): DispatchProgress {
  const count = (value: EmergencyRequestStatus) => requests.filter((entry) => entry.status === value).length;

  const pending = count("PENDING");
  const delivered = count("DELIVERED");
  const acknowledged = count("ACKNOWLEDGED");
  const accepted = count("ACCEPTED");
  const declined = count("DECLINED");
  const failed = count("FAILED");

  return {
    total: requests.length,
    pending,
    delivered,
    acknowledged,
    accepted,
    declined,
    failed,
    awaitingAcknowledgement:
      requests.length > 0 &&
      admittedNothingYet(requests) &&
      (status === "SEEKING_RESPONDERS" || status === "UNANSWERED"),
  };
}

/** True when every request is still unacknowledged. */
function admittedNothingYet(requests: ReadonlyArray<{ status: EmergencyRequestStatus }>): boolean {
  return requests.every((entry) => entry.status === "PENDING" || entry.status === "DELIVERED");
}

const LIST_SELECT = {
  id: true,
  reference: true,
  status: true,
  incidentType: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  locality: true,
  city: true,
  requests: { select: { status: true } },
} satisfies Prisma.EmergencyIncidentSelect;

function toListItem(row: {
  id: string;
  reference: string;
  status: EmergencyIncidentStatus;
  incidentType: string;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  locality: string | null;
  city: string | null;
  requests: Array<{ status: EmergencyRequestStatus }>;
}): EmergencyIncidentListItem {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    statusLabel: INCIDENT_STATUS_LABELS[row.status],
    incidentType: row.incidentType,
    isDemo: row.isDemo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    locality: row.locality,
    city: row.city,
    dispatch: progressFrom(row.requests, row.status),
  };
}

export async function listEmergencyIncidents(
  input: EmergencyIncidentQuery = {},
): Promise<{ items: EmergencyIncidentListItem[]; total: number; summary: EmergencyQueueSummary }> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(Math.max(1, input.pageSize ?? 25), 100);

  const where: Prisma.EmergencyIncidentWhereInput = {
    // Demo rows are excluded unless explicitly requested: a seeded rehearsal
    // must never be counted among live incidents on an operations screen.
    ...(input.includeDemo ? {} : { isDemo: false }),
    ...(input.status ? { status: input.status } : {}),
    ...(input.from || input.to
      ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
      : {}),
  };

  const [rows, total, activeRequests, failedRequests, expiredLast24Hours] = await Promise.all([
    prisma.emergencyIncident.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.emergencyIncident.count({ where }),
    prisma.emergencyIncident.findMany({
      where: {
        isDemo: input.includeDemo ? undefined : false,
        status: { in: ACTIVE_STATUSES },
      },
      select: { status: true, requests: { select: { status: true } } },
      // Live incidents are few by nature; the ceiling is a guard against a
      // runaway fan-out, not a page size.
      take: 500,
    }),
    prisma.emergencyDispatchRequest.count({ where: { status: "FAILED", incident: { isDemo: false } } }),
    prisma.emergencyIncident.count({
      where: {
        isDemo: false,
        status: { in: ["EXPIRED", "UNANSWERED"] },
        updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const awaitingAcknowledgement = activeRequests.filter((incident) =>
    progressFrom(incident.requests, incident.status).awaitingAcknowledgement,
  ).length;

  return {
    items: rows.map(toListItem),
    total,
    summary: {
      active: activeRequests.length,
      awaitingAcknowledgement,
      failedRequests,
      expiredLast24Hours,
    },
  };
}

export async function loadEmergencyIncident(input: {
  incidentId: string;
}): Promise<EmergencyIncidentDetail | null> {
  const record = await loadIncidentById(input.incidentId);
  if (!record) return null;

  const base = toListItem({
    id: record.id,
    reference: record.reference,
    status: record.status,
    incidentType: record.incidentType,
    isDemo: record.isDemo,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    locality: record.locality,
    city: record.city,
    requests: record.requests.map((request) => ({ status: request.status })),
  });

  return {
    ...base,
    injuryDescription: record.injuryDescription,
    latitude: record.latitude,
    longitude: record.longitude,
    accuracyMetres: record.accuracyMetres,
    addressText: record.addressText,
    requests: record.requests.map((request) => ({
      id: request.id,
      responderKind: request.responderKind,
      responderLabel: request.responderLabel,
      channel: request.channel,
      status: request.status,
      attemptCount: request.attemptCount,
      lastAttemptAt: request.lastAttemptAt,
      acknowledgedAt: request.acknowledgedAt,
      respondedAt: request.respondedAt,
      declineReason: request.declineReason,
      failureReason: request.failureReason,
      etaMinutes: request.etaMinutes,
    })),
    // The event timeline is the incident's own audit trail, so an operator sees
    // the same history the patient does rather than a parallel one.
    events: record.events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      notes: event.notes,
      actorLabel: event.actorLabel,
      createdAt: event.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Operator annotation
// ---------------------------------------------------------------------------

/**
 * Appends an operator note to an incident's timeline.
 *
 * The note is `NOTE`-typed and carries no status change, which is the whole
 * point: it is how an operator records "called the ambulance control room at
 * 14:20, they are sending a unit" without the platform asserting anything about
 * the dispatch's own state. The note is sanitised and attributed.
 */
export async function addEmergencyOperatorNote(input: {
  context: PlatformContext;
  data: EmergencyOperatorNoteInput;
}): Promise<PlatformResult<{ incidentId: string; noteId: string }>> {
  const { context, data } = input;

  const incident = await prisma.emergencyIncident.findUnique({
    where: { id: data.incidentId },
    select: { id: true, reference: true, status: true },
  });
  if (!incident) return platformFail("incident_not_found", "That emergency incident was not found.");

  const label = actingOperatorLabel(context);
  const note = sanitiseMultiline(data.note, 2000);

  const event = await appendIncidentEvent(prisma, {
    incidentId: incident.id,
    eventType: "NOTE",
    actorUserId: context.user.id,
    // Prefixed so a reader can tell a platform operator's note apart from the
    // patient's own actions in the same timeline.
    actorLabel: `Platform operations — ${label}`,
    notes: note,
  });

  await recordPlatformAction({
    context,
    action: "platform.emergency_note_added",
    entityType: "emergency_incident",
    entityId: incident.id,
    metadata: { reference: incident.reference, operator: label },
  });

  return platformOk({ incidentId: incident.id, noteId: event.id });
}

// ---------------------------------------------------------------------------
// Integration monitoring
// ---------------------------------------------------------------------------

export type IntegrationState = "configured" | "not_configured";

export type IntegrationStatus = {
  provider: IntegrationProbeInput["provider"];
  label: string;
  state: IntegrationState;
  detail: string;
};

/**
 * Reports whether each outbound integration is configured on this deployment.
 *
 * This is a *configuration* check, not a live vendor round-trip, and the
 * response says so. Claiming a provider is "healthy" because an environment
 * variable is set would be exactly the kind of unverified success the platform
 * forbids; what an operator needs here is "this deployment cannot send an SMS at
 * all", which is a fact we can state honestly.
 */
export function integrationStatuses(): IntegrationStatus[] {
  const payment = getPaymentProviderConfig();
  const video = getVideoProviderConfig();
  const maps = getMapsServerConfig();
  const lab = getLabIntegrationConfig();
  const sms = getSmsProviderConfig();
  const email = getEmailProviderConfig();

  const dispatchCapability = getDispatchCapability(emergencyConfig.dispatchMode);
  const dispatch = getEmergencyDispatchConfig();

  return [
    {
      provider: "PAYMENT",
      label: "Payment gateway",
      state: payment.mode === "sandbox" ? "not_configured" : "configured",
      detail:
        payment.mode === "sandbox"
          ? "No gateway credentials; payments record against the sandbox provider."
          : `Gateway configured in ${payment.isLive ? "live" : "test"} mode.`,
    },
    {
      provider: "VIDEO",
      label: "Video consultations",
      state: video.mode === "sandbox" ? "not_configured" : "configured",
      detail: video.mode === "sandbox" ? "No video provider; consultations cannot start." : "Video provider configured.",
    },
    {
      provider: "GEOCODING",
      label: "Maps and geocoding",
      state: maps ? "configured" : "not_configured",
      detail: maps ? `Serving through ${maps.provider}.` : "No maps server token; address lookups are unavailable.",
    },
    {
      provider: "LIS",
      label: "Laboratory systems",
      state: lab ? "configured" : "not_configured",
      detail: lab ? "Laboratory API configured." : "No laboratory API; bookings are worked from the partner console.",
    },
    {
      provider: "SMS",
      label: "SMS",
      state: sms ? "configured" : "not_configured",
      detail: sms ? "SMS provider configured." : "No SMS provider; no message can be sent.",
    },
    {
      provider: "EMAIL",
      label: "Email",
      state: email ? "configured" : "not_configured",
      detail: email ? "Email provider configured." : "No email provider; no message can be sent.",
    },
    {
      provider: "DISPATCH",
      label: "Emergency dispatch",
      state: dispatchCapability.automatedDispatchAvailable ? "configured" : "not_configured",
      detail: dispatch
        ? `Dispatch mode is "${emergencyConfig.dispatchMode}".`
        : "No dispatch webhook; SOS requests are recorded and handed to the user to dial, never sent.",
    },
  ];
}

export type IntegrationProbeOutcome = {
  provider: IntegrationProbeInput["provider"];
  status: IntegrationStatus;
  alertRaised: boolean;
  alertResolved: boolean;
};

/**
 * Records an integration's configuration state as an alert.
 *
 * A missing dispatch webhook or a missing messaging provider is a real
 * operational problem — it means the platform silently cannot do something a
 * screen implies it can — so the probe opens an alert for it and resolves any
 * alert this deployment previously opened for the same provider once it is
 * configured again. The fingerprint is derived from the provider alone, so
 * repeated probes fold into one row instead of stacking.
 */
export async function probeIntegration(input: {
  context: PlatformContext;
  data: IntegrationProbeInput;
}): Promise<PlatformResult<IntegrationProbeOutcome>> {
  const { context, data } = input;
  const status = integrationStatuses().find((entry) => entry.provider === data.provider);
  if (!status) return platformFail("not_found", "That integration is not monitored.");

  const label = actingOperatorLabel(context);
  const fingerprint = alertFingerprint(["integration", status.provider]);

  let alertRaised = false;
  let alertResolved = false;

  if (status.state === "not_configured") {
    const raised = await raiseAlert({
      kind: "INTEGRATION",
      severity: status.provider === "DISPATCH" ? "CRITICAL" : "WARNING",
      source: `integration.${status.provider.toLowerCase()}`,
      title: `${status.label} is not configured`,
      detail: status.detail,
      fingerprint,
      metadata: { provider: status.provider },
    });
    alertRaised = raised.created;
  } else {
    // `source` is derived from the provider, so at most one alert can carry it.
    const open = await listAlerts({
      kind: "INTEGRATION",
      status: "OPEN",
      source: `integration.${status.provider.toLowerCase()}`,
      limit: 10,
    });
    const match = open[0];
    if (match) {
      await resolveAlert({
        alertId: match.id,
        actorUserId: context.user.id,
        actorLabel: label,
        note: `Confirmed configured by ${label}.`,
      });
      alertResolved = true;
    }
  }

  await recordPlatformAction({
    context,
    action: "platform.integration_health_checked",
    entityType: "integration_alert",
    entityId: null,
    metadata: { provider: status.provider, state: status.state, alertRaised, alertResolved, operator: label },
  });

  return platformOk({ provider: status.provider, status, alertRaised, alertResolved });
}

export type FailedDispatchView = {
  id: string;
  incidentId: string;
  incidentReference: string;
  responderLabel: string;
  responderKind: EmergencyResponderKind;
  channel: EmergencyRequestChannel;
  status: EmergencyRequestStatus;
  attemptCount: number;
  lastAttemptAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
};

/**
 * The failed and stalled dispatch requests an operator has to act on.
 *
 * Two kinds of trouble are returned together because they are the same kind of
 * trouble from a dispatcher's point of view: a request that could not be sent
 * (`FAILED`) and a request that was sent but never acknowledged. Demo incidents
 * are excluded — a rehearsal's failure is not an operational incident.
 */
export async function listDispatchTrouble(input: { limit?: number } = {}): Promise<FailedDispatchView[]> {
  const rows = await prisma.emergencyDispatchRequest.findMany({
    where: {
      incident: { isDemo: false },
      OR: [
        { status: "FAILED" },
        // Sent, no acknowledgement, and the incident is still seeking: the state
        // an operator must chase by phone.
        {
          status: { in: ["PENDING", "DELIVERED"] },
          acknowledgedAt: null,
          incident: { isDemo: false, status: { in: ["SEEKING_RESPONDERS", "UNANSWERED"] } },
        },
      ],
    },
    include: { incident: { select: { id: true, reference: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 100, 500),
  });

  return rows.map((row) => ({
    id: row.id,
    incidentId: row.incident.id,
    incidentReference: row.incident.reference,
    responderLabel: row.responderLabel,
    responderKind: row.responderKind,
    channel: row.channel,
    status: row.status,
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
  }));
}
