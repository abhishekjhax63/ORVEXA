import "server-only";

import { Prisma, type EmergencyIncident } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { boundingBox, haversineMetres } from "@/lib/maps/geo";
import { emergencyConfig } from "@/lib/emergency/config";
import { deliverDispatchRequest, getDispatchCapability, type DispatchPayload } from "@/lib/emergency/delivery";
import {
  RESPONDED_WINDOW_HOURS,
  appendIncidentEvent,
  loadIncidentById,
  transitionIncidentStatus,
  type IncidentActor,
  type IncidentRecord,
} from "@/lib/emergency/incidents";
import { isRetryableRequestStatus } from "@/lib/emergency/status";
import { recordAuditEvent } from "@/lib/security/audit";
import { getPublicBaseUrl, getEmergencyResponderSecret } from "@/lib/env";
import type { RequestContext } from "@/lib/security/request";
import type { ResponderDecisionInput } from "@/lib/validation/emergency";

/**
 * Dispatch fan-out and provider decisions.
 *
 * Two separations are load-bearing:
 *
 *  - **Sending is not accepting.** A request row only leaves PENDING/DELIVERED
 *    when a provider integration, authenticated with the responder secret, says
 *    so. Nothing in the patient-facing flow can mark a responder as coming.
 *  - **Fan-out is idempotent.** `(incidentId, dedupeKey)` is unique in the
 *    database, so a retry, a double tap or a replayed webhook can only ever
 *    produce one request per responder.
 */

export const MAX_DISPATCH_ATTEMPTS = 3;
/** How far around the incident point the platform looks for responders. */
export const DISPATCH_RADIUS_METRES = 15_000;

export type ResponderCandidate = {
  dedupeKey: string;
  responderKind: "HOSPITAL_EMERGENCY" | "AMBULANCE_PARTNER" | "PARTNER_FACILITY";
  hospitalId: string | null;
  ambulancePartnerId: string | null;
  partnerFacilityId: string | null;
  label: string;
  contactPhone: string | null;
  distanceMetres: number | null;
  /** Why this responder is eligible, recorded for the audit trail. */
  eligibility: string;
};

export type DispatchOutcome = {
  /** Requests that exist for this incident after the fan-out. */
  requested: number;
  /** Requests the transport accepted this run. */
  delivered: number;
  /** Requests the transport could not carry this run. */
  failed: number;
  /** True when there is no configured transport, so nothing could be sent. */
  transportUnavailable: boolean;
  /** True when no eligible responder was found at all. */
  noEligibleResponders: boolean;
  candidates: number;
  notice: string;
};

function incidentPoint(incident: IncidentRecord) {
  if (incident.latitude === null || incident.longitude === null) return null;
  return { latitude: incident.latitude, longitude: incident.longitude };
}

/**
 * Resolves the responders eligible for this incident.
 *
 * Eligibility is deliberately strict: a hospital must be published, verified and
 * declare 24×7 emergency cover; an ambulance operator must be verified and have
 * explicitly opted in to receiving requests. A listing on its own never makes a
 * responder eligible.
 */
