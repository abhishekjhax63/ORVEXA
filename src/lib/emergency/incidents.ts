import "server-only";

import { Prisma, type EmergencyIncident, type EmergencyIncidentEventType } from "@prisma/client";

import { createEmergencyReference } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db/prisma";
import { INCIDENT_EVENT_LABELS, canAdvanceIncidentStatus, isTerminalIncidentStatus } from "@/lib/emergency/status";
import type {
  DispatchRequestSummary,
  IncidentSummary,
  IncidentTimelineEntry,
  LocationShareSummary,
} from "@/lib/emergency/types";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import type { CreateIncidentInput } from "@/lib/validation/emergency";

/**
 * Emergency incident lifecycle.
 *
 * Three invariants hold everywhere in this file:
 *
 *  1. Status only moves forward. `transitionIncidentStatus` refuses a move that
 *     `canAdvanceIncidentStatus` rejects, and never leaves a terminal state.
 *  2. Every status change and every request outcome writes an append-only
 *     `EmergencyIncidentEvent`, so the timeline the user sees is the audit trail.
 *  3. Incident creation is idempotent on `(createdById, idempotencyKey)`, so a
 *     double-tapped SOS button cannot produce two incidents.
 */

/** How long the platform keeps trying before an unanswered incident expires. */
export const SEEKING_WINDOW_MINUTES = 30;
/** A confirmed response keeps the incident open much longer than the seeking window. */
export const RESPONDED_WINDOW_HOURS = 6;
/** Default lifetime of a location link sent to an emergency contact. */
export const LOCATION_SHARE_DEFAULT_MINUTES = 120;

type Client = Prisma.TransactionClient;

export type IncidentActor = {
  id: string;
  fullName: string;
  email: string;
};

// ---------------------------------------------------------------------------
// Events and transitions
// ---------------------------------------------------------------------------

export async function appendIncidentEvent(
  client: Client,
  input: {
    incidentId: string;
    eventType: EmergencyIncidentEventType;
    fromStatus?: EmergencyIncident["status"] | null;
    toStatus?: EmergencyIncident["status"] | null;
    actorUserId?: string | null;
    actorLabel?: string | null;
    notes?: string | null;
    metadata?: Prisma.InputJsonValue;
    at?: Date;
  },
) {
  return client.emergencyIncidentEvent.create({
    data: {
      incidentId: input.incidentId,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata,
      ...(input.at ? { createdAt: input.at } : {}),
    },
  });
}

/**
 * Moves an incident forward and records the transition.
 *
 * Returns `false` — without writing anything — when the move is backwards, a
 * no-op or out of a terminal state. Callers treat that as "the state had already
 * advanced", which is exactly what a duplicated provider acknowledgement is.
 */
