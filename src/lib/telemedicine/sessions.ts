import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { TeleconsultationEventType, TeleconsultationStatus } from "@prisma/client";

import { createLinkToken, hmacDigest } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db/prisma";
import { sendNotification } from "@/lib/notifications/provider";
import { recordAuditEvent } from "@/lib/security/audit";
import { getPublicBaseUrl } from "@/lib/env";
import { getVideoProvider, videoAvailability, type VideoAvailability } from "@/lib/video/service";
import type { VideoProviderId, VideoRoom } from "@/lib/video/provider";
import { SANDBOX_SESSION_NOTICE, TELEMEDICINE_DISCIPLINE_NOTICE } from "@/lib/telemedicine/labels";

/**
 * The video session behind a virtual appointment.
 *
 * ## The single rule this file is built around
 *
 * **A session is never reported as ready, active or connected unless the
 * configured video provider's own response says so.** If the provider refuses,
 * errors, times out or is not configured, the session is recorded as `FAILED`
 * with the provider's own reason and *no room is handed to anyone*. There is no
 * fallback path that produces a plausible-looking room.
 *
 * The one deliberate exception is the sandbox provider, and it is not really an
 * exception: a sandbox room is stamped `isSandbox`, `providerConfirmed: false`
 * and `roomUrl: null`, the deployment shows the sandbox notice on every
 * surface, and the provider refuses to run in a production build at all. A
 * rehearsal can therefore never be mistaken for a consultation.
 *
 * ## Links are platform links, not provider links
 *
 * A participant receives a short-lived *platform* link carrying an opaque token.
 * The database stores only that token's HMAC. Opening the link proves possession
 * of the token and resolves into a freshly minted provider meeting token, which
 * is never stored. Revoking is therefore trivial: rotate the hash, and every
 * link issued before that moment is dead.
 *
 * ## Status only ever moves forward from a signed callback
 *
 * `ACTIVE` is written in exactly one place — a webhook whose signature the
 * provider's own implementation verified. A participant telling us they joined
 * records a joined event and a timestamp; it does not claim the call connected.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** How long before the appointment the waiting room opens. */
export const JOIN_WINDOW_OPENS_BEFORE_MS = 15 * 60 * 1000;

/** How long after the appointment the room stays open. */
export const ROOM_GRACE_AFTER_MS = 30 * 60 * 1000;

/** Shortest window a room is opened for, whatever the appointment timing says. */
export const MIN_ROOM_WINDOW_MS = 20 * 60 * 1000;

const PATIENT_TOKEN_PURPOSE = "telemedicine.patient.join";
const CLINICIAN_TOKEN_PURPOSE = "telemedicine.clinician.join";

export type SessionViewer = "PATIENT" | "CLINICIAN";

export type SessionErrorCode =
  | "not_found"
  | "not_confirmed"
  | "appointment_closed"
  | "no_session"
  | "session_ended"
  | "room_expired"
  | "provider_unavailable"
  | "provider_failed"
  | "link_invalid"
  | "link_expired"
  | "not_a_participant"
  | "invalid_state"
  | "conflict";

export type SessionActor = {
  userId?: string | null;
  role?: "PATIENT" | "DOCTOR" | "PLATFORM_ADMIN" | null;
  label?: string | null;
};

export type SessionFailure = { ok: false; code: SessionErrorCode; message: string };

function viewerTokenPurpose(viewer: SessionViewer): string {
  return viewer === "PATIENT" ? PATIENT_TOKEN_PURPOSE : CLINICIAN_TOKEN_PURPOSE;
}

/** A random value whose hash matches nothing a participant holds. */
function unreachableTokenHash(purpose: string): string {
  return hmacDigest(createLinkToken(), purpose);
}