export async function resolveDispatchCandidates(incident: IncidentRecord): Promise<ResponderCandidate[]> {
  const point = incidentPoint(incident);
  const box = point ? boundingBox(point, DISPATCH_RADIUS_METRES) : null;
  const city = incident.city ?? null;

  // Without a point and without a city there is nothing to search around, and
  // guessing a location for an emergency is not acceptable.
  if (!point && !city) return [];

  const [hospitals, ambulancePartners, ambulanceFacilities] = await Promise.all([
    prisma.hospital.findMany({
      where: {
        deletedAt: null,
        publishedAt: { not: null },
        verificationStatus: "VERIFIED",
        emergency24x7: true,
        ...(box
          ? {
              latitude: { gte: box.minLatitude, lte: box.maxLatitude },
              longitude: { gte: box.minLongitude, lte: box.maxLongitude },
            }
          : { city: { equals: city!, mode: "insensitive" } }),
      },
      select: { id: true, name: true, phone: true, city: true, latitude: true, longitude: true },
      take: 25,
    }),
    prisma.ambulancePartnerProfile.findMany({
      where: {
        verificationStatus: "VERIFIED",
        acceptingRequests: true,
        ...(city ? { coverageCities: { has: city } } : {}),
      },
      select: {
        id: true,
        organizationName: true,
        contactPhone: true,
        coverageCities: true,
        units: {
          where: { latitude: { not: null }, longitude: { not: null } },
          select: { latitude: true, longitude: true },
        },
      },
      take: 25,
    }),
    prisma.partnerFacility.findMany({
      where: {
        deletedAt: null,
        publishedAt: { not: null },
        partnerType: "AMBULANCE",
        verificationStatus: "VERIFIED",
        ...(box
          ? {
              latitude: { gte: box.minLatitude, lte: box.maxLatitude },
              longitude: { gte: box.minLongitude, lte: box.maxLongitude },
            }
          : { city: { equals: city!, mode: "insensitive" } }),
      },
      select: { id: true, name: true, phone: true, latitude: true, longitude: true },
      take: 25,
    }),
  ]);

  const candidates: ResponderCandidate[] = [];

  for (const hospital of hospitals) {
    const distanceMetres = point ? haversineMetres(point, { latitude: hospital.latitude!, longitude: hospital.longitude! }) : null;
    if (distanceMetres !== null && distanceMetres > DISPATCH_RADIUS_METRES) continue;
    candidates.push({
      dedupeKey: `hospital:${hospital.id}`,
      responderKind: "HOSPITAL_EMERGENCY",
      hospitalId: hospital.id,
      ambulancePartnerId: null,
      partnerFacilityId: null,
      label: hospital.name,
      contactPhone: hospital.phone,
      distanceMetres: distanceMetres === null ? null : Math.round(distanceMetres),
      eligibility: "Published, platform-verified hospital declaring 24×7 emergency cover.",
    });
  }

  for (const partner of ambulancePartners) {
    const nearest = point
      ? partner.units
          .map((unit) => haversineMetres(point, { latitude: unit.latitude!, longitude: unit.longitude! }))
          .sort((a, b) => a - b)[0]
      : undefined;
    const distanceMetres = nearest ?? null;
    if (distanceMetres !== null && distanceMetres > DISPATCH_RADIUS_METRES) continue;
    candidates.push({
      dedupeKey: `ambulance:${partner.id}`,
      responderKind: "AMBULANCE_PARTNER",
      hospitalId: null,
      ambulancePartnerId: partner.id,
      partnerFacilityId: null,
      label: partner.organizationName,
      contactPhone: partner.contactPhone,
      distanceMetres: distanceMetres === null ? null : Math.round(distanceMetres),
      eligibility: "Verified operator that has opted in to receive emergency requests.",
    });
  }

  for (const facility of ambulanceFacilities) {
    const distanceMetres = point
      ? haversineMetres(point, { latitude: facility.latitude!, longitude: facility.longitude! })
      : null;
    if (distanceMetres !== null && distanceMetres > DISPATCH_RADIUS_METRES) continue;
    candidates.push({
      dedupeKey: `facility:${facility.id}`,
      responderKind: "PARTNER_FACILITY",
      hospitalId: null,
      ambulancePartnerId: null,
      partnerFacilityId: facility.id,
      label: facility.name,
      contactPhone: facility.phone,
      distanceMetres: distanceMetres === null ? null : Math.round(distanceMetres),
      eligibility: "Verified ambulance partner facility.",
    });
  }

  candidates.sort((a, b) => {
    if (a.distanceMetres === null && b.distanceMetres === null) return a.label.localeCompare(b.label);
    if (a.distanceMetres === null) return 1;
    if (b.distanceMetres === null) return -1;
    return a.distanceMetres - b.distanceMetres;
  });

  return candidates;
}