export async function transitionIncidentStatus(
  client: Client,
  input: {
    incidentId: string;
    currentStatus: EmergencyIncident["status"];
    to: EmergencyIncident["status"];
    eventType: EmergencyIncidentEventType;
    actorUserId?: string | null;
    actorLabel?: string | null;
    notes?: string | null;
    metadata?: Prisma.InputJsonValue;
    data?: Prisma.EmergencyIncidentUpdateInput;
  },
): Promise<boolean> {
  if (!canAdvanceIncidentStatus(input.currentStatus, input.to)) return false;

  await client.emergencyIncident.update({
    where: { id: input.incidentId },
    data: { status: input.to, ...input.data },
  });

  await appendIncidentEvent(client, {
    incidentId: input.incidentId,
    eventType: input.eventType,
    fromStatus: input.currentStatus,
    toStatus: input.to,
    actorUserId: input.actorUserId ?? null,
    actorLabel: input.actorLabel ?? null,
    notes: input.notes ?? null,
    metadata: input.metadata,
  });

  return true;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export type CreateIncidentResult = {
  incident: EmergencyIncident;
  /** False when an existing incident was returned for the same idempotency key. */
  created: boolean;
};

export async function createEmergencyIncident(input: {
  actor: IncidentActor;
  data: CreateIncidentInput;
  context?: RequestContext;
}): Promise<CreateIncidentResult> {
  const { actor, data } = input;
  const now = new Date();

  const familyMember = data.familyMemberId ? await resolveFamilyMember(actor.id, data.familyMemberId) : null;
  const hasCoordinates = data.location.latitude !== undefined && data.location.longitude !== undefined;
  const locationConsentAt = hasCoordinates && data.location.locationConsent ? now : null;

  const createData: Prisma.EmergencyIncidentCreateInput = {
    reference: createEmergencyReference(),
    incidentType: data.incidentType,
    injuryDescription: data.injuryDescription ?? null,
    status: "SEEKING_RESPONDERS",
    idempotencyKey: data.idempotencyKey,
    contactShareConsent: data.contactShareConsent,
    expiresAt: new Date(now.getTime() + SEEKING_WINDOW_MINUTES * 60 * 1000),
    latitude: hasCoordinates ? round(data.location.latitude!) : null,
    longitude: hasCoordinates ? round(data.location.longitude!) : null,
    accuracyMetres: hasCoordinates ? (data.location.accuracyMetres ?? null) : null,
    addressText: data.location.addressText ?? null,
    locality: data.location.locality ?? null,
    city: data.location.city ?? null,
    locationConsentAt,
    createdBy: { connect: { id: actor.id } },
    patient: { connect: { id: actor.id } },
    ...(familyMember ? { familyMember: { connect: { id: familyMember.id } } } : {}),
  };

  try {
    const incident = await prisma.$transaction(async (tx) => {
      const created = await tx.emergencyIncident.create({ data: createData });
      await appendIncidentEvent(tx, {
        incidentId: created.id,
        eventType: "CREATED",
        toStatus: "SEEKING_RESPONDERS",
        actorUserId: actor.id,
        actorLabel: actor.fullName,
        notes: familyMember ? `Raised for ${familyMember.fullName}.` : "Raised for the account holder.",
        metadata: { incidentType: data.incidentType },
      });
      if (hasCoordinates) {
        await appendIncidentEvent(tx, {
          incidentId: created.id,
          eventType: "LOCATION_CAPTURED",
          actorUserId: actor.id,
          actorLabel: actor.fullName,
          notes: "Reporter consented to sharing this GPS fix for this incident.",
          metadata: {
            accuracyMetres: data.location.accuracyMetres ?? null,
            recordedAt: now.toISOString(),
          },
        });
      }
      return created;
    });

    await recordAuditEvent({
      action: "emergency.incident_created",
      entityType: "emergency_incident",
      entityId: incident.id,
      actorUserId: actor.id,
      actorLabel: actor.fullName,
      context: input.context,
      metadata: {
        reference: incident.reference,
        incidentType: incident.incidentType,
        hasCoordinates,
        forFamilyMember: Boolean(familyMember),
        contactShareConsent: data.contactShareConsent,
      },
    });

    return { incident, created: true };
  } catch (error) {
    // The unique constraint on (createdById, idempotencyKey) is the idempotency
    // guarantee: a duplicate submission lands here and returns the original.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.emergencyIncident.findFirst({
        where: { createdById: actor.id, idempotencyKey: data.idempotencyKey },
      });
      if (existing) {
        await recordAuditEvent({
          action: "emergency.duplicate_suppressed",
          entityType: "emergency_incident",
          entityId: existing.id,
          actorUserId: actor.id,
          actorLabel: actor.fullName,
          context: input.context,
          metadata: { reference: existing.reference, idempotencyKey: data.idempotencyKey },
        });
        return { incident: existing, created: false };
      }
    }
    throw error;
  }
}