/** The opaque room name asked of the provider. Reveals nothing about the patient. */
function opaqueRoomName(): string {
  return `orvexa-consult-${randomBytes(9).toString("base64url")}`;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const SESSION_SELECT = {
  id: true,
  appointmentId: true,
  provider: true,
  providerRoomId: true,
  roomUrl: true,
  status: true,
  patientTokenExpiresAt: true,
  clinicianTokenExpiresAt: true,
  roomExpiresAt: true,
  patientJoinedAt: true,
  clinicianJoinedAt: true,
  startedAt: true,
  endedAt: true,
  lastProviderEventAt: true,
  reconnectionCount: true,
  failureReason: true,
  providerConfirmed: true,
  isSandbox: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TeleconsultationSessionSelect;

export type TeleconsultSessionRow = Prisma.TeleconsultationSessionGetPayload<{ select: typeof SESSION_SELECT }>;

export type SessionState = {
  session: TeleconsultSessionRow | null;
  /** True when a real call can be placed right now. */
  canOpenRoom: boolean;
  joinWindowOpensAt: Date | null;
  roomExpiresAt: Date | null;
  availability: VideoAvailability;
  notice: string;
};

function availabilityNotice(availability: VideoAvailability, isSandbox: boolean): string {
  if (isSandbox) return SANDBOX_SESSION_NOTICE;
  if (!availability.available) return availability.notice;
  return TELEMEDICINE_DISCIPLINE_NOTICE;
}

export function joinWindowOpensAt(scheduledStart: Date): Date {
  return new Date(scheduledStart.getTime() - JOIN_WINDOW_OPENS_BEFORE_MS);
}

function roomWindowFor(scheduledStart: Date, scheduledEnd: Date, now = new Date()): Date {
  const afterAppointment = new Date(scheduledEnd.getTime() + ROOM_GRACE_AFTER_MS);
  const minimum = new Date(now.getTime() + MIN_ROOM_WINDOW_MS);
  return afterAppointment.getTime() > minimum.getTime() ? afterAppointment : minimum;
}

// ---------------------------------------------------------------------------
// The platform join link
// ---------------------------------------------------------------------------

/** Route a join link points at. The token is the credential, not an id. */
export function consultationJoinPath(token: string): string {
  return `/consult/${encodeURIComponent(token)}`;
}

export function consultationJoinUrl(token: string): string {
  return `${getPublicBaseUrl().replace(/\/+$/, "")}${consultationJoinPath(token)}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getSessionForAppointment(appointmentId: string): Promise<TeleconsultSessionRow | null> {
  return prisma.teleconsultationSession.findUnique({
    where: { appointmentId },
    select: SESSION_SELECT,
  });
}

/**
 * What the waiting room needs to know, without opening anything.
 *
 * Nothing here is mutated: the page can render every state — not yet confirmed,
 * waiting room not open, room open, expired — from one read.
 */
export async function getSessionState(input: {
  appointmentId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  appointmentStatus: string;
  now?: Date;
}): Promise<SessionState> {
  const now = input.now ?? new Date();
  const availability = videoAvailability();
  const session = await getSessionForAppointment(input.appointmentId);
  const opensAt = joinWindowOpensAt(input.scheduledStart);

  const closedStatuses = new Set(["ENDED", "CANCELLED", "EXPIRED", "FAILED"]);
  const sessionUsable = session !== null && !closedStatuses.has(session.status);
  const withinWindow = now.getTime() >= opensAt.getTime() && (session ? session.roomExpiresAt.getTime() > now.getTime() : true);
  const canOpenRoom =
    input.appointmentStatus === "CONFIRMED" && sessionUsable && withinWindow;

  return {
    session,
    canOpenRoom,
    joinWindowOpensAt: opensAt,
    roomExpiresAt: session?.roomExpiresAt ?? null,
    availability,
    notice: availabilityNotice(availability, session?.isSandbox === true),
  };
}

/**
 * Which participant, if any, this account is on an appointment.
 *
 * The session routes take an appointment id from the client, so this is the
 * check that keeps one participant from acting as the other — and keeps a
 * non-participant from opening, joining or ending somebody else's consultation.
 */
export async function resolveParticipantViewer(input: {
  appointmentId: string;
  userId: string;
}): Promise<SessionViewer | null> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: input.appointmentId },
    select: { patientUserId: true, doctorProfile: { select: { userId: true } } },
  });
  if (!appointment) return null;
  if (appointment.patientUserId === input.userId) return "PATIENT";
  if (appointment.doctorProfile.userId === input.userId) return "CLINICIAN";
  return null;
}

// ---------------------------------------------------------------------------
// Create / open
// ---------------------------------------------------------------------------

export type EnsureSessionResult =
  | { ok: true; session: TeleconsultSessionRow; created: boolean; room: VideoRoom | null }
  | SessionFailure;

type AppointmentForSession = {
  id: string;
  reference: string;
  status: string;
  mode: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  patientUserId: string;
  doctorProfileId: string;
  doctorUserId: string;
  doctorName: string;
  patientName: string;
};

async function loadAppointment(appointmentId: string): Promise<AppointmentForSession | null> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      reference: true,
      status: true,
      mode: true,
      scheduledStart: true,
      scheduledEnd: true,
      patientUserId: true,
      doctorProfileId: true,
      doctorProfile: { select: { userId: true, user: { select: { fullName: true } } } },
      patient: { select: { fullName: true } },
    },
  });
  if (!appointment) return null;
  return {
    id: appointment.id,
    reference: appointment.reference,
    status: appointment.status,
    mode: appointment.mode,
    scheduledStart: appointment.scheduledStart,
    scheduledEnd: appointment.scheduledEnd,
    patientUserId: appointment.patientUserId,
    doctorProfileId: appointment.doctorProfileId,
    doctorUserId: appointment.doctorProfile.userId,
    doctorName: appointment.doctorProfile.user.fullName,
    patientName: appointment.patient.fullName,
  };
}

async function recordSessionEvent(input: {
  sessionId: string;
  type: TeleconsultationEventType;
  fromStatus?: TeleconsultationStatus | null;
  toStatus?: TeleconsultationStatus | null;
  actor?: SessionActor;
  note?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.teleconsultationEvent.create({
    data: {
      sessionId: input.sessionId,
      type: input.type,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorUserId: input.actor?.userId ?? null,
      actorRole: input.actor?.role === "PATIENT" ? "PATIENT" : input.actor?.role === "DOCTOR" ? "DOCTOR" : null,
      actorLabel: input.actor?.label ?? null,
      note: input.note ?? null,
      metadata: input.metadata,
    },
  });
}

/**
 * Opens the consultation room for an appointment, or returns the one already
 * open. Idempotent: calling it twice does not create a second room.
 *
 * The appointment must be CONFIRMED. A room is not opened for an appointment the
 * clinician has not accepted, and never for one that was cancelled or completed.
 */
export async function ensureTeleconsultSession(input: {
  appointmentId: string;
  actor: SessionActor;
  now?: Date;
}): Promise<EnsureSessionResult> {
  const now = input.now ?? new Date();
  const appointment = await loadAppointment(input.appointmentId);
  if (!appointment) return { ok: false, code: "not_found", message: "That consultation was not found." };
  if (appointment.mode !== "TELEMEDICINE") {
    return { ok: false, code: "invalid_state", message: "That appointment is not a virtual consultation." };
  }
  if (appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
    return { ok: false, code: "appointment_closed", message: "This consultation was cancelled. No room can be opened." };
  }
  if (appointment.status === "COMPLETED") {
    return { ok: false, code: "appointment_closed", message: "This consultation is already completed." };
  }
  if (appointment.status !== "CONFIRMED") {
    return {
      ok: false,
      code: "not_confirmed",
      message: "The clinician has not confirmed this consultation yet, so no room can be opened.",
    };
  }

  const existing = await getSessionForAppointment(appointment.id);

  if (existing && existing.status !== "FAILED") {
    if (existing.status === "ENDED" || existing.status === "CANCELLED") {
      return { ok: false, code: "session_ended", message: "This consultation session has already been closed." };
    }
    if (existing.status === "EXPIRED" || existing.roomExpiresAt.getTime() <= now.getTime()) {
      if (existing.status !== "EXPIRED") {
        await expireSessionRow(existing.id, existing.status, "The room's window passed.");
      }
      return {
        ok: false,
        code: "room_expired",
        message: "This room's window has passed. Ask the clinician to reopen the consultation.",
      };
    }
    return { ok: true, session: existing, created: false, room: null };
  }

  // First attempt, or a retry after the provider failed. The room window is
  // recomputed from now so a retry after a provider outage still has time to run.
  const roomExpiresAt = roomWindowFor(appointment.scheduledStart, appointment.scheduledEnd, now);
  const provider = getVideoProvider();

  const session = existing
    ? await prisma.teleconsultationSession.update({
        where: { id: existing.id },
        data: {
          status: "SCHEDULED",
          roomExpiresAt,
          failureReason: null,
          patientTokenHash: unreachableTokenHash(PATIENT_TOKEN_PURPOSE),
          clinicianTokenHash: unreachableTokenHash(CLINICIAN_TOKEN_PURPOSE),
          patientTokenExpiresAt: roomExpiresAt,
          clinicianTokenExpiresAt: roomExpiresAt,
        },
        select: SESSION_SELECT,
      })
    : await prisma.teleconsultationSession.create({
        data: {
          appointmentId: appointment.id,
          provider: provider.id,
          status: "SCHEDULED",
          roomExpiresAt,
          patientTokenHash: unreachableTokenHash(PATIENT_TOKEN_PURPOSE),
          clinicianTokenHash: unreachableTokenHash(CLINICIAN_TOKEN_PURPOSE),
          patientTokenExpiresAt: roomExpiresAt,
          clinicianTokenExpiresAt: roomExpiresAt,
        },
        select: SESSION_SELECT,
      });

  const roomResult = await provider.createRoom({
    sessionId: session.id,
    roomName: opaqueRoomName(),
    expiresAt: roomExpiresAt,
    label: `ORVEXA consultation ${appointment.reference}`,
    maxParticipants: 2,
  });

  const availability = videoAvailability();

  if (!roomResult.ok) {
    const isNotConfigured = roomResult.error.kind === "not_configured";
    const message = isNotConfigured && !availability.available ? availability.notice : roomResult.error.message;

    await prisma.teleconsultationSession.update({
      where: { id: session.id },
      data: {
        status: "FAILED",
        failureReason: message,
        providerConfirmed: false,
        isSandbox: availability.isSandbox,
      },
      select: SESSION_SELECT,
    });

    await recordSessionEvent({
      sessionId: session.id,
      type: "ROOM_FAILED",
      fromStatus: session.status,
      toStatus: "FAILED",
      actor: input.actor,
      note: message,
      metadata: { providerErrorKind: roomResult.error.kind, providerStatus: roomResult.error.status ?? null },
    });

    await recordAuditEvent({
      action: "telemedicine.session_failed",
      entityType: "teleconsultation_session",
      entityId: session.id,
      outcome: "FAILURE",
      actorUserId: input.actor.userId ?? null,
      actorLabel: input.actor.label ?? null,
      metadata: { reference: appointment.reference, provider: provider.id, kind: roomResult.error.kind },
    });

    return { ok: false, code: "provider_failed", message };
  }

  const room = roomResult.data;
  // A real room moves to READY only because the provider confirmed it. A
  // sandbox room may also advance, so the workflow is exercisable, but it is
  // stamped as a rehearsal and carries no room URL.
  const ready = room.confirmed || room.isSandbox;

  const updated = await prisma.teleconsultationSession.update({
    where: { id: session.id },
    data: {
      provider: room.provider,
      providerRoomId: room.providerRoomId,
      roomUrl: room.roomUrl,
      status: ready ? "READY" : "FAILED",
      providerConfirmed: room.confirmed,
      isSandbox: room.isSandbox,
      roomExpiresAt: room.expiresAt,
      failureReason: ready ? null : "The provider did not confirm the room, so no join link can be issued.",
      patientTokenExpiresAt: room.expiresAt,
      clinicianTokenExpiresAt: room.expiresAt,
    },
    select: SESSION_SELECT,
  });

  await recordSessionEvent({
    sessionId: session.id,
    type: ready ? "ROOM_CONFIRMED" : "ROOM_FAILED",
    fromStatus: session.status,
    toStatus: updated.status,
    actor: input.actor,
    note: ready
      ? room.isSandbox
        ? "A sandbox room was recorded. No video provider is configured, so no call can be placed."
        : "The video provider confirmed the room."
      : "The provider did not confirm the room.",
    metadata: {
      provider: room.provider,
      providerConfirmed: room.confirmed,
      isSandbox: room.isSandbox,
      roomExpiresAt: room.expiresAt.toISOString(),
    },
  });

  if (existing) {
    await recordAuditEvent({
      action: "telemedicine.session_created",
      entityType: "teleconsultation_session",
      entityId: session.id,
      actorUserId: input.actor.userId ?? null,
      actorLabel: input.actor.label ?? null,
      metadata: { reference: appointment.reference, provider: room.provider, retry: true },
    });
  }

  await recordAuditEvent({
    action: ready ? "telemedicine.session_ready" : "telemedicine.session_failed",
    entityType: "teleconsultation_session",
    entityId: session.id,
    outcome: ready ? "SUCCESS" : "FAILURE",
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: {
      reference: appointment.reference,
      provider: room.provider,
      providerConfirmed: room.confirmed,
      isSandbox: room.isSandbox,
    },
  });

  return { ok: true, session: updated, created: !existing, room };
}

// ---------------------------------------------------------------------------
// Join links
// ---------------------------------------------------------------------------

export type IssueJoinLinkResult =
  | {
      ok: true;
      appointmentId: string;
      reference: string;
      viewer: SessionViewer;
      linkUrl: string;
      expiresAt: Date;
      sessionStatus: TeleconsultationStatus;
      isSandbox: boolean;
      providerConfirmed: boolean;
      notice: string;
    }
  | SessionFailure;

/**
 * Issues a fresh join link to one participant, invalidating that participant's
 * previous link. Called for the patient and the clinician separately, so a link
 * forwarded by one of them is useless in the other's hands.
 */
export async function issueJoinLink(input: {
  appointmentId: string;
  viewer: SessionViewer;
  actor: SessionActor;
  /** True when the participant is rejoining after a drop. */
  reconnect?: boolean;
  now?: Date;
}): Promise<IssueJoinLinkResult> {
  const now = input.now ?? new Date();
  const appointment = await loadAppointment(input.appointmentId);
  if (!appointment) return { ok: false, code: "not_found", message: "That consultation was not found." };

  const ensured = await ensureTeleconsultSession({ appointmentId: appointment.id, actor: input.actor, now });
  if (!ensured.ok) {
    // A retry of a failed room is the one case where a participant may learn
    // why: the message already says no call can be placed.
    return ensured;
  }

  const session = ensured.session;
  if (session.status !== "READY" && session.status !== "ACTIVE") {
    return {
      ok: false,
      code: "invalid_state",
      message: session.failureReason ?? "The consultation room is not open, so no join link can be issued.",
    };
  }
  if (session.roomExpiresAt.getTime() <= now.getTime()) {
    await expireSessionRow(session.id, session.status, "The room's window passed before a link was issued.");
    return { ok: false, code: "room_expired", message: "This room's window has passed." };
  }

  const purpose = viewerTokenPurpose(input.viewer);
  const token = createLinkToken();
  const tokenHash = hmacDigest(token, purpose);

  const updated = await prisma.teleconsultationSession.update({
    where: { id: session.id },
    data:
      input.viewer === "PATIENT"
        ? { patientTokenHash: tokenHash, patientTokenExpiresAt: session.roomExpiresAt }
        : { clinicianTokenHash: tokenHash, clinicianTokenExpiresAt: session.roomExpiresAt },
    select: SESSION_SELECT,
  });

  const refreshed = updated;

  await recordSessionEvent({
    sessionId: session.id,
    type: input.reconnect ? "RECONNECTED" : "JOIN_LINK_ISSUED",
    actor: input.actor,
    note: input.reconnect
      ? `${input.viewer === "PATIENT" ? "The patient" : "The clinician"} reconnected and was issued a new link.`
      : `A join link was issued to the ${input.viewer === "PATIENT" ? "patient" : "clinician"}.`,
    metadata: { viewer: input.viewer, reconnect: input.reconnect === true },
  });

  if (input.reconnect) {
    await prisma.teleconsultationSession.update({
      where: { id: session.id },
      data: { reconnectionCount: { increment: 1 } },
    });
    await recordAuditEvent({
      action: "telemedicine.session_reconnected",
      entityType: "teleconsultation_session",
      entityId: session.id,
      actorUserId: input.actor.userId ?? null,
      actorLabel: input.actor.label ?? null,
      metadata: { reference: appointment.reference, viewer: input.viewer },
    });
  }

  await recordAuditEvent({
    action: "telemedicine.session_join_link_issued",
    entityType: "teleconsultation_session",
    entityId: session.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { reference: appointment.reference, viewer: input.viewer },
  });

  const availability = videoAvailability();
  const notice = availabilityNotice(availability, refreshed.isSandbox);

  // The link itself is delivered in the response so the page can show it. A
  // notification is attempted as well, but it never claims delivery: on this
  // deployment the transport reports NOT_CONFIGURED and the page says so.
  if (input.viewer === "PATIENT" && !input.reconnect) {
    const recipient = await prisma.user.findUnique({
      where: { id: appointment.patientUserId },
      select: { email: true },
    });
    if (recipient) {
      await sendNotification({
        kind: "teleconsultation_join_link",
        channel: "EMAIL",
        to: recipient.email,
        subject: `Join link for consultation ${appointment.reference}`,
        body: `Your consultation room is open. This link stops working when the room's window closes: ${consultationJoinUrl(token)}`,
        reference: appointment.reference,
      }).catch(() => null);
    }
  }

  return {
    ok: true,
    appointmentId: appointment.id,
    reference: appointment.reference,
    viewer: input.viewer,
    linkUrl: consultationJoinUrl(token),
    expiresAt: refreshed.roomExpiresAt,
    sessionStatus: refreshed.status,
    isSandbox: refreshed.isSandbox,
    providerConfirmed: refreshed.providerConfirmed,
    notice,
  };
}

