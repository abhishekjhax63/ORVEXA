import "server-only";

import { createLinkToken, hmacDigest, safeCompare } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db/prisma";
import { LOCATION_SHARE_DEFAULT_MINUTES, appendIncidentEvent, type IncidentActor, type IncidentRecord } from "@/lib/emergency/incidents";
import { notifyEmergencyContact, redactShareLink } from "@/lib/emergency/delivery";
import { INCIDENT_STATUS_LABELS, isResponderConfirmed } from "@/lib/emergency/status";
import { recordAuditEvent } from "@/lib/security/audit";
import { getPublicBaseUrl } from "@/lib/env";
import type { RequestContext } from "@/lib/security/request";

/**
 * Time-limited location links for emergency contacts.
 *
 * Design constraints:
 *
 *  - The plaintext token exists only in the response that creates it. Only an
 *    HMAC digest is stored, so a database leak cannot be replayed to track the
 *    patient.
 *  - A link is issued only when the reporter turned on `contactShareConsent` for
 *    the incident *and* the specific contact has `canReceiveLocation`. Location
 *    is never shared silently, and never with a contact the patient did not
 *    nominate for it.
 *  - Revoking the share, cancelling the incident or resolving it kills every
 *    outstanding link immediately.
 */

const SHARE_TOKEN_PURPOSE = "emergency-location-share";

export type IssuedLocationShare = {
  shareId: string;
  contactLabel: string;
  /** Present only on the response that created it. */
  link: string | null;
  expiresAtISO: string;
  deliveryOutcome: "SENT" | "NOT_SENT" | "ALREADY_ISSUED";
  deliveryNotice: string;
};

export type IssueLocationSharesResult = {
  issued: IssuedLocationShare[];
  skippedContactIds: string[];
  notice: string;
};