async function resolveFamilyMember(actorUserId: string, familyMemberId: string) {
  const member = await prisma.familyMember.findUnique({
    where: { id: familyMemberId },
    select: { id: true, fullName: true, patientProfileId: true, patientProfile: { select: { userId: true } } },
  });
  // A family member that belongs to somebody else must never be attachable to an
  // incident, so this fails closed rather than silently raising for the actor.
  if (!member || member.patientProfile.userId !== actorUserId) {
    throw new Error("That family member is not on your account.");
  }
  return member;
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const incidentInclude = {
  requests: { orderBy: { createdAt: "asc" } },
  events: { orderBy: { createdAt: "asc" } },
  locationShares: { orderBy: { createdAt: "desc" } },
  familyMember: { select: { fullName: true } },
} satisfies Prisma.EmergencyIncidentInclude;

export type IncidentRecord = Prisma.EmergencyIncidentGetPayload<{ include: typeof incidentInclude }>;

export async function loadIncidentByReference(reference: string): Promise<IncidentRecord | null> {
  return prisma.emergencyIncident.findUnique({ where: { reference }, include: incidentInclude });
}

export async function loadIncidentById(id: string): Promise<IncidentRecord | null> {
  return prisma.emergencyIncident.findUnique({ where: { id }, include: incidentInclude });
}

export async function listIncidentsForUser(
  userId: string,
  options: { activeOnly?: boolean; limit?: number } = {},
): Promise<IncidentRecord[]> {
  return prisma.emergencyIncident.findMany({
    where: {
      OR: [{ createdById: userId }, { patientUserId: userId }],
      ...(options.activeOnly
        ? {
            status: {
              in: [
                "SEEKING_RESPONDERS",
                "UNANSWERED",
                "ACKNOWLEDGED",
                "RESPONDER_ACCEPTED",
                "EN_ROUTE",
                "ON_SCENE",
                "TRANSPORTING",
              ],
            },
          }
        : {}),
    },
    include: incidentInclude,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(options.limit ?? 20, 1), 100),
  });
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export async function cancelEmergencyIncident(input: {
  actor: IncidentActor;
  incidentId: string;
  reason?: string;
  context?: RequestContext;
}): Promise<IncidentRecord> {
  const incident = await prisma.emergencyIncident.findUnique({
    where: { id: input.incidentId },
    include: incidentInclude,
  });
  if (!incident) throw new Error("That incident no longer exists.");
  if (incident.createdById !== input.actor.id && incident.patientUserId !== input.actor.id) {
    throw new Error("That incident does not belong to your account.");
  }
  if (isTerminalIncidentStatus(incident.status)) {
    throw new Error("This incident is already closed.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await transitionIncidentStatus(tx, {
      incidentId: incident.id,
      currentStatus: incident.status,
      to: "CANCELLED",
      eventType: "CANCELLED",
      actorUserId: input.actor.id,
      actorLabel: input.actor.fullName,
      notes: input.reason ?? null,
      data: { cancelledAt: now, cancellationReason: input.reason ?? null },
    });
    // Any link already in flight stops working the moment the incident is closed.
    await tx.emergencyLocationShare.updateMany({
      where: { incidentId: incident.id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    });
    await tx.emergencyDispatchRequest.updateMany({
      where: { incidentId: incident.id, status: { in: ["PENDING", "DELIVERED"] } },
      data: { status: "EXPIRED", failureReason: "The reporter cancelled the incident." },
    });
  });

  await recordAuditEvent({
    action: "emergency.incident_cancelled",
    entityType: "emergency_incident",
    entityId: incident.id,
    actorUserId: input.actor.id,
    actorLabel: input.actor.fullName,
    context: input.context,
    metadata: { reference: incident.reference, hadReason: Boolean(input.reason) },
  });

  const reloaded = await loadIncidentById(incident.id);
  if (!reloaded) throw new Error("That incident no longer exists.");
  return reloaded;
}

// ---------------------------------------------------------------------------
// Expiry maintenance
// ---------------------------------------------------------------------------

/**
 * Expires incidents whose response window closed without an accepted responder.
 * Incidents that reached a confirmed response are left alone — a crew that is on
 * scene must never have its incident closed underneath it by a cron job.
 */
export async function expireStaleIncidents(limit = 100) {
  const candidates = await prisma.emergencyIncident.findMany({
    where: {
      status: { in: ["SEEKING_RESPONDERS", "UNANSWERED", "ACKNOWLEDGED"] },
      expiresAt: { lte: new Date() },
    },
    select: { id: true, status: true, reference: true },
    take: limit,
  });

  let expired = 0;
  for (const candidate of candidates) {
    const didExpire = await prisma.$transaction(async (tx) =>
      transitionIncidentStatus(tx, {
        incidentId: candidate.id,
        currentStatus: candidate.status,
        to: "EXPIRED",
        eventType: "EXPIRED",
        actorLabel: "system",
        notes: "The response window closed before any responder accepted this incident.",
      }),
    );
    if (didExpire) {
      expired += 1;
      await recordAuditEvent({
        action: "emergency.incident_expired",
        entityType: "emergency_incident",
        entityId: candidate.id,
        actorLabel: "system",
        metadata: { reference: candidate.reference, fromStatus: candidate.status },
      });
    }
  }

  await prisma.emergencyDispatchRequest.updateMany({
    where: {
      status: { in: ["PENDING", "DELIVERED"] },
      incident: { status: { in: ["EXPIRED", "CANCELLED"] } },
    },
    data: { status: "EXPIRED", failureReason: "The incident closed before a response." },
  });

  return expired;
}

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

