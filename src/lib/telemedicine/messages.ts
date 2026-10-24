import "server-only";

import { Prisma } from "@prisma/client";
import type { ConsultationMessageKind } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  buildDocumentKey,
  createDocumentLink,
  isAcceptedDocumentMimeType,
  storeDocument,
} from "@/lib/documents/storage";
import { scanAiUpload } from "@/lib/ai/malware";
import { recordAuditEvent } from "@/lib/security/audit";
import type { ConsultationMessageInput } from "@/lib/validation/telemedicine";

/**
 * Clinician–patient chat inside a consultation.
 *
 * ## Only the two parties
 *
 * Every read and every write resolves the caller against the appointment's own
 * `patientUserId` and `doctorProfile.userId`. There is no participant list to
 * configure and no way to add a third reader: an account that is neither party
 * gets a refusal, and the refusal is the same whether or not the appointment
 * exists (`not_a_participant`).
 *
 * ## The window is derived, not declared
 *
 * Chat opens when the clinician confirms the appointment and closes a fixed
 * period after the appointment was scheduled to end — or immediately if the
 * appointment is cancelled. The client cannot post outside the window, and no
 * request field can extend it. A message sent inside the window stays readable
 * afterwards: closing the window stops new writing, it does not rewrite history.
 *
 * ## Attachments
 *
 * A file is scanned before it is stored, so an infected file is never written.
 * The stored key always begins with the namespace and the uploader's account id,
 * and a message may only reference a key under the sender's own prefix — which
 * is why one patient's attachment cannot be attached to another's consultation.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type ChatErrorCode =
  | "not_found"
  | "not_a_participant"
  | "chat_not_open"
  | "chat_closed"
  | "invalid_attachment"
  | "attachment_not_found"
  | "attachment_rejected"
  | "storage_not_configured"
  | "conflict";

export type ChatParty = "PATIENT" | "CLINICIAN";

export type ChatActor = {
  userId: string;
  role: "DOCTOR" | "PATIENT" | "PLATFORM_ADMIN";
  label: string;
};

class ChatFailure extends Error {
  readonly code: ChatErrorCode;

  constructor(code: ChatErrorCode, message: string) {
    super(message);
    this.name = "ChatFailure";
    this.code = code;
  }
}

/** How long after the appointment the chat stays open. */
export const CHAT_GRACE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

/** Every attachment key for a participant begins with this. */
function attachmentPrefixFor(userId: string): string {
  return `consultation-attachments/${userId}/`;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

type ChatWindow = {
  /** True when a message may be sent right now. */
  isOpen: boolean;
  closesAt: Date;
  /** Why it is closed, when it is. */
  closedReason: string | null;
};

/**
 * When the chat for an appointment is open.
 *
 * `PENDING` is not an error state to hide: the patient is told the chat opens
 * once the clinician confirms, which is the honest description of a chat with
 * someone who has not accepted the appointment yet.
 */
function chatWindow(input: {
  status: string;
  scheduledEnd: Date;
  now: Date;
}): ChatWindow {
  const closesAt = new Date(input.scheduledEnd.getTime() + CHAT_GRACE_AFTER_MS);

  if (input.status === "CANCELLED" || input.status === "NO_SHOW") {
    return {
      isOpen: false,
      closesAt,
      closedReason: "This consultation was cancelled, so its chat is closed.",
    };
  }
  if (input.status === "PENDING") {
    return {
      isOpen: false,
      closesAt,
      closedReason: "The clinician has not confirmed this consultation yet, so its chat has not opened.",
    };
  }
  if (input.now.getTime() > closesAt.getTime()) {
    return {
      isOpen: false,
      closesAt,
      closedReason:
        "This consultation's chat window has closed. Messages already sent stay readable, but nothing new can be written.",
    };
  }
  return { isOpen: true, closesAt, closedReason: null };
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

type ChatAppointment = {
  id: string;
  reference: string;
  status: string;
  mode: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  patientUserId: string;
  patientName: string;
  doctorUserId: string;
  doctorName: string;
  slotId: string | null;
};

async function loadChatAppointment(appointmentId: string): Promise<ChatAppointment | null> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      reference: true,
      status: true,
      mode: true,
      scheduledStart: true,
      scheduledEnd: true,
      slotId: true,
      patientUserId: true,
      patient: { select: { fullName: true } },
      doctorProfile: { select: { userId: true, user: { select: { fullName: true } } } },
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
    slotId: appointment.slotId,
    patientUserId: appointment.patientUserId,
    patientName: appointment.patient.fullName,
    doctorUserId: appointment.doctorProfile.userId,
    doctorName: appointment.doctorProfile.user.fullName,
  };
}