export async function issueLocationShares(input: {
  actor: IncidentActor;
  incident: IncidentRecord;
  contactIds: string[];
  ttlMinutes?: number;
  context?: RequestContext;
}): Promise<IssueLocationSharesResult> {
  const { actor, incident } = input;
  const ttlMinutes = input.ttlMinutes ?? LOCATION_SHARE_DEFAULT_MINUTES;

  if (!incident.contactShareConsent) {
    throw new Error(
      "Location links were not consented to for this incident. Turn on contact sharing first, then issue the link.",
    );
  }
  if (incident.latitude === null && incident.longitude === null && !incident.addressText) {
    throw new Error("There is no location on this incident to share.");
  }

  const contacts = await prisma.emergencyContact.findMany({
    where: {
      ownerUserId: actor.id,
      canReceiveLocation: true,
      ...(input.contactIds.length > 0 ? { id: { in: input.contactIds } } : {}),
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  const requested = new Set(input.contactIds);
  const skippedContactIds = input.contactIds.filter((id) => !contacts.some((contact) => contact.id === id));

  if (contacts.length === 0) {
    return {
      issued: [],
      skippedContactIds,
      notice:
        "No contact on your account has location sharing turned on for emergencies. Turn it on for a contact, then try again.",
    };
  }

  const activeShares = await prisma.emergencyLocationShare.findMany({
    where: { incidentId: incident.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { id: true, contactId: true, expiresAt: true },
  });

  const issued: IssuedLocationShare[] = [];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const origin = getPublicBaseUrl();

  for (const contact of contacts) {
    const existing = activeShares.find((share) => share.contactId === contact.id);
    if (existing) {
      // The plaintext token cannot be recovered, so re-issuing would silently
      // invalidate the link already in the contact's hands. Report the live one.
      issued.push({
        shareId: existing.id,
        contactLabel: contact.fullName,
        link: null,
        expiresAtISO: existing.expiresAt.toISOString(),
        deliveryOutcome: "ALREADY_ISSUED",
        deliveryNotice: "A link is already active for this contact and cannot be re-displayed. It expires on its own.",
      });
      continue;
    }

    const token = createLinkToken();
    const tokenHash = hmacDigest(token, SHARE_TOKEN_PURPOSE);
    const share = await prisma.emergencyLocationShare.create({
      data: {
        incidentId: incident.id,
        contactId: contact.id,
        contactLabel: contact.fullName,
        tokenHash,
        status: "ACTIVE",
        expiresAt,
      },
    });

    const link = `${origin}/emergency/share/${token}`;
    const delivery = await notifyEmergencyContact({
      contactLabel: contact.fullName,
      locationLink: link,
      incidentReference: incident.reference,
    });

    await prisma.$transaction(async (tx) => {
      await appendIncidentEvent(tx, {
        incidentId: incident.id,
        eventType: "LOCATION_SHARED",
        actorUserId: actor.id,
        actorLabel: actor.fullName,
        notes: `Location link issued to ${contact.fullName}, valid until ${expiresAt.toISOString()}.`,
        metadata: {
          contactId: contact.id,
          channel: delivery.status === "DELIVERED" ? "provider" : "manual",
          deliveryStatus: delivery.status,
          expiresAt: expiresAt.toISOString(),
        },
      });
      await appendIncidentEvent(tx, {
        incidentId: incident.id,
        eventType: "CONTACT_NOTIFIED",
        actorUserId: actor.id,
        actorLabel: actor.fullName,
        notes:
          delivery.status === "DELIVERED"
            ? `Notification delivered to ${contact.fullName}.`
            : `${contact.fullName} was not notified automatically. ${delivery.reason}`,
        metadata: { contactId: contact.id, deliveryStatus: delivery.status },
      });
    });

    await recordAuditEvent({
      action: "emergency.location_shared",
      entityType: "emergency_location_share",
      entityId: share.id,
      actorUserId: actor.id,
      actorLabel: actor.fullName,
      context: input.context,
      metadata: {
        reference: incident.reference,
        contactId: contact.id,
        expiresAt: expiresAt.toISOString(),
        deliveryStatus: delivery.status,
        // Never the token itself, not even in the audit trail.
        link: redactShareLink(link),
      },
    });

    issued.push({
      shareId: share.id,
      contactLabel: contact.fullName,
      link,
      expiresAtISO: expiresAt.toISOString(),
      deliveryOutcome: delivery.status === "DELIVERED" ? "SENT" : "NOT_SENT",
      deliveryNotice:
        delivery.status === "DELIVERED"
          ? "Notification sent by the configured provider."
          : `No message was sent. Share this link yourself: ${link}`,
    });
  }

  return {
    issued,
    skippedContactIds,
    notice:
      issued.length === 1
        ? "One location link issued."
        : `${issued.length} location links processed.${requested.size > contacts.length ? " Some contacts were skipped because location sharing is off for them." : ""}`,
  };
}

export type ResolvedLocationShare = {
  reference: string;
  status: string;
  statusLabel: string;
  incidentType: string;
  incidentCreatedAtISO: string;
  /** Only present while the reporter's consent and the link both stand. */
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracyMetres: number | null;
    addressText: string | null;
    locality: string | null;
    city: string | null;
  } | null;
  /** True only when a provider integration confirmed a real response. */
  responderConfirmed: boolean;
  responderLabel: string | null;
  expiresAtISO: string;
};

export type LocationShareLookup =
  | {
      ok: true;
      share: ResolvedLocationShare;
      /**
       * Internal row id, kept beside the public view rather than inside it so the
       * page can record a view without leaking a database identifier into the
       * rendered output.
       */
      shareId: string;
    }
  | { ok: false; reason: "not_found" | "expired" | "revoked" };

/**
 * Resolves a plaintext token to the limited public view.
 *
 * A miss and an expired link deliberately return different reasons so the page
 * can explain what happened, but the page never reveals whether the token ever
 * existed for somebody else's incident.
 */
export async function resolveLocationShare(token: string): Promise<LocationShareLookup> {
  const tokenHash = hmacDigest(token, SHARE_TOKEN_PURPOSE);
  const share = await prisma.emergencyLocationShare.findUnique({
    where: { tokenHash },
    include: {
      incident: {
        select: {
          reference: true,
          status: true,
          incidentType: true,
          createdAt: true,
          latitude: true,
          longitude: true,
          accuracyMetres: true,
          addressText: true,
          locality: true,
          city: true,
          locationConsentAt: true,
          contactShareConsent: true,
          requests: {
            where: { status: { in: ["ACCEPTED", "ACKNOWLEDGED"] } },
            select: { responderLabel: true, status: true },
            take: 1,
            orderBy: { respondedAt: "desc" },
          },
        },
      },
    },
  });

  if (!share) return { ok: false, reason: "not_found" };
  // Constant-time confirmation that the digest belongs to this token.
  if (!safeCompare(share.tokenHash, tokenHash)) return { ok: false, reason: "not_found" };

  if (share.status === "REVOKED") return { ok: false, reason: "revoked" };
  if (share.status === "EXPIRED" || share.expiresAt <= new Date()) {
    if (share.status === "ACTIVE") {
      await prisma.emergencyLocationShare.update({
        where: { id: share.id },
        data: { status: "EXPIRED" },
      });
    }
    return { ok: false, reason: "expired" };
  }

  const incident = share.incident;
  const responder = incident.requests[0] ?? null;

  return {
    ok: true,
    shareId: share.id,
    share: {
      reference: incident.reference,
      status: incident.status,
      statusLabel: INCIDENT_STATUS_LABELS[incident.status],
      incidentType: incident.incidentType,
      incidentCreatedAtISO: incident.createdAt.toISOString(),
      location:
        incident.contactShareConsent && incident.locationConsentAt
          ? {
              latitude: incident.latitude,
              longitude: incident.longitude,
              accuracyMetres: incident.accuracyMetres,
              addressText: incident.addressText,
              locality: incident.locality,
              city: incident.city,
            }
          : null,
      responderConfirmed: isResponderConfirmed(incident.status),
      responderLabel: responder?.responderLabel ?? null,
      expiresAtISO: share.expiresAt.toISOString(),
    },
  };
}

/** Records that a link was opened, without storing who opened it. */
export async function recordShareView(shareId: string) {
  const now = new Date();
  const share = await prisma.emergencyLocationShare.update({
    where: { id: shareId },
    data: { viewCount: { increment: 1 }, viewedAt: { set: now } },
    select: { id: true, incidentId: true, contactLabel: true, viewCount: true },
  });
  await recordAuditEvent({
    action: "emergency.location_share_viewed",
    entityType: "emergency_location_share",
    entityId: share.id,
    actorLabel: share.contactLabel,
    metadata: { incidentId: share.incidentId, viewCount: share.viewCount },
  });
  return share;
}

/** Revokes every live link for an incident. */
export async function revokeLocationShares(incidentId: string, reason: string) {
  const now = new Date();
  const result = await prisma.emergencyLocationShare.updateMany({
    where: { incidentId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: now },
  });
  if (result.count > 0) {
    await recordAuditEvent({
      action: "emergency.location_shared",
      entityType: "emergency_incident",
      entityId: incidentId,
      outcome: "SUCCESS",
      metadata: { revoked: result.count, reason },
    });
  }
  return result.count;
}