function buildPayload(incident: IncidentRecord, requestId: string, candidate: ResponderCandidate, attempt: number): DispatchPayload {
  const origin = getPublicBaseUrl();
  return {
    event: "emergency.dispatch.request",
    incidentReference: incident.reference,
    requestId,
    responderKind: candidate.responderKind,
    responderLabel: candidate.label,
    incidentType: incident.incidentType,
    injuryDescription: incident.injuryDescription,
    location: {
      latitude: incident.latitude,
      longitude: incident.longitude,
      accuracyMetres: incident.accuracyMetres,
      addressText: incident.addressText,
      locality: incident.locality,
      city: incident.city,
      reportedAt: incident.createdAt.toISOString(),
    },
    attempt,
    callback: {
      acknowledgeUrl: `${origin}/api/emergency/respond?requestId=${requestId}&decision=ACKNOWLEDGE`,
      declineUrl: `${origin}/api/emergency/respond?requestId=${requestId}&decision=DECLINE`,
    },
    sentAt: new Date().toISOString(),
  };
}

/**
 * Creates the request rows for every eligible responder and attempts delivery.
 *
 * Safe to call twice: existing rows are reused, and only rows that have never
 * been attempted are sent. Status is only advanced from a transport response.
 */
export async function dispatchIncident(
  incident: IncidentRecord,
  options: { actorLabel?: string; context?: RequestContext } = {},
): Promise<DispatchOutcome> {
  const capability = getDispatchCapability(emergencyConfig.dispatchMode);
  const candidates = await resolveDispatchCandidates(incident);

  if (candidates.length === 0) {
    await prisma.$transaction(async (tx) => {
      await appendIncidentEvent(tx, {
        incidentId: incident.id,
        eventType: "DISPATCH_FAILED",
        actorLabel: options.actorLabel ?? "system",
        notes:
          "No eligible responder was found for this location. Every registered responder nearby is either unverified, has not opted in, or has no 24×7 emergency cover on record.",
      });
      await transitionIncidentStatus(tx, {
        incidentId: incident.id,
        currentStatus: incident.status,
        to: "UNANSWERED",
        eventType: "STATUS_CHANGED",
        actorLabel: options.actorLabel ?? "system",
        notes: "No eligible responder was available, so no request could be placed.",
      });
    });
    await recordAuditEvent({
      action: "emergency.dispatch_failed",
      entityType: "emergency_incident",
      entityId: incident.id,
      actorLabel: options.actorLabel ?? "system",
      context: options.context,
      outcome: "FAILURE",
      metadata: { reason: "no_eligible_responders", reference: incident.reference },
    });
    return {
      requested: 0,
      delivered: 0,
      failed: 0,
      transportUnavailable: !capability.automatedDispatchAvailable,
      noEligibleResponders: true,
      candidates: 0,
      notice: "No verified responder was available for this location.",
    };
  }

  // One row per responder. `skipDuplicates` leans on the unique constraint, so a
  // retry or a replayed call can never double up a dispatch.
  await prisma.emergencyDispatchRequest.createMany({
    data: candidates.map((candidate) => ({
      incidentId: incident.id,
      responderKind: candidate.responderKind,
      dedupeKey: candidate.dedupeKey,
      hospitalId: candidate.hospitalId,
      ambulancePartnerId: candidate.ambulancePartnerId,
      partnerFacilityId: candidate.partnerFacilityId,
      responderLabel: candidate.label,
      status: "PENDING" as const,
      channel: capability.webhookConfigured ? ("WEBHOOK" as const) : ("MANUAL_CALL" as const),
      distanceMetres: candidate.distanceMetres,
    })),
    skipDuplicates: true,
  });

  const rows = await prisma.emergencyDispatchRequest.findMany({
    where: { incidentId: incident.id },
    orderBy: { createdAt: "asc" },
  });

  let delivered = 0;
  let failed = 0;

  for (const row of rows) {
    // Already attempted in a previous run: leave the recorded outcome alone.
    if (row.lastAttemptAt !== null || !isRetryableRequestStatus(row.status)) continue;
    const candidate = candidates.find((entry) => entry.dedupeKey === row.dedupeKey);
    if (!candidate) continue;

    if (!capability.webhookConfigured) {
      await prisma.emergencyDispatchRequest.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
          failureReason:
            "No automated dispatch transport is configured. This responder was not contacted — call them directly using the number shown.",
        },
      });
      failed += 1;
      continue;
    }

    const attempt = row.attemptCount + 1;
    const outcome = await deliverDispatchRequest(buildPayload(incident, row.id, candidate, attempt));

    if (outcome.status === "DELIVERED") {
      await prisma.emergencyDispatchRequest.update({
        where: { id: row.id },
        data: {
          status: "DELIVERED",
          channel: "WEBHOOK",
          attemptCount: { increment: 1 },
          lastAttemptAt: outcome.attemptedAt,
          failureReason: null,
          metadata: { transportReference: outcome.transportReference, eligibility: candidate.eligibility },
        },
      });
      delivered += 1;
    } else {
      await prisma.emergencyDispatchRequest.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          attemptCount: { increment: 1 },
          lastAttemptAt: outcome.attemptedAt,
          failureReason: outcome.reason,
        },
      });
      failed += 1;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      if (row.lastAttemptAt !== null) continue;
      await appendIncidentEvent(tx, {
        incidentId: incident.id,
        eventType: "DISPATCH_REQUESTED",
        actorLabel: options.actorLabel ?? "system",
        notes: capability.webhookConfigured
          ? `Request sent to ${row.responderLabel}. A delivery receipt is not an acknowledgement.`
          : `Request to ${row.responderLabel} was not sent: no automated dispatch transport is configured.`,
        metadata: { dedupeKey: row.dedupeKey, channel: row.channel, distanceMetres: row.distanceMetres },
      });
    }

    const anyAttempted = rows.some((row) => row.lastAttemptAt !== null);
    if (!anyAttempted && !capability.automatedDispatchAvailable) {
      await transitionIncidentStatus(tx, {
        incidentId: incident.id,
        currentStatus: incident.status,
        to: "UNANSWERED",
        eventType: "STATUS_CHANGED",
        actorLabel: options.actorLabel ?? "system",
        notes: "No request could be transmitted. Call a responder directly using the numbers on this page.",
      });
    }
  });

  const notice = capability.webhookConfigured
    ? `Requests were sent to ${rows.length} responder${rows.length === 1 ? "" : "s"}. Nobody has accepted yet — a delivery receipt is not an acknowledgement.`
    : "No automated dispatch transport is configured, so nothing was sent. Call a responder directly using the numbers listed.";

  return {
    requested: rows.length,
    delivered,
    failed,
    transportUnavailable: !capability.automatedDispatchAvailable,
    noEligibleResponders: false,
    candidates: candidates.length,
    notice,
  };
}