export type JoinGrant = {
  appointmentId: string;
  reference: string;
  viewer: SessionViewer;
  sessionStatus: TeleconsultationStatus;
  provider: VideoProviderId;
  providerConfirmed: boolean;
  isSandbox: boolean;
  /** The provider's room URL. `null` for a sandbox session: there is no room. */
  roomUrl: string | null;
  /** A provider meeting token, minted now and never stored. */
  token: string;
  tokenExpiresAt: Date;
  roomExpiresAt: Date;
  notice: string;
};

type JoinSessionLookup = {
  sessionId: string;
  appointmentId: string;
  reference: string;
  viewer: SessionViewer;
  status: TeleconsultationStatus;
  isSandbox: boolean;
  providerConfirmed: boolean;
  providerRoomId: string | null;
  roomUrl: string | null;
  provider: VideoProviderId;
  roomExpiresAt: Date;
};

/**
 * The one place a platform join token is turned into an identified participant.
 *
 * Both the join itself and the "I opened the room" acknowledgement go through
 * this, so the expiry rules, the participant check and the refusal copy cannot
 * diverge between the two. Nothing here calls the video provider.
 */
async function findJoinSession(input: {
  token: string;
  userId: string;
  now: Date;
}): Promise<{ ok: true; lookup: JoinSessionLookup } | SessionFailure> {
  if (!input.token || input.token.length < 20 || input.token.length > 400) {
    return { ok: false, code: "link_invalid", message: "That join link is not valid." };
  }

  const patientHash = hmacDigest(input.token, PATIENT_TOKEN_PURPOSE);
  const clinicianHash = hmacDigest(input.token, CLINICIAN_TOKEN_PURPOSE);

  const session = await prisma.teleconsultationSession.findFirst({
    where: { OR: [{ patientTokenHash: patientHash }, { clinicianTokenHash: clinicianHash }] },
    select: {
      ...SESSION_SELECT,
      // The hashes are selected only to decide which participant this token was
      // issued to. They are never returned to a caller.
      patientTokenHash: true,
      clinicianTokenHash: true,
      appointment: {
        select: {
          id: true,
          reference: true,
          status: true,
          patientUserId: true,
          doctorProfile: { select: { userId: true } },
        },
      },
    },
  });
  if (!session) return { ok: false, code: "link_invalid", message: "That join link is not valid." };

  const viewer: SessionViewer = session.patientTokenHash === patientHash ? "PATIENT" : "CLINICIAN";
  const expiresAt = viewer === "PATIENT" ? session.patientTokenExpiresAt : session.clinicianTokenExpiresAt;

  const expectedUserId =
    viewer === "PATIENT" ? session.appointment.patientUserId : session.appointment.doctorProfile.userId;
  if (expectedUserId !== input.userId) {
    await recordAuditEvent({
      action: "access.denied",
      entityType: "teleconsultation_session",
      entityId: session.id,
      outcome: "DENIED",
      actorUserId: input.userId,
      metadata: { reason: "join_link_owner_mismatch", viewer },
    });
    return { ok: false, code: "not_a_participant", message: "That join link was issued to a different participant." };
  }

  if (expiresAt.getTime() <= input.now.getTime() || session.roomExpiresAt.getTime() <= input.now.getTime()) {
    return {
      ok: false,
      code: "link_expired",
      message: "That join link has expired. Ask for a new one from the waiting room.",
    };
  }
  if (session.status !== "READY" && session.status !== "ACTIVE") {
    return {
      ok: false,
      code: "invalid_state",
      message: session.failureReason ?? "The consultation room is not open.",
    };
  }

  return {
    ok: true,
    lookup: {
      sessionId: session.id,
      appointmentId: session.appointmentId,
      reference: session.appointment.reference,
      viewer,
      status: session.status,
      isSandbox: session.isSandbox,
      providerConfirmed: session.providerConfirmed,
      providerRoomId: session.providerRoomId,
      roomUrl: session.roomUrl,
      provider: session.provider,
      roomExpiresAt: session.roomExpiresAt,
    },
  };
}