export function toIncidentSummary(record: IncidentRecord, shareLinks?: Map<string, string>): IncidentSummary {
  return {
    id: record.id,
    reference: record.reference,
    incidentType: record.incidentType,
    injuryDescription: record.injuryDescription,
    status: record.status,
    isDemo: record.isDemo,
    createdAtISO: record.createdAt.toISOString(),
    updatedAtISO: record.updatedAt.toISOString(),
    expiresAtISO: record.expiresAt.toISOString(),
    acknowledgedAtISO: record.acknowledgedAt?.toISOString() ?? null,
    cancelledAtISO: record.cancelledAt?.toISOString() ?? null,
    cancellationReason: record.cancellationReason,
    resolvedAtISO: record.resolvedAt?.toISOString() ?? null,
    retryCount: record.retryCount,
    lastRetryAtISO: record.lastRetryAt?.toISOString() ?? null,
    contactShareConsent: record.contactShareConsent,
    patientLabel: record.familyMember?.fullName ?? null,
    location: buildLocationSummary(record),
    timeline: buildTimeline(record),
    requests: record.requests.map(toRequestSummary),
    locationShares: record.locationShares.map((share) => toLocationShareSummary(share, shareLinks?.get(share.id) ?? null)),
  };
}

function buildLocationSummary(record: IncidentRecord): IncidentSummary["location"] {
  if (
    record.latitude === null &&
    record.longitude === null &&
    !record.addressText &&
    !record.locality &&
    !record.city
  ) {
    return null;
  }
  return {
    latitude: record.latitude,
    longitude: record.longitude,
    accuracyMetres: record.accuracyMetres,
    addressText: record.addressText,
    locality: record.locality,
    city: record.city,
    consentAtISO: record.locationConsentAt?.toISOString() ?? null,
  };
}

function buildTimeline(record: IncidentRecord): IncidentTimelineEntry[] {
  return record.events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    label: INCIDENT_EVENT_LABELS[event.eventType],
    notes: event.notes,
    actorLabel: event.actorLabel,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    atISO: event.createdAt.toISOString(),
  }));
}

function toRequestSummary(request: IncidentRecord["requests"][number]): DispatchRequestSummary {
  return {
    id: request.id,
    responderKind: request.responderKind,
    responderLabel: request.responderLabel,
    status: request.status,
    channel: request.channel,
    attemptCount: request.attemptCount,
    lastAttemptAtISO: request.lastAttemptAt?.toISOString() ?? null,
    acknowledgedAtISO: request.acknowledgedAt?.toISOString() ?? null,
    respondedAtISO: request.respondedAt?.toISOString() ?? null,
    declineReason: request.declineReason,
    failureReason: request.failureReason,
    distanceMetres: request.distanceMetres,
    etaMinutes: request.etaMinutes,
    acknowledged: request.status === "ACKNOWLEDGED" || request.status === "ACCEPTED" || request.status === "DECLINED",
  };
}

function toLocationShareSummary(
  share: IncidentRecord["locationShares"][number],
  link: string | null,
): LocationShareSummary {
  return {
    id: share.id,
    contactLabel: share.contactLabel,
    status: share.status,
    expiresAtISO: share.expiresAt.toISOString(),
    viewedAtISO: share.viewedAt?.toISOString() ?? null,
    viewCount: share.viewCount,
    link,
  };
}

/** Compact label used in audit metadata so references, not bodies, are recorded. */
export function incidentAuditLabel(record: { reference: string; status: EmergencyIncident["status"] }) {
  return `${record.reference} (${record.status})`;
}