// ---------------------------------------------------------------------------
// Provider decisions
// ---------------------------------------------------------------------------

export type ResponderDecisionResult = {
  applied: boolean;
  /** Set when the decision was recognised but had already been applied. */
  duplicate: boolean;
  incidentStatus: string;
  message: string;
};

const DECISION_EVENT_LABELS = {
  ACKNOWLEDGE: "acknowledgement",
  ACCEPT: "acceptance",
  DECLINE: "decline",
} as const;

/** Used in error copy when a provider posts a decision we cannot apply. */
export function decisionLabel(decision: keyof typeof DECISION_EVENT_LABELS) {
  return DECISION_EVENT_LABELS[decision];
}

/**
 * Applies a responder decision to a single request and, when it advances the
 * incident, to the incident as a whole.
 *
 * This is the only path in the codebase that can move an incident past
 * SEEKING_RESPONDERS, and it is reachable only through an endpoint that requires
 * the responder shared secret.
 */
export async function recordResponderDecision(input: {
  requestId: string;
  decision: ResponderDecisionInput["decision"];
  reason?: string;
  etaMinutes?: number;
  distanceMetres?: number;
  responderReference?: string;
  context?: RequestContext;
}): Promise<ResponderDecisionResult> {
  const request = await prisma.emergencyDispatchRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new Error("Unknown dispatch request.");

  const incident = await loadIncidentById(request.incidentId);
  if (!incident) throw new Error("Unknown incident.");

  const now = new Date();
  const actorLabel = input.responderReference
    ? `${request.responderLabel} (${input.responderReference})`
    : request.responderLabel;

  if (input.decision === "DECLINE") {
    if (request.status === "DECLINED") {
      return { applied: false, duplicate: true, incidentStatus: incident.status, message: "Already declined." };
    }
    await prisma.$transaction(async (tx) => {
      await tx.emergencyDispatchRequest.update({
        where: { id: request.id },
        data: {
          status: "DECLINED",
          respondedAt: now,
          declineReason: input.reason ?? null,
          attemptCount: { increment: 1 },
          lastAttemptAt: now,
        },
      });
      await appendIncidentEvent(tx, {
        incidentId: incident.id,
        eventType: "RESPONDER_DECLINED",
        actorLabel,
        notes: input.reason ?? "The responder declined this incident.",
        metadata: { dedupeKey: request.dedupeKey },
      });

      // Only once every request has a negative outcome does the incident become
      // unanswered. One decline among several is not a failure of the incident.
      const outstanding = await tx.emergencyDispatchRequest.count({
        where: {
          incidentId: incident.id,
          id: { not: request.id },
          status: { in: ["PENDING", "DELIVERED", "ACKNOWLEDGED", "ACCEPTED"] },
        },
      });
      if (outstanding === 0) {
        await transitionIncidentStatus(tx, {
          incidentId: incident.id,
          currentStatus: incident.status,
          to: "UNANSWERED",
          eventType: "STATUS_CHANGED",
          actorLabel: "system",
          notes: "Every responder we reached has declined or not replied. Nobody is on the way.",
        });
      }
    });

    await recordAuditEvent({
      action: "emergency.responder_declined",
      entityType: "emergency_dispatch_request",
      entityId: request.id,
      actorLabel,
      context: input.context,
      metadata: { reference: incident.reference, dedupeKey: request.dedupeKey, hasReason: Boolean(input.reason) },
    });
    const reloaded = await loadIncidentById(incident.id);
    return {
      applied: true,
      duplicate: false,
      incidentStatus: reloaded?.status ?? incident.status,
      message: "Decline recorded.",
    };
  }

  if (input.decision === "ACKNOWLEDGE") {
    if (request.acknowledgedAt) {
      return { applied: false, duplicate: true, incidentStatus: incident.status, message: "Already acknowledged." };
    }
    await prisma.$transaction(async (tx) => {
      await tx.emergencyDispatchRequest.update({
        where: { id: request.id },
        data: { status: "ACKNOWLEDGED", acknowledgedAt: now, lastAttemptAt: now, attemptCount: { increment: 1 } },
      });
      const advanced = await transitionIncidentStatus(tx, {
        incidentId: incident.id,
        currentStatus: incident.status,
        to: "ACKNOWLEDGED",
        eventType: "RESPONDER_ACKNOWLEDGED",
        actorLabel,
        notes: "A responder has seen the request but has not yet confirmed a vehicle.",
        data: { acknowledgedAt: now },
      });
      if (!advanced) {
        await appendIncidentEvent(tx, {
          incidentId: incident.id,
          eventType: "RESPONDER_ACKNOWLEDGED",
          actorLabel,
          notes: "A responder acknowledged the request. The incident had already advanced further.",
          metadata: { dedupeKey: request.dedupeKey },
        });
      }
    });

    await recordAuditEvent({
      action: "emergency.responder_acknowledged",
      entityType: "emergency_dispatch_request",
      entityId: request.id,
      actorLabel,
      context: input.context,
      metadata: { reference: incident.reference, dedupeKey: request.dedupeKey },
    });
    const reloaded = await loadIncidentById(incident.id);
    return {
      applied: true,
      duplicate: false,
      incidentStatus: reloaded?.status ?? incident.status,
      message: "Acknowledgement recorded.",
    };
  }

  if (input.decision === "ACCEPT") {
    if (request.status === "ACCEPTED") {
      return { applied: false, duplicate: true, incidentStatus: incident.status, message: "Already accepted." };
    }
    await prisma.$transaction(async (tx) => {
      await tx.emergencyDispatchRequest.update({
        where: { id: request.id },
        data: {
          status: "ACCEPTED",
          respondedAt: now,
          acknowledgedAt: request.acknowledgedAt ?? now,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
          etaMinutes: input.etaMinutes ?? null,
          distanceMetres: input.distanceMetres ?? request.distanceMetres,
        },
      });

      // A confirmed acceptance extends the life of the incident well beyond the
      // seeking window, because a real response is now in progress.
      const extended = new Date(now.getTime() + RESPONDED_WINDOW_HOURS * 60 * 60 * 1000);
      const advanced = await transitionIncidentStatus(tx, {
        incidentId: incident.id,
        currentStatus: incident.status,
        to: "RESPONDER_ACCEPTED",
        eventType: "RESPONDER_ACCEPTED",
        actorLabel,
        notes: input.etaMinutes
          ? `Responder accepted and reported an estimated ${input.etaMinutes} minutes.`
          : "Responder accepted this incident.",
        data: { expiresAt: extended, acknowledgedAt: incident.acknowledgedAt ?? now },
      });
      if (!advanced) {
        await appendIncidentEvent(tx, {
          incidentId: incident.id,
          eventType: "RESPONDER_ACCEPTED",
          actorLabel,
          notes: "A responder accepted this incident. The incident had already advanced further.",
          metadata: { dedupeKey: request.dedupeKey },
        });
      }
    });

    await recordAuditEvent({
      action: "emergency.responder_accepted",
      entityType: "emergency_dispatch_request",
      entityId: request.id,
      actorLabel,
      context: input.context,
      metadata: {
        reference: incident.reference,
        dedupeKey: request.dedupeKey,
        etaMinutes: input.etaMinutes ?? null,
      },
    });
    const reloaded = await loadIncidentById(incident.id);
    return {
      applied: true,
      duplicate: false,
      incidentStatus: reloaded?.status ?? incident.status,
      message: "Acceptance recorded.",
    };
  }

  // Progress reports. These may only come from a request this responder accepted,
  // so one provider cannot advance another provider's request — or the incident.
  if (request.status !== "ACCEPTED" && request.status !== "ACKNOWLEDGED") {
    throw new Error("A progress update is only accepted for a request this responder has accepted.");
  }

  // Narrowed explicitly: the object-literal lookup widens to `string` otherwise.
  const PROGRESS_TARGETS = {
    EN_ROUTE: "EN_ROUTE",
    ON_SCENE: "ON_SCENE",
    TRANSPORTING: "TRANSPORTING",
    RESOLVE: "RESOLVED",
  } as const satisfies Record<string, EmergencyIncident["status"]>;

  if (
    input.decision !== "EN_ROUTE" &&
    input.decision !== "ON_SCENE" &&
    input.decision !== "TRANSPORTING" &&
    input.decision !== "RESOLVE"
  ) {
    throw new Error("That decision is not a progress update.");
  }
  const target = PROGRESS_TARGETS[input.decision];

  const data: Prisma.EmergencyIncidentUpdateInput = {};
  if (target === "RESOLVED") data.resolvedAt = now;

  await prisma.$transaction(async (tx) => {
    const advanced = await transitionIncidentStatus(tx, {
      incidentId: incident.id,
      currentStatus: incident.status,
      to: target,
      eventType: target === "RESOLVED" ? "RESOLVED" : "STATUS_CHANGED",
      actorLabel,
      notes: input.reason ?? null,
      data,
    });
    if (advanced && target === "RESOLVED") {
      await tx.emergencyLocationShare.updateMany({
        where: { incidentId: incident.id, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: now },
      });
    }
    if (!advanced) {
      throw new Error("That status update is out of order for this incident.");
    }
  });

  await recordAuditEvent({
    action: target === "RESOLVED" ? "emergency.incident_resolved" : "emergency.status_changed",
    entityType: "emergency_incident",
    entityId: incident.id,
    actorLabel,
    context: input.context,
    metadata: { reference: incident.reference, status: target, responder: request.responderLabel },
  });

  return { applied: true, duplicate: false, incidentStatus: target, message: `Status updated to ${target}.` };
}

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