/**
 * Exchanges a platform join token for a real provider meeting token.
 *
 * The platform token is verified against the HMAC stored for that participant
 * and role, so a patient's link cannot open the clinician's view and a link
 * issued to one appointment cannot open another. The signed-in account must also
 * be the party the token was issued to.
 */
export async function resolveJoinLink(input: {
  token: string;
  userId: string;
  now?: Date;
}): Promise<{ ok: true; grant: JoinGrant } | SessionFailure> {
  const found = await findJoinSession({ token: input.token, userId: input.userId, now: input.now ?? new Date() });
  if (!found.ok) return found;
  const { lookup } = found;

  if (!lookup.providerRoomId) {
    return {
      ok: false,
      code: "invalid_state",
      message: "No consultation room exists for this appointment, so there is nothing to join.",
    };
  }

  const provider = getVideoProvider();
  const tokenResult = await provider.createToken({
    providerRoomId: lookup.providerRoomId,
    userName: lookup.viewer === "PATIENT" ? "Patient" : "Clinician",
    isOwner: lookup.viewer === "CLINICIAN",
    expiresAt: lookup.roomExpiresAt,
  });

  if (!tokenResult.ok) {
    await recordAuditEvent({
      action: "telemedicine.session_join_link_issued",
      entityType: "teleconsultation_session",
      entityId: lookup.sessionId,
      outcome: "FAILURE",
      actorUserId: input.userId,
      metadata: { reference: lookup.reference, viewer: lookup.viewer, kind: tokenResult.error.kind },
    });
    return { ok: false, code: "provider_failed", message: tokenResult.error.message };
  }

  const availability = videoAvailability();

  return {
    ok: true,
    grant: {
      appointmentId: lookup.appointmentId,
      reference: lookup.reference,
      viewer: lookup.viewer,
      sessionStatus: lookup.status,
      provider: lookup.provider,
      providerConfirmed: lookup.providerConfirmed,
      isSandbox: lookup.isSandbox,
      roomUrl: lookup.isSandbox ? null : lookup.roomUrl,
      token: tokenResult.data.token,
      tokenExpiresAt: tokenResult.data.expiresAt,
      roomExpiresAt: lookup.roomExpiresAt,
      notice: availabilityNotice(availability, lookup.isSandbox),
    },
  };
}