function partyFor(appointment: ChatAppointment, userId: string): ChatParty {
  if (appointment.patientUserId === userId) return "PATIENT";
  if (appointment.doctorUserId === userId) return "CLINICIAN";
  throw new ChatFailure(
    "not_a_participant",
    "Only the patient and the clinician on this consultation can open its chat.",
  );
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const MESSAGE_SELECT = {
  id: true,
  appointmentId: true,
  senderUserId: true,
  senderRole: true,
  senderLabel: true,
  kind: true,
  body: true,
  attachmentName: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.ConsultationMessageSelect;

export type ConsultationMessageRow = Prisma.ConsultationMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

export type ConsultationChatView = {
  appointmentId: string;
  reference: string;
  party: ChatParty;
  counterpartLabel: string;
  isOpen: boolean;
  closesAt: Date;
  closedReason: string | null;
  messages: ConsultationMessageRow[];
  /** Shown with every chat surface: an instruction in chat is not a prescription. */
  notice: string;
};

const CHAT_NOTICE =
  "Messages here are part of your consultation record and are visible only to you and the clinician named on the " +
  "appointment. An instruction written in chat is not a prescription, and a prescription issued by the clinician appears " +
  "separately on this consultation.";

export async function getConsultationChat(input: {
  appointmentId: string;
  userId: string;
  now?: Date;
}): Promise<{ ok: true; chat: ConsultationChatView } | { ok: false; code: ChatErrorCode; message: string }> {
  const now = input.now ?? new Date();
  const appointment = await loadChatAppointment(input.appointmentId);
  if (!appointment) return { ok: false, code: "not_found", message: "That consultation was not found." };

  let party: ChatParty;
  try {
    party = partyFor(appointment, input.userId);
  } catch (error) {
    if (error instanceof ChatFailure) return { ok: false, code: error.code, message: error.message };
    throw error;
  }

  const window = chatWindow({ status: appointment.status, scheduledEnd: appointment.scheduledEnd, now });

  const messages = await prisma.consultationMessage.findMany({
    where: { appointmentId: appointment.id },
    select: MESSAGE_SELECT,
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return {
    ok: true,
    chat: {
      appointmentId: appointment.id,
      reference: appointment.reference,
      party,
      counterpartLabel: party === "PATIENT" ? appointment.doctorName : appointment.patientName,
      isOpen: window.isOpen,
      closesAt: window.closesAt,
      closedReason: window.closedReason,
      messages,
      notice: CHAT_NOTICE,
    },
  };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export type SendMessageResult =
  | { ok: true; message: ConsultationMessageRow }
  | { ok: false; code: ChatErrorCode; message: string };

export async function sendConsultationMessage(input: {
  actor: ChatActor;
  data: ConsultationMessageInput;
  now?: Date;
}): Promise<SendMessageResult> {
  const now = input.now ?? new Date();
  const data = input.data;

  const appointment = await loadChatAppointment(data.appointmentId);
  if (!appointment) return { ok: false, code: "not_found", message: "That consultation was not found." };

  try {
    const party = partyFor(appointment, input.actor.userId);

    // A system notice is written by the platform, never by a participant, so the
    // only kinds that reach here are the postable ones.
    const kind: ConsultationMessageKind = data.kind === "ATTACHMENT" ? "ATTACHMENT" : "TEXT";

    if (kind === "ATTACHMENT") {
      const key = data.attachmentKey ?? "";
      if (!key.startsWith(attachmentPrefixFor(input.actor.userId))) {
        throw new ChatFailure(
          "invalid_attachment",
          "That attachment was not uploaded by you, so it cannot be sent from this account.",
        );
      }
    }

    const window = chatWindow({ status: appointment.status, scheduledEnd: appointment.scheduledEnd, now });
    if (!window.isOpen) {
      throw new ChatFailure(
        appointment.status === "PENDING" ? "chat_not_open" : "chat_closed",
        window.closedReason ?? "This consultation's chat is not open.",
      );
    }

    const message = await prisma.consultationMessage.create({
      data: {
        appointmentId: appointment.id,
        senderUserId: input.actor.userId,
        senderRole: party === "CLINICIAN" ? "DOCTOR" : "PATIENT",
        senderLabel: input.actor.label,
        kind,
        body: data.body,
        attachmentKey: kind === "ATTACHMENT" ? (data.attachmentKey ?? null) : null,
        attachmentName: kind === "ATTACHMENT" ? (data.attachmentName ?? null) : null,
      },
      select: MESSAGE_SELECT,
    });

    await recordAuditEvent({
      action: "consultation.message_sent",
      entityType: "consultation_message",
      entityId: message.id,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      metadata: { reference: appointment.reference, party, kind },
    });

    return { ok: true, message };
  } catch (error) {
    if (error instanceof ChatFailure) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/**
 * Marks the other party's messages as read.
 *
 * Only messages the caller did not send are touched, so a read receipt can never
 * be attributed to its own author.
 */
export async function markConsultationMessagesRead(input: {
  appointmentId: string;
  userId: string;
}): Promise<{ ok: true; markedCount: number } | { ok: false; code: ChatErrorCode; message: string }> {
  const appointment = await loadChatAppointment(input.appointmentId);
  if (!appointment) return { ok: false, code: "not_found", message: "That consultation was not found." };

  try {
    partyFor(appointment, input.userId);
  } catch (error) {
    if (error instanceof ChatFailure) return { ok: false, code: error.code, message: error.message };
    throw error;
  }

  const marked = await prisma.consultationMessage.updateMany({
    where: { appointmentId: appointment.id, senderUserId: { not: input.userId }, readAt: null },
    data: { readAt: new Date() },
  });

  return { ok: true, markedCount: marked.count };
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type UploadedAttachment = {
  key: string;
  fileName: string;
  malwareScan: string;
  malwareScanDetail: string;
};

export type UploadAttachmentResult =
  | { ok: true; attachment: UploadedAttachment }
  | { ok: false; code: ChatErrorCode; message: string };

/**
 * Stores one file against a consultation's chat.
 *
 * The bytes are scanned first and written second, so a file the scanner
 * rejected is never stored at all. The response reports the scan verdict
 * verbatim: on a deployment with no scanner configured the verdict is
 * `SKIPPED`, and that is what the caller is told.
 */
export async function uploadConsultationAttachment(input: {
  actor: ChatActor;
  appointmentId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  now?: Date;
}): Promise<UploadAttachmentResult> {
  const now = input.now ?? new Date();
  const appointment = await loadChatAppointment(input.appointmentId);
  if (!appointment) return { ok: false, code: "not_found", message: "That consultation was not found." };

  let party: ChatParty;
  try {
    party = partyFor(appointment, input.actor.userId);
  } catch (error) {
    if (error instanceof ChatFailure) return { ok: false, code: error.code, message: error.message };
    throw error;
  }

  const window = chatWindow({ status: appointment.status, scheduledEnd: appointment.scheduledEnd, now });
  if (!window.isOpen) {
    return {
      ok: false,
      code: appointment.status === "PENDING" ? "chat_not_open" : "chat_closed",
      message: window.closedReason ?? "This consultation's chat is not open.",
    };
  }

  if (!isAcceptedDocumentMimeType(input.mimeType)) {
    return { ok: false, code: "invalid_attachment", message: "Attach a PDF, JPEG, PNG or WebP file." };
  }

  const verdict = await scanAiUpload({
    bytes: input.bytes,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
  if (verdict.status === "INFECTED") {
    return { ok: false, code: "attachment_rejected", message: verdict.detail };
  }

  const key = buildDocumentKey({
    namespace: "consultation-attachments",
    ownerUserId: input.actor.userId,
    parentId: appointment.id,
    mimeType: input.mimeType,
  });

  const stored = await storeDocument({ key, bytes: input.bytes, contentType: input.mimeType });
  if (!stored.ok) {
    return {
      ok: false,
      code: stored.error.kind === "not_configured" ? "storage_not_configured" : "invalid_attachment",
      message: stored.error.message,
    };
  }

  await recordAuditEvent({
    action: "consultation.attachment_accessed",
    entityType: "consultation_message",
    entityId: appointment.id,
    actorUserId: input.actor.userId,
    actorLabel: input.actor.label,
    metadata: { reference: appointment.reference, party, action: "upload", malwareScan: verdict.status },
  });

  return {
    ok: true,
    attachment: {
      key: stored.data.key,
      fileName: input.fileName,
      malwareScan: verdict.status,
      malwareScanDetail: verdict.detail,
    },
  };
}

export type OpenedAttachment = { url: string; expiresAt: Date; fileName: string };

/**
 * Turns one chat attachment into a short-lived signed link.
 *
 * Authorization is the message itself: the caller must be a party to the
 * appointment the message belongs to, and the message must be the one that
 * carries this key. There is no path that accepts a bare storage key.
 */
export async function openConsultationAttachment(input: {
  appointmentId: string;
  messageId: string;
  userId: string;
}): Promise<{ ok: true; attachment: OpenedAttachment } | { ok: false; code: ChatErrorCode; message: string }> {
  const appointment = await loadChatAppointment(input.appointmentId);
  if (!appointment) return { ok: false, code: "not_found", message: "That consultation was not found." };

  try {
    partyFor(appointment, input.userId);
  } catch (error) {
    if (error instanceof ChatFailure) return { ok: false, code: error.code, message: error.message };
    throw error;
  }

  const message = await prisma.consultationMessage.findFirst({
    where: { id: input.messageId, appointmentId: appointment.id, kind: "ATTACHMENT" },
    select: { id: true, attachmentKey: true, attachmentName: true },
  });
  if (!message || !message.attachmentKey) {
    return { ok: false, code: "attachment_not_found", message: "That attachment was not found on this consultation." };
  }

  const link = await createDocumentLink(message.attachmentKey);
  if (!link.ok) {
    return {
      ok: false,
      code: link.error.kind === "not_configured" ? "storage_not_configured" : "attachment_not_found",
      message: link.error.message,
    };
  }

  await recordAuditEvent({
    action: "consultation.attachment_accessed",
    entityType: "consultation_message",
    entityId: message.id,
    actorUserId: input.userId,
    metadata: { reference: appointment.reference, action: "open" },
  });

  return {
    ok: true,
    attachment: {
      url: link.data.url,
      expiresAt: link.data.expiresAt,
      fileName: message.attachmentName ?? "attachment",
    },
  };
}