export type RetryOutcome = {
  attempted: number;
  delivered: number;
  failed: number;
  notice: string;
};

/**
 * Re-sends the requests that have not yet been acknowledged, with a hard attempt
 * ceiling so a responder is never bombarded. The fan-out is still keyed on
 * `dedupeKey`, so retrying cannot create a second request for the same responder.
 */
export async function retryIncidentRequests(
  incident: IncidentRecord,
  options: { actor: IncidentActor; context?: RequestContext },
): Promise<RetryOutcome> {
  const capability = getDispatchCapability(emergencyConfig.dispatchMode);
  if (!capability.automatedDispatchAvailable) {
    await recordAuditEvent({
      action: "emergency.dispatch_failed",
      entityType: "emergency_incident",
      entityId: incident.id,
      actorUserId: options.actor.id,
      outcome: "FAILURE",
      context: options.context,
      metadata: { reason: "transport_unavailable", reference: incident.reference },
    });
    return {
      attempted: 0,
      delivered: 0,
      failed: 0,
      notice: "No automated dispatch transport is configured, so a retry cannot send anything. Call a responder directly.",
    };
  }

  const candidates = await resolveDispatchCandidates(incident);
  const rows = await prisma.emergencyDispatchRequest.findMany({
    where: { incidentId: incident.id },
    orderBy: { createdAt: "asc" },
  });

  let attempted = 0;
  let delivered = 0;
  let failed = 0;

  for (const row of rows) {
    if (!isRetryableRequestStatus(row.status)) continue;
    if (row.attemptCount >= MAX_DISPATCH_ATTEMPTS) continue;
    const candidate = candidates.find((entry) => entry.dedupeKey === row.dedupeKey);
    if (!candidate) continue;

    attempted += 1;
    const attempt = row.attemptCount + 1;
    const outcome = await deliverDispatchRequest(buildPayload(incident, row.id, candidate, attempt));

    if (outcome.status === "DELIVERED") {
      await prisma.emergencyDispatchRequest.update({
        where: { id: row.id },
        data: {
          status: "DELIVERED",
          attemptCount: { increment: 1 },
          lastAttemptAt: outcome.attemptedAt,
          failureReason: null,
        },
      });
      delivered += 1;
    } else {
      await prisma.emergencyDispatchRequest.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          attemptCount: { increment: 1 },
          lastAttemptAt: outcome.attemptedAt,
          failureReason: outcome.reason,
        },
      });
      failed += 1;
    }
  }

  await prisma.$transaction(async (tx) => {
    await appendIncidentEvent(tx, {
      incidentId: incident.id,
      eventType: "RETRY_SCHEDULED",
      actorUserId: options.actor.id,
      actorLabel: options.actor.fullName,
      notes: `Retry attempted for ${attempted} responder${attempted === 1 ? "" : "s"}.`,
      metadata: { delivered, failed, attemptsCeiling: MAX_DISPATCH_ATTEMPTS },
    });
  });

  await prisma.emergencyIncident.update({
    where: { id: incident.id },
    data: { retryCount: { increment: 1 }, lastRetryAt: new Date() },
  });

  await recordAuditEvent({
    action: "emergency.dispatch_retried",
    entityType: "emergency_incident",
    entityId: incident.id,
    actorUserId: options.actor.id,
    context: options.context,
    metadata: { reference: incident.reference, attempted, delivered, failed },
  });

  return {
    attempted,
    delivered,
    failed,
    notice:
      delivered > 0
        ? `Retry sent to ${delivered} responder${delivered === 1 ? "" : "s"}. Still no acceptance until one confirms.`
        : "The retry could not be delivered. Call a responder directly using the numbers listed.",
  };
}

/** True when the responder endpoint may run at all. */
export function isResponderApiConfigured() {
  return Boolean(getEmergencyResponderSecret());
}