/**
 * Records that the holder of a join link opened the room or the waiting room.
 *
 * The participant is taken from the verified token, never from the request, so a
 * patient cannot have the record say the clinician joined. As with
 * `acknowledgeSessionJoin`, this does not move the session to ACTIVE.
 */
export async function recordJoinFromToken(input: {
  token: string;
  userId: string;
  kind: "joined" | "waiting_room";
  now?: Date;
}): Promise<{ ok: true; appointmentId: string; viewer: SessionViewer } | SessionFailure> {
  const found = await findJoinSession({ token: input.token, userId: input.userId, now: input.now ?? new Date() });
  if (!found.ok) return found;
  const { lookup } = found;

  const actor: SessionActor = { userId: input.userId, role: lookup.viewer === "PATIENT" ? "PATIENT" : "DOCTOR" };

  if (input.kind === "waiting_room") {
    await recordSessionEvent({
      sessionId: lookup.sessionId,
      type: "WAITING_ROOM_ENTERED",
      actor,
      metadata: { viewer: lookup.viewer, via: "join_link" },
    });
    return { ok: true, appointmentId: lookup.appointmentId, viewer: lookup.viewer };
  }

  await recordSessionEvent({
    sessionId: lookup.sessionId,
    type: lookup.viewer === "PATIENT" ? "PATIENT_JOINED" : "CLINICIAN_JOINED",
    actor,
    note: `${lookup.viewer === "PATIENT" ? "The patient" : "The clinician"} opened the consultation room.`,
    metadata: { viewer: lookup.viewer, via: "join_link" },
  });

  await recordAuditEvent({
    action: "telemedicine.session_joined",
    entityType: "teleconsultation_session",
    entityId: lookup.sessionId,
    actorUserId: input.userId,
    metadata: { viewer: lookup.viewer, reference: lookup.reference },
  });

  return { ok: true, appointmentId: lookup.appointmentId, viewer: lookup.viewer };
}

/**
 * Records that a participant opened the room.
 *
 * Deliberately does **not** move the session to ACTIVE: only a signed provider
 * callback may do that. What it records is that this participant was present.
 */
export async function acknowledgeSessionJoin(input: {
  appointmentId: string;
  viewer: SessionViewer;
  actor: SessionActor;
}): Promise<{ ok: true; session: TeleconsultSessionRow } | SessionFailure> {
  const session = await prisma.teleconsultationSession.findUnique({
    where: { appointmentId: input.appointmentId },
    select: SESSION_SELECT,
  });
  if (!session) return { ok: false, code: "no_session", message: "No consultation session exists for this appointment." };
  if (session.status !== "READY" && session.status !== "ACTIVE") {
    return { ok: false, code: "invalid_state", message: "The consultation room is not open." };
  }

  const now = new Date();
  const updated = await prisma.teleconsultationSession.update({
    where: { id: session.id },
    data: {
      ...(input.viewer === "PATIENT"
        ? { patientJoinedAt: session.patientJoinedAt ?? now }
        : { clinicianJoinedAt: session.clinicianJoinedAt ?? now }),
      startedAt: session.startedAt ?? now,
    },
    select: SESSION_SELECT,
  });

  await recordSessionEvent({
    sessionId: session.id,
    type: input.viewer === "PATIENT" ? "PATIENT_JOINED" : "CLINICIAN_JOINED",
    actor: input.actor,
    note: `${input.viewer === "PATIENT" ? "The patient" : "The clinician"} opened the consultation room.`,
  });

  await recordAuditEvent({
    action: "telemedicine.session_joined",
    entityType: "teleconsultation_session",
    entityId: session.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { viewer: input.viewer },
  });

  return { ok: true, session: updated };
}

/** Records a participant entering the waiting room. */
export async function acknowledgeWaitingRoom(input: {
  appointmentId: string;
  viewer: SessionViewer;
  actor: SessionActor;
}): Promise<{ ok: true } | SessionFailure> {
  const session = await prisma.teleconsultationSession.findUnique({
    where: { appointmentId: input.appointmentId },
    select: { id: true, status: true },
  });
  if (!session) return { ok: false, code: "no_session", message: "No consultation session exists for this appointment." };

  await recordSessionEvent({
    sessionId: session.id,
    type: "WAITING_ROOM_ENTERED",
    actor: input.actor,
    metadata: { viewer: input.viewer },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

async function expireSessionRow(
  sessionId: string,
  fromStatus: TeleconsultationStatus,
  note: string,
): Promise<void> {
  await prisma.teleconsultationSession.update({
    where: { id: sessionId },
    data: {
      status: "EXPIRED",
      patientTokenHash: unreachableTokenHash(PATIENT_TOKEN_PURPOSE),
      clinicianTokenHash: unreachableTokenHash(CLINICIAN_TOKEN_PURPOSE),
      patientTokenExpiresAt: new Date(),
      clinicianTokenExpiresAt: new Date(),
    },
  });
  await recordSessionEvent({ sessionId, type: "EXPIRED", fromStatus, toStatus: "EXPIRED", note });
  await recordAuditEvent({
    action: "telemedicine.session_expired",
    entityType: "teleconsultation_session",
    entityId: sessionId,
    metadata: { from: fromStatus },
  });
}

/** Closes a session early, revoking both join links and asking the provider to close the room. */
export async function endTeleconsultSession(input: {
  appointmentId: string;
  actor: SessionActor;
  reason?: string | null;
}): Promise<{ ok: true; session: TeleconsultSessionRow; roomClosed: boolean } | SessionFailure> {
  const session = await prisma.teleconsultationSession.findUnique({
    where: { appointmentId: input.appointmentId },
    select: SESSION_SELECT,
  });
  if (!session) return { ok: false, code: "no_session", message: "No consultation session exists for this appointment." };
  if (session.status === "ENDED") return { ok: true, session, roomClosed: false };
  if (session.status === "CANCELLED" || session.status === "EXPIRED") {
    return { ok: false, code: "session_ended", message: "This session is already closed." };
  }

  const provider = getVideoProvider();
  let roomClosed = false;

  if (session.providerRoomId && provider.deleteRoom) {
    const deletion = await provider.deleteRoom(session.providerRoomId).catch(() => null);
    roomClosed = deletion?.ok === true && deletion.data.deleted;
  }

  const now = new Date();
  const updated = await prisma.teleconsultationSession.update({
    where: { id: session.id },
    data: {
      status: "ENDED",
      endedAt: now,
      patientTokenHash: unreachableTokenHash(PATIENT_TOKEN_PURPOSE),
      clinicianTokenHash: unreachableTokenHash(CLINICIAN_TOKEN_PURPOSE),
      patientTokenExpiresAt: now,
      clinicianTokenExpiresAt: now,
    },
    select: SESSION_SELECT,
  });

  await recordSessionEvent({
    sessionId: session.id,
    type: "ENDED",
    fromStatus: session.status,
    toStatus: "ENDED",
    actor: input.actor,
    note: input.reason ?? null,
    metadata: { roomClosed },
  });

  await recordAuditEvent({
    action: "telemedicine.session_ended",
    entityType: "teleconsultation_session",
    entityId: session.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { roomClosed },
  });

  return { ok: true, session: updated, roomClosed };
}

/**
 * Closes a session because its appointment was cancelled.
 *
 * Idempotent, and safe to call for an appointment that never had a session.
 * Both join links are rotated to unreachable values, so a cancelled
 * consultation cannot be joined with a link that was already in somebody's
 * inbox.
 */
export async function cancelTeleconsultSessionForAppointment(input: {
  appointmentId: string;
  actor: SessionActor;
  reason: string;
}): Promise<{ ok: true; cancelled: boolean } | SessionFailure> {
  const session = await prisma.teleconsultationSession.findUnique({
    where: { appointmentId: input.appointmentId },
    select: { id: true, status: true, providerRoomId: true },
  });
  if (!session) return { ok: false, code: "no_session", message: "No consultation session exists for this appointment." };
  if (session.status === "CANCELLED" || session.status === "ENDED" || session.status === "EXPIRED") {
    return { ok: true, cancelled: false };
  }

  const provider = getVideoProvider();
  if (session.providerRoomId && provider.deleteRoom) {
    await provider.deleteRoom(session.providerRoomId).catch(() => null);
  }

  const now = new Date();
  await prisma.teleconsultationSession.update({
    where: { id: session.id },
    data: {
      status: "CANCELLED",
      endedAt: now,
      patientTokenHash: unreachableTokenHash(PATIENT_TOKEN_PURPOSE),
      clinicianTokenHash: unreachableTokenHash(CLINICIAN_TOKEN_PURPOSE),
      patientTokenExpiresAt: now,
      clinicianTokenExpiresAt: now,
      failureReason: input.reason,
    },
  });

  await recordSessionEvent({
    sessionId: session.id,
    type: "CANCELLED",
    fromStatus: session.status,
    toStatus: "CANCELLED",
    actor: input.actor,
    note: input.reason,
  });

  await recordAuditEvent({
    action: "telemedicine.session_cancelled",
    entityType: "teleconsultation_session",
    entityId: session.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
  });

  return { ok: true, cancelled: true };
}

/**
 * Maintenance sweep: expires every room whose window has closed.
 *
 * Safe to run repeatedly; a session that is already closed is not touched.
 */
export async function expireTeleconsultSessions(now = new Date()): Promise<number> {
  const stale = await prisma.teleconsultationSession.findMany({
    where: {
      status: { in: ["SCHEDULED", "READY", "ACTIVE"] },
      roomExpiresAt: { lte: now },
    },
    select: { id: true, status: true },
    take: 200,
  });

  for (const session of stale) {
    await expireSessionRow(session.id, session.status, "The room's window passed.");
  }
  return stale.length;
}

// ---------------------------------------------------------------------------
// Provider callbacks
// ---------------------------------------------------------------------------

export type WebhookResult = {
  stored: boolean;
  duplicate: boolean;
  signatureValid: boolean;
  sessionId: string | null;
  applied: string | null;
  reason: string;
};

function safeProviderEventId(payload: Record<string, unknown>, rawBody: string): string {
  const id = payload.id ?? payload.event_id;
  if (typeof id === "string" && id.trim() !== "") return id.trim().slice(0, 200);
  const type = typeof payload.type === "string" ? payload.type : "unknown";
  const stamp = payload.event_ts ?? payload.ts ?? payload.timestamp;
  const suffix = typeof stamp === "string" || typeof stamp === "number" ? String(stamp) : "";
  if (suffix) return `${type}:${suffix}`.slice(0, 200);
  return `sha256:${createHash("sha256").update(rawBody).digest("hex")}`.slice(0, 200);
}

function readRoomName(payload: Record<string, unknown>): string | null {
  const room = payload.room_name ?? payload.room;
  if (typeof room === "string" && room.trim() !== "") return room.trim();
  if (room && typeof room === "object") {
    const nested = (room as Record<string, unknown>).name ?? (room as Record<string, unknown>).id;
    if (typeof nested === "string" && nested.trim() !== "") return nested.trim();
  }
  const nested = payload.payload;
  if (nested && typeof nested === "object") {
    return readRoomName(nested as Record<string, unknown>);
  }
  return null;
}

function readEventType(payload: Record<string, unknown>): string {
  const type = payload.type;
  if (typeof type === "string" && type.trim() !== "") return type.trim().slice(0, 120);
  const nested = payload.payload;
  if (nested && typeof nested === "object") {
    const inner = (nested as Record<string, unknown>).type;
    if (typeof inner === "string" && inner.trim() !== "") return inner.trim().slice(0, 120);
  }
  return "unknown";
}

/**
 * Ingests a video-provider callback.
 *
 * The signature is verified against the exact bytes received, through the
 * provider's own implementation. A callback that cannot be attributed to the
 * provider is still stored — so a misconfiguration is visible rather than
 * silent — but it is stored with `signatureValid: false` and it is never allowed
 * to move a session. Duplicate deliveries are recognised by the provider's own
 * event id and are not applied twice.
 */
export async function ingestVideoWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
}): Promise<WebhookResult> {
  const provider = getVideoProvider();
  const verdict = provider.verifyWebhookSignature({
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
  });

  let parsed: Record<string, unknown> = {};
  try {
    const candidate: unknown = JSON.parse(input.rawBody);
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      parsed = candidate as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  const providerEventId = safeProviderEventId(parsed, input.rawBody);
  const type = readEventType(parsed);
  const roomName = readRoomName(parsed);

  const session = roomName
    ? await prisma.teleconsultationSession.findFirst({
        where: { providerRoomId: roomName },
        select: { id: true, status: true, appointmentId: true },
      })
    : null;

  // Only non-identifying fields are retained. A provider payload can name
  // participants, and an audit store is not the place for that.
  const summary: Prisma.InputJsonValue = {
    type,
    eventTs: (parsed.event_ts ?? parsed.ts ?? null) as Prisma.InputJsonValue,
    roomName,
  };

  try {
    await prisma.videoProviderEvent.create({
      data: {
        provider: provider.id,
        providerEventId,
        sessionId: session?.id ?? null,
        type,
        signatureValid: verdict.verified,
        payload: summary,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        stored: false,
        duplicate: true,
        signatureValid: verdict.verified,
        sessionId: session?.id ?? null,
        applied: null,
        reason: "This callback had already been received.",
      };
    }
    throw error;
  }

  if (!verdict.verified) {
    await recordAuditEvent({
      action: "telemedicine.provider_webhook_rejected",
      entityType: "video_provider_event",
      entityId: providerEventId,
      outcome: "DENIED",
      metadata: { type, sessionId: session?.id ?? null, reason: verdict.reason },
    });
    return {
      stored: true,
      duplicate: false,
      signatureValid: false,
      sessionId: session?.id ?? null,
      applied: null,
      reason: verdict.reason,
    };
  }

  await recordAuditEvent({
    action: "telemedicine.provider_webhook_received",
    entityType: "video_provider_event",
    entityId: providerEventId,
    metadata: { type, sessionId: session?.id ?? null },
  });

  const applied = await applyProviderEvent({ type, sessionId: session?.id ?? null, fromStatus: session?.status ?? null });

  return {
    stored: true,
    duplicate: false,
    signatureValid: true,
    sessionId: session?.id ?? null,
    applied,
    reason: verdict.reason,
  };
}

/**
 * Applies one verified callback to its session.
 *
 * Only two provider events change a session's status — the provider saying the
 * meeting started and the provider saying it ended. Anything else is recorded as
 * a session event so the timeline shows it, without inventing a state.
 */
async function applyProviderEvent(input: {
  type: string;
  sessionId: string | null;
  fromStatus: TeleconsultationStatus | null;
}): Promise<string | null> {
  if (!input.sessionId) return null;

  const type = input.type.toLowerCase();
  const now = new Date();

  if (type === "meeting.started" || type === "meeting-start" || type === "room.started") {
    await prisma.teleconsultationSession.update({
      where: { id: input.sessionId },
      data: { status: "ACTIVE", startedAt: now, lastProviderEventAt: now },
    });
    await recordSessionEvent({
      sessionId: input.sessionId,
      type: "NOTE",
      fromStatus: input.fromStatus,
      toStatus: "ACTIVE",
      note: "The video provider reported that the meeting started.",
      metadata: { providerEvent: input.type },
    });
    return "ACTIVE";
  }

  if (type === "meeting.ended" || type === "meeting-end" || type === "room.ended") {
    await prisma.teleconsultationSession.update({
      where: { id: input.sessionId },
      data: {
        status: "ENDED",
        endedAt: now,
        lastProviderEventAt: now,
        patientTokenHash: unreachableTokenHash(PATIENT_TOKEN_PURPOSE),
        clinicianTokenHash: unreachableTokenHash(CLINICIAN_TOKEN_PURPOSE),
        patientTokenExpiresAt: now,
        clinicianTokenExpiresAt: now,
      },
    });
    await recordSessionEvent({
      sessionId: input.sessionId,
      type: "ENDED",
      fromStatus: input.fromStatus,
      toStatus: "ENDED",
      note: "The video provider reported that the meeting ended.",
      metadata: { providerEvent: input.type },
    });
    return "ENDED";
  }

  await prisma.teleconsultationSession.update({
    where: { id: input.sessionId },
    data: { lastProviderEventAt: now },
  });

  const sessionEventType: TeleconsultationEventType =
    type.includes("left") || type.includes("disconnect") ? "DISCONNECTED" : "NOTE";

  await recordSessionEvent({
    sessionId: input.sessionId,
    type: sessionEventType,
    note: `The video provider reported: ${input.type}.`,
    metadata: { providerEvent: input.type },
  });
  return null;
}
