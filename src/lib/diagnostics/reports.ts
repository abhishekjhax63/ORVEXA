import "server-only";

import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { LabReportAccessAction, LabReportDocumentKind, LabReportStatus, Role } from "@prisma/client";

import { scanAiUpload } from "@/lib/ai/malware";
import { hmacDigest, createLinkToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db/prisma";
import {
  buildDocumentKey,
  createDocumentLink,
  DOCUMENT_LINK_TTL_SECONDS,
  isAcceptedDocumentMimeType,
  isDocumentStorageConfigured,
  removeDocument,
  storeDocument,
} from "@/lib/documents/storage";
import {
  DIAGNOSTIC_CONSENT_POLICY_VERSION,
  LAB_RESULT_DISCIPLINE,
  REPORT_SHARING_CONSENT_POLICY_VERSION,
} from "@/lib/diagnostics/labels";
import { exchangeReport } from "@/lib/diagnostics/report-exchange";
import { getPublicBaseUrl } from "@/lib/env";
import { sendNotification } from "@/lib/notifications/provider";
import { recordAuditEvent } from "@/lib/security/audit";
import { getRequestContext } from "@/lib/security/request";
import type { LabReportResultInput } from "@/lib/validation/diagnostics";

/**
 * Laboratory reports: the write path a partner uses and the read path a patient
 * uses.
 *
 * ## What this module will not do
 *
 * There is no function here that invents a value, an analyte, a flag or an
 * authentication. Every result line arrives as text a human at the laboratory
 * typed, and a report cannot become `PUBLISHED` — the only status a patient can
 * read — without an authenticator's own name and registration number, recorded
 * with a server-stamped time. `LAB_RESULT_DISCIPLINE` is shown verbatim beside
 * every result table so nobody mistakes storage for interpretation.
 *
 * ## Two gates on publishing
 *
 *  1. The laboratory's `LabPartnerProfile.canPublishReports` is set by a
 *     platform reviewer, never by the partner. Until it is true the partner can
 *     prepare a draft and nothing else.
 *  2. Publishing requires `authenticatedByName` **and**
 *     `authenticatedByRegistration`, both non-empty.
 *
 * ## Access is logged, always
 *
 * Every read, link, download, share and withdrawal writes a
 * `LabReportAccessLog` row, so a patient can see who opened their file and when.
 * The log is written by this module and never by a caller, because a log a
 * caller can forget to write is not an access history.
 */

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomReferenceBody(): string {
  const bytes = randomBytes(6);
  let body = "";
  for (const byte of bytes) body += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return body;
}

/** A report reference, e.g. ORX-RP-4M9K2P. */
export function generateReportReference(): string {
  return `ORX-RP-${randomReferenceBody()}`;
}

// ---------------------------------------------------------------------------
// Result vocabulary
// ---------------------------------------------------------------------------

export type ReportErrorCode =
  | "not_found"
  | "not_your_lab"
  | "not_publishable"
  | "lab_not_approved_to_publish"
  | "authenticator_required"
  | "booking_not_ready"
  | "report_not_editable"
  | "report_not_shareable"
  | "document_rejected"
  | "storage_not_configured"
  | "share_not_found"
  | "share_expired"
  | "recipient_required"
  | "invalid_transition"
  | "conflict";

export type ReportActor = {
  userId?: string | null;
  role?: Role | null;
  label?: string | null;
};

// ---------------------------------------------------------------------------
// The status machine
// ---------------------------------------------------------------------------

/**
 * Which report status moves are legal.
 *
 * `AMENDED` is reachable only from `PUBLISHED`, and only through
 * `amendLabReport`: a laboratory corrects a released report by taking it back,
 * editing it and re-publishing, so a patient never sees a half-edited report.
 */
export const LAB_REPORT_TRANSITIONS: Record<LabReportStatus, readonly LabReportStatus[]> = {
  DRAFT: ["PUBLISHED", "WITHDRAWN"],
  PUBLISHED: ["AMENDED", "WITHDRAWN"],
  AMENDED: ["PUBLISHED", "WITHDRAWN"],
  WITHDRAWN: [],
};

export function canTransitionLabReport(from: LabReportStatus, to: LabReportStatus): boolean {
  return LAB_REPORT_TRANSITIONS[from].includes(to);
}

/** The statuses in which a partner may still edit analysis and result lines. */
const EDITABLE_REPORT_STATUSES: readonly LabReportStatus[] = ["DRAFT", "AMENDED"];

/** Only a published report has content a patient may read. */
export const PATIENT_READABLE_REPORT_STATUSES: readonly LabReportStatus[] = ["PUBLISHED"];

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const REPORT_SUMMARY_SELECT = {
  id: true,
  reference: true,
  status: true,
  bookingId: true,
  labProfileId: true,
  authenticatedByName: true,
  authenticatedByRegistration: true,
  authenticatedAt: true,
  publishedAt: true,
  reportedAt: true,
  sampleCollectedAt: true,
  interpretation: true,
  amendmentReason: true,
  withdrawnReason: true,
  withdrawnAt: true,
  dataProvenance: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  labProfile: {
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      verificationStatus: true,
      canPublishReports: true,
      accreditationNumber: true,
    },
  },
  booking: {
    select: {
      id: true,
      reference: true,
      patientUserId: true,
      familyMemberId: true,
      mode: true,
      status: true,
      scheduledAt: true,
    },
  },
  _count: { select: { documents: true, results: true, shares: true } },
} satisfies Prisma.LabReportSelect;

export type LabReportSummary = Prisma.LabReportGetPayload<{ select: typeof REPORT_SUMMARY_SELECT }>;

const REPORT_DOCUMENT_SELECT = {
  id: true,
  kind: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  malwareScan: true,
  malwareScanDetail: true,
  checksumSha256: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.LabReportDocumentSelect;

const REPORT_DETAIL_SELECT = {
  ...REPORT_SUMMARY_SELECT,
  documents: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: REPORT_DOCUMENT_SELECT,
  },
  results: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      testId: true,
      analyteName: true,
      value: true,
      unit: true,
      referenceRange: true,
      flag: true,
      method: true,
      comment: true,
      enteredByLabel: true,
      createdAt: true,
    },
  },
  shares: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      sharedWithEmail: true,
      sharedWithLabel: true,
      canDownload: true,
      expiresAt: true,
      revokedAt: true,
      viewedAt: true,
      viewCount: true,
      createdAt: true,
    },
  },
} satisfies Prisma.LabReportSelect;

export type LabReportDetail = Prisma.LabReportGetPayload<{ select: typeof REPORT_DETAIL_SELECT }>;

// ---------------------------------------------------------------------------
// Access log
// ---------------------------------------------------------------------------

/**
 * The one place an access row is written. `action` is required and the acting
 * identity is taken from the caller's own session, never from a request body.
 */
async function recordReportAccess(input: {
  reportId: string;
  action: LabReportAccessAction;
  actor?: ReportActor;
  ipAddress?: string | null;
  userAgent?: string | null;
  note?: string | null;
}): Promise<void> {
  try {
    await prisma.labReportAccessLog.create({
      data: {
        reportId: input.reportId,
        action: input.action,
        actorUserId: input.actor?.userId ?? null,
        actorRole: input.actor?.role ?? null,
        actorLabel: input.actor?.label ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        note: input.note ?? null,
      },
    });
  } catch (error) {
    console.error("[diagnostics] failed to write a report access row", input.action, error);
  }
}

export async function listReportAccessLog(reportId: string) {
  return prisma.labReportAccessLog.findMany({
    where: { reportId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      action: true,
      actorRole: true,
      actorLabel: true,
      note: true,
      createdAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/** A report the caller's laboratory owns, or null. Never a cross-tenant read. */
async function loadOwnedReport(input: { labProfileId: string; reportId: string }) {
  return prisma.labReport.findFirst({
    where: { id: input.reportId, labProfileId: input.labProfileId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      bookingId: true,
      labProfileId: true,
      interpretation: true,
    },
  });
}

async function loadPublishingLab(labProfileId: string) {
  return prisma.labPartnerProfile.findUnique({
    where: { id: labProfileId },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      verificationStatus: true,
      status: true,
      canPublishReports: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateReportResult =
  | { ok: true; report: LabReportSummary; created: boolean }
  | { ok: false; code: ReportErrorCode; message: string };

/**
 * Opens a draft report against a booking.
 *
 * A report can only be opened once the sample is actually in the laboratory's
 * hands — `SAMPLE_COLLECTED` or later — because a report for a sample that was
 * never taken would be a fabricated document.
 */
export async function createLabReport(input: {
  actor: ReportActor;
  labProfileId: string;
  bookingId: string;
  interpretation?: string | null;
}): Promise<CreateReportResult> {
  const booking = await prisma.diagnosticBooking.findFirst({
    where: { id: input.bookingId, labProfileId: input.labProfileId },
    select: { id: true, reference: true, status: true, patientUserId: true },
  });
  if (!booking) return { ok: false, code: "not_found", message: "That booking was not found for your laboratory." };

  if (!["SAMPLE_COLLECTED", "PROCESSING", "REPORT_READY"].includes(booking.status)) {
    return {
      ok: false,
      code: "booking_not_ready",
      message:
        "A report can only be opened once the sample has been recorded as collected. Record the collection first.",
    };
  }

  const existing = await prisma.labReport.findFirst({
    where: { bookingId: booking.id, status: { in: ["DRAFT", "AMENDED"] }, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    const report = await prisma.labReport.findUniqueOrThrow({
      where: { id: existing.id },
      select: REPORT_SUMMARY_SELECT,
    });
    return { ok: true, report, created: false };
  }

  const report = await prisma.labReport.create({
    data: {
      reference: generateReportReference(),
      bookingId: booking.id,
      labProfileId: input.labProfileId,
      status: "DRAFT",
      interpretation: input.interpretation ?? null,
      dataProvenance: "PROVIDER_SUBMITTED",
    },
    select: REPORT_SUMMARY_SELECT,
  });

  await recordReportAccess({ reportId: report.id, action: "UPLOADED", actor: input.actor });
  await recordAuditEvent({
    action: "diagnostics.report_created",
    entityType: "lab_report",
    entityId: report.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { reference: report.reference, bookingReference: booking.reference },
  });

  return { ok: true, report, created: true };
}

// ---------------------------------------------------------------------------
// Result lines
// ---------------------------------------------------------------------------

export type ReportResultsResult =
  | { ok: true; reportId: string; saved: number }
  | { ok: false; code: ReportErrorCode; message: string };

/**
 * Replaces the analyte lines on an editable report.
 *
 * The lines are the laboratory's own text. Nothing is parsed, converted,
 * unit-normalised or flagged by the platform: `flag` is whatever the laboratory
 * selected, and `LAB_RESULT_DISCIPLINE` is rendered next to the table.
 */
export async function saveLabReportResults(input: {
  actor: ReportActor;
  labProfileId: string;
  reportId: string;
  results: LabReportResultInput[];
}): Promise<ReportResultsResult> {
  const report = await loadOwnedReport({ labProfileId: input.labProfileId, reportId: input.reportId });
  if (!report) return { ok: false, code: "not_found", message: "That report was not found for your laboratory." };
  if (!EDITABLE_REPORT_STATUSES.includes(report.status)) {
    return {
      ok: false,
      code: "report_not_editable",
      message: "A published report cannot be edited directly. Take it back for amendment first.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.labReportResult.deleteMany({ where: { reportId: report.id } });
    await tx.labReportResult.createMany({
      data: input.results.map((line) => ({
        reportId: report.id,
        testId: line.testId ?? null,
        analyteName: line.analyteName,
        value: line.value ?? null,
        unit: line.unit ?? null,
        referenceRange: line.referenceRange ?? null,
        flag: line.flag,
        method: line.method ?? null,
        comment: line.comment ?? null,
        enteredById: input.actor.userId ?? null,
        enteredByLabel: input.actor.label ?? null,
      })),
    });
  });

  return { ok: true, reportId: report.id, saved: input.results.length };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type ReportDocumentResult =
  | {
      ok: true;
      documentId: string;
      fileName: string;
      malwareScan: string;
      malwareScanDetail: string;
    }
  | { ok: false; code: ReportErrorCode; message: string };

/**
 * Stores one file against a report.
 *
 * The bytes are written first and the row only after the upload succeeded, so a
 * failed upload never leaves a row pointing at nothing. An infected file is
 * removed from storage and recorded as rejected rather than kept.
 */
export async function uploadLabReportDocument(input: {
  actor: ReportActor;
  labProfileId: string;
  reportId: string;
  kind: LabReportDocumentKind;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ReportDocumentResult> {
  const report = await loadOwnedReport({ labProfileId: input.labProfileId, reportId: input.reportId });
  if (!report) return { ok: false, code: "not_found", message: "That report was not found for your laboratory." };
  if (!EDITABLE_REPORT_STATUSES.includes(report.status)) {
    return {
      ok: false,
      code: "report_not_editable",
      message: "A published report cannot take another file. Take it back for amendment first.",
    };
  }

  if (!isAcceptedDocumentMimeType(input.mimeType)) {
    return { ok: false, code: "document_rejected", message: "That file type is not accepted. Upload a PDF, JPEG, PNG or WebP file." };
  }
  if (!isDocumentStorageConfigured()) {
    return {
      ok: false,
      code: "storage_not_configured",
      message: "Private document storage is not configured on this deployment, so nothing was stored.",
    };
  }

  const booking = await prisma.diagnosticBooking.findUniqueOrThrow({
    where: { id: report.bookingId },
    select: { patientUserId: true },
  });

  const key = buildDocumentKey({
    namespace: "lab-reports",
    ownerUserId: booking.patientUserId,
    parentId: report.id,
    mimeType: input.mimeType,
  });

  const stored = await storeDocument({ key, bytes: input.bytes, contentType: input.mimeType });
  if (!stored.ok) {
    return { ok: false, code: "document_rejected", message: stored.error.message };
  }

  // A verdict is recorded either way. `SKIPPED` and `FAILED` are visible on the
  // row and in the UI; neither is presented as a clean scan.
  const verdict = await scanAiUpload({ bytes: input.bytes, fileName: input.fileName, mimeType: input.mimeType });

  if (verdict.status === "INFECTED") {
    await removeDocument(key);
    await recordAuditEvent({
      action: "diagnostics.report_document_uploaded",
      entityType: "lab_report_document",
      entityId: report.id,
      outcome: "FAILURE",
      actorUserId: input.actor.userId ?? null,
      actorLabel: input.actor.label ?? null,
      metadata: { reference: report.reference, rejected: "malware" },
    });
    return { ok: false, code: "document_rejected", message: verdict.detail };
  }

  const context = await getRequestContext();
  const created = await prisma.labReportDocument.create({
    data: {
      reportId: report.id,
      uploadedById: input.actor.userId ?? "",
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: stored.data.sizeBytes,
      storageBucket: "private",
      storageKey: stored.data.key,
      checksumSha256: stored.data.checksum,
      status: "READY",
      malwareScan: verdict.status,
      malwareScanDetail: verdict.detail,
    },
    select: { id: true },
  });

  await recordReportAccess({
    reportId: report.id,
    action: "UPLOADED",
    actor: input.actor,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
    note: input.fileName,
  });
  await recordAuditEvent({
    action: "diagnostics.report_document_uploaded",
    entityType: "lab_report_document",
    entityId: created.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { reportReference: report.reference, malwareScan: verdict.status },
  });

  return {
    ok: true,
    documentId: created.id,
    fileName: input.fileName,
    malwareScan: verdict.status,
    malwareScanDetail: verdict.detail,
  };
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export type PublishReportResult =
  | { ok: true; reportId: string; reference: string; status: LabReportStatus }
  | { ok: false; code: ReportErrorCode; message: string };

/**
 * The clinical act.
 *
 * Both an authenticator's name and registration are required. Publishing also
 * requires the laboratory to have been released by a platform reviewer
 * (`canPublishReports`), and it advances the booking to `REPORT_READY` in the
 * same transaction — so a booked sample can never sit in `PROCESSING` next to a
 * report a patient can already read.
 */
export async function publishLabReport(input: {
  actor: ReportActor;
  labProfileId: string;
  reportId: string;
  authenticatedByName: string;
  authenticatedByRegistration: string;
  reportedAt?: Date | null;
  sampleCollectedAt?: Date | null;
  interpretation?: string | null;
}): Promise<PublishReportResult> {
  const report = await loadOwnedReport({ labProfileId: input.labProfileId, reportId: input.reportId });
  if (!report) return { ok: false, code: "not_found", message: "That report was not found for your laboratory." };

  const name = input.authenticatedByName.trim();
  const registration = input.authenticatedByRegistration.trim();
  if (name.length < 3 || registration.length < 3) {
    return {
      ok: false,
      code: "authenticator_required",
      message:
        "A report is only released once the laboratory's own authenticator is named with their registration number.",
    };
  }

  const lab = await loadPublishingLab(input.labProfileId);
  if (!lab) return { ok: false, code: "not_found", message: "That laboratory profile was not found." };
  if (lab.verificationStatus !== "VERIFIED" || lab.status !== "APPROVED") {
    return {
      ok: false,
      code: "not_publishable",
      message: "This laboratory is not verified and approved, so no report can be released from it.",
    };
  }
  if (!lab.canPublishReports) {
    return {
      ok: false,
      code: "lab_not_approved_to_publish",
      message:
        "A platform reviewer has not yet released the report desk for this laboratory, so no report can be published to a patient.",
    };
  }
  if (!canTransitionLabReport(report.status, "PUBLISHED")) {
    return {
      ok: false,
      code: "invalid_transition",
      message: `A report that is ${report.status} cannot be published.`,
    };
  }

  const documentCount = await prisma.labReportDocument.count({
    where: { reportId: report.id, deletedAt: null, status: "READY" },
  });
  const resultCount = await prisma.labReportResult.count({ where: { reportId: report.id } });
  if (documentCount === 0 && resultCount === 0) {
    return {
      ok: false,
      code: "not_publishable",
      message: "This report has neither a signed document nor a result line, so there is nothing to release.",
    };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.labReport.update({
      where: { id: report.id },
      data: {
        status: "PUBLISHED",
        authenticatedByName: name,
        authenticatedByRegistration: registration,
        authenticatedById: input.actor.userId ?? null,
        authenticatedAt: now,
        publishedById: input.actor.userId ?? null,
        publishedByLabel: input.actor.label ?? null,
        publishedAt: now,
        reportedAt: input.reportedAt ?? now,
        ...(input.sampleCollectedAt ? { sampleCollectedAt: input.sampleCollectedAt } : {}),
        ...(input.interpretation !== undefined ? { interpretation: input.interpretation ?? null } : {}),
        amendmentReason: null,
      },
    });

    // The booking follows the report, not the other way round.
    const booking = await tx.diagnosticBooking.findUnique({
      where: { id: report.bookingId },
      select: { status: true },
    });
    if (booking && (booking.status === "SAMPLE_COLLECTED" || booking.status === "PROCESSING")) {
      await tx.diagnosticBooking.update({
        where: { id: report.bookingId },
        data: { status: "REPORT_READY" },
      });
      await tx.diagnosticBookingEvent.create({
        data: {
          bookingId: report.bookingId,
          type: "REPORT_PUBLISHED",
          fromStatus: booking.status,
          toStatus: "REPORT_READY",
          actorUserId: input.actor.userId ?? null,
          actorRole: input.actor.role ?? null,
          actorLabel: input.actor.label ?? null,
          note: `Report ${report.reference} released by ${name}.`,
        },
      });
    }
  });

  await recordReportAccess({ reportId: report.id, action: "PUBLISHED", actor: input.actor, note: name });
  await recordAuditEvent({
    action: "diagnostics.report_published",
    entityType: "lab_report",
    entityId: report.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: {
      reference: report.reference,
      documentCount,
      resultCount,
      authenticator: name,
      authenticatorRegistration: registration,
    },
  });

  const booking = await prisma.diagnosticBooking.findUnique({
    where: { id: report.bookingId },
    select: { reference: true, patient: { select: { email: true } } },
  });
  if (booking?.patient.email) {
    await sendNotification({
      kind: "lab_report_published",
      channel: "EMAIL",
      to: booking.patient.email,
      subject: `Your laboratory report ${report.reference} is ready`,
      body: `The laboratory has released report ${report.reference}. Open it in your ORVEXA account to read the results. Sign in to view it — the file is never sent as an attachment.`,
      reference: report.reference,
    }).catch(() => null);
  }

  return { ok: true, reportId: report.id, reference: report.reference, status: "PUBLISHED" };
}

/**
 * Takes a published report back for correction.
 *
 * The report leaves the patient's view until it is published again, which is the
 * only honest way to correct a released result: a patient must never be reading
 * a page that is being edited underneath them.
 */
export async function amendLabReport(input: {
  actor: ReportActor;
  labProfileId: string;
  reportId: string;
  reason: string;
}): Promise<PublishReportResult> {
  const report = await loadOwnedReport({ labProfileId: input.labProfileId, reportId: input.reportId });
  if (!report) return { ok: false, code: "not_found", message: "That report was not found for your laboratory." };
  if (!canTransitionLabReport(report.status, "AMENDED")) {
    return { ok: false, code: "invalid_transition", message: `A report that is ${report.status} cannot be amended.` };
  }

  await prisma.labReport.update({
    where: { id: report.id },
    data: { status: "AMENDED", amendmentReason: input.reason },
  });
  await recordReportAccess({ reportId: report.id, action: "AMENDED", actor: input.actor, note: input.reason });
  await recordAuditEvent({
    action: "diagnostics.report_amended",
    entityType: "lab_report",
    entityId: report.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { reference: report.reference, reason: input.reason },
  });

  return { ok: true, reportId: report.id, reference: report.reference, status: "AMENDED" };
}

export async function withdrawLabReport(input: {
  actor: ReportActor;
  labProfileId: string;
  reportId: string;
  reason: string;
}): Promise<PublishReportResult> {
  const report = await loadOwnedReport({ labProfileId: input.labProfileId, reportId: input.reportId });
  if (!report) return { ok: false, code: "not_found", message: "That report was not found for your laboratory." };
  if (!canTransitionLabReport(report.status, "WITHDRAWN")) {
    return { ok: false, code: "invalid_transition", message: `A report that is ${report.status} cannot be withdrawn.` };
  }

  await prisma.labReport.update({
    where: { id: report.id },
    data: { status: "WITHDRAWN", withdrawnReason: input.reason, withdrawnAt: new Date() },
  });
  await recordReportAccess({ reportId: report.id, action: "WITHDRAWN", actor: input.actor, note: input.reason });
  await recordAuditEvent({
    action: "diagnostics.report_withdrawn",
    entityType: "lab_report",
    entityId: report.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { reference: report.reference, reason: input.reason },
  });

  return { ok: true, reportId: report.id, reference: report.reference, status: "WITHDRAWN" };
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export type ReportShareResult =
  | { ok: true; shareId: string; url: string; expiresAt: Date; token: string }
  | { ok: false; code: ReportErrorCode; message: string };

/**
 * Hands one report to a named recipient through a time-limited link.
 *
 * Sharing is a second, deliberate decision on top of the booking consent, so a
 * `ConsentRecord` is written alongside the share. The plaintext token exists
 * only in the returned link; the database holds its HMAC.
 */
export async function shareLabReport(input: {
  actor: ReportActor;
  reportId: string;
  ownerUserId: string;
  sharedWithEmail?: string | null;
  sharedWithLabel?: string | null;
  canDownload: boolean;
  expiresInHours: number;
}): Promise<ReportShareResult> {
  const report = await prisma.labReport.findFirst({
    where: { id: input.reportId, booking: { patientUserId: input.ownerUserId }, deletedAt: null },
    select: { id: true, reference: true, status: true },
  });
  if (!report) return { ok: false, code: "not_found", message: "That report was not found on your account." };
  if (report.status !== "PUBLISHED") {
    return {
      ok: false,
      code: "report_not_shareable",
      message: "Only a published report can be shared. This report is not available to share.",
    };
  }
  if (!input.sharedWithEmail && !input.sharedWithLabel) {
    return {
      ok: false,
      code: "recipient_required",
      message: "Name the clinician or address this report is being shared with.",
    };
  }

  const token = createLinkToken();
  const tokenHash = hmacDigest(token, "lab-report-share");
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(input.expiresInHours, 168)) * 60 * 60 * 1000);
  const context = await getRequestContext();

  const share = await prisma.$transaction(async (tx) => {
    const created = await tx.labReportShare.create({
      data: {
        reportId: report.id,
        sharedByUserId: input.ownerUserId,
        sharedWithEmail: input.sharedWithEmail ?? null,
        sharedWithLabel: input.sharedWithLabel ?? null,
        canDownload: input.canDownload,
        tokenHash,
        expiresAt,
      },
      select: { id: true },
    });
    await tx.consentRecord.create({
      data: {
        userId: input.ownerUserId,
        consentType: "DIAGNOSTIC_REPORT_SHARING",
        policyVersion: REPORT_SHARING_CONSENT_POLICY_VERSION,
        granted: true,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return created;
  });

  await recordReportAccess({
    reportId: report.id,
    action: "SHARED",
    actor: input.actor,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
    note: input.sharedWithLabel ?? input.sharedWithEmail ?? null,
  });
  await recordAuditEvent({
    action: "diagnostics.report_shared",
    entityType: "lab_report_share",
    entityId: share.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { reference: report.reference, canDownload: input.canDownload, expiresAt: expiresAt.toISOString() },
  });

  return {
    ok: true,
    shareId: share.id,
    token,
    expiresAt,
    url: `${getPublicBaseUrl()}/reports/shared/${token}`,
  };
}

export async function revokeLabReportShare(input: {
  actor: ReportActor;
  ownerUserId: string;
  shareId: string;
}): Promise<{ ok: true; revoked: boolean } | { ok: false; code: ReportErrorCode; message: string }> {
  const share = await prisma.labReportShare.findFirst({
    where: { id: input.shareId, sharedByUserId: input.ownerUserId },
    select: { id: true, reportId: true, revokedAt: true, report: { select: { reference: true } } },
  });
  if (!share) return { ok: false, code: "share_not_found", message: "That share was not found on your account." };
  if (share.revokedAt) return { ok: true, revoked: true };

  await prisma.labReportShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
  await recordReportAccess({ reportId: share.reportId, action: "SHARE_REVOKED", actor: input.actor });
  await recordAuditEvent({
    action: "diagnostics.report_share_revoked",
    entityType: "lab_report_share",
    entityId: share.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { reportReference: share.report.reference },
  });

  return { ok: true, revoked: true };
}

export type SharedReportView = {
  reference: string;
  status: LabReportStatus;
  canDownload: boolean;
  expiresAt: Date;
  sharedWithLabel: string | null;
  lab: { legalName: string; tradeName: string | null; accreditationNumber: string | null };
  authenticatedByName: string | null;
  authenticatedByRegistration: string | null;
  authenticatedAt: Date | null;
  reportedAt: Date | null;
  interpretation: string | null;
  results: {
    id: string;
    analyteName: string;
    value: string | null;
    unit: string | null;
    referenceRange: string | null;
    flag: string;
    method: string | null;
  }[];
  documents: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
};

/**
 * Resolves a share token.
 *
 * Every failure is its own answer: a revoked, expired or unknown token never
 * resolves to a report, and an expired link is reported as expired rather than
 * silently re-issued. A successful view is counted and logged.
 */
export async function resolveLabReportShare(input: {
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: true; view: SharedReportView } | { ok: false; code: ReportErrorCode; message: string }> {
  const tokenHash = hmacDigest(input.token, "lab-report-share");
  const share = await prisma.labReportShare.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      reportId: true,
      canDownload: true,
      expiresAt: true,
      revokedAt: true,
      sharedWithLabel: true,
      report: {
        select: {
          reference: true,
          status: true,
          interpretation: true,
          authenticatedByName: true,
          authenticatedByRegistration: true,
          authenticatedAt: true,
          reportedAt: true,
          labProfile: { select: { legalName: true, tradeName: true, accreditationNumber: true } },
          results: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              analyteName: true,
              value: true,
              unit: true,
              referenceRange: true,
              flag: true,
              method: true,
            },
          },
          documents: {
            where: { deletedAt: null, status: "READY" },
            orderBy: { createdAt: "asc" },
            select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
          },
        },
      },
    },
  });

  if (!share) return { ok: false, code: "share_not_found", message: "That link is not valid." };
  if (share.revokedAt) {
    return { ok: false, code: "share_not_found", message: "The patient has withdrawn this link." };
  }
  if (share.expiresAt.getTime() <= Date.now()) {
    return { ok: false, code: "share_expired", message: "That link has expired. Ask the patient for a new one." };
  }
  if (share.report.status !== "PUBLISHED") {
    return { ok: false, code: "report_not_shareable", message: "That report is not currently available." };
  }

  await prisma.labReportShare.update({
    where: { id: share.id },
    data: { viewCount: { increment: 1 }, viewedAt: new Date() },
  });
  await recordReportAccess({
    reportId: share.reportId,
    action: "VIEWED",
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    note: "Opened through a shared link.",
  });

  return {
    ok: true,
    view: {
      reference: share.report.reference,
      status: share.report.status,
      canDownload: share.canDownload,
      expiresAt: share.expiresAt,
      sharedWithLabel: share.sharedWithLabel,
      lab: share.report.labProfile,
      authenticatedByName: share.report.authenticatedByName,
      authenticatedByRegistration: share.report.authenticatedByRegistration,
      authenticatedAt: share.report.authenticatedAt,
      reportedAt: share.report.reportedAt,
      interpretation: share.report.interpretation,
      results: share.report.results,
      documents: share.report.documents,
    },
  };
}

// ---------------------------------------------------------------------------
// Documents: reading
// ---------------------------------------------------------------------------

export type ReportDocumentAccessResult =
  | { ok: true; url: string; expiresAt: Date; fileName: string; mimeType: string }
  | { ok: false; code: ReportErrorCode; message: string };

/**
 * A short-lived link to one report document, for the patient who owns it.
 *
 * A `DRAFT` report has no readable document from the patient's side: the link is
 * refused, not issued-then-hidden.
 */
export async function createPatientReportDocumentLink(input: {
  ownerUserId: string;
  reportId: string;
  documentId: string;
  download: boolean;
}): Promise<ReportDocumentAccessResult> {
  const document = await prisma.labReportDocument.findFirst({
    where: {
      id: input.documentId,
      reportId: input.reportId,
      deletedAt: null,
      status: "READY",
      report: { booking: { patientUserId: input.ownerUserId } },
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      storageKey: true,
      reportId: true,
      report: { select: { reference: true, status: true } },
    },
  });
  if (!document) return { ok: false, code: "not_found", message: "That document was not found on your account." };
  if (document.report.status !== "PUBLISHED") {
    return {
      ok: false,
      code: "not_publishable",
      message: "That report has not been released yet, so its file is not available.",
    };
  }

  const link = await createDocumentLink(document.storageKey, DOCUMENT_LINK_TTL_SECONDS);
  if (!link.ok) return { ok: false, code: "document_rejected", message: link.error.message };

  const context = await getRequestContext();
  await recordReportAccess({
    reportId: document.reportId,
    action: input.download ? "DOWNLOADED" : "LINK_ISSUED",
    actor: { userId: input.ownerUserId, role: "PATIENT" },
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });
  await recordAuditEvent({
    action: input.download ? "diagnostics.report_downloaded" : "diagnostics.report_link_issued",
    entityType: "lab_report_document",
    entityId: document.id,
    actorUserId: input.ownerUserId,
    metadata: { reportReference: document.report.reference },
  });

  return {
    ok: true,
    url: link.data.url,
    expiresAt: link.data.expiresAt,
    fileName: document.fileName,
    mimeType: document.mimeType,
  };
}

/** A link for the shared-link viewer, only when the share permits a download. */
export async function createSharedReportDocumentLink(input: {
  token: string;
  documentId: string;
}): Promise<ReportDocumentAccessResult> {
  const tokenHash = hmacDigest(input.token, "lab-report-share");
  const share = await prisma.labReportShare.findUnique({
    where: { tokenHash },
    select: {
      canDownload: true,
      expiresAt: true,
      revokedAt: true,
      reportId: true,
      report: { select: { status: true } },
    },
  });
  if (!share) return { ok: false, code: "share_not_found", message: "That link is not valid." };
  if (share.revokedAt) return { ok: false, code: "share_not_found", message: "The patient has withdrawn this link." };
  if (share.expiresAt.getTime() <= Date.now()) {
    return { ok: false, code: "share_expired", message: "That link has expired." };
  }
  if (!share.canDownload) {
    return { ok: false, code: "not_found", message: "This link may be viewed but the file may not be downloaded." };
  }
  if (share.report.status !== "PUBLISHED") {
    return { ok: false, code: "report_not_shareable", message: "That report is not currently available." };
  }

  const document = await prisma.labReportDocument.findFirst({
    where: { id: input.documentId, reportId: share.reportId, deletedAt: null, status: "READY" },
    select: { id: true, fileName: true, mimeType: true, storageKey: true },
  });
  if (!document) return { ok: false, code: "not_found", message: "That document is not part of this report." };

  const link = await createDocumentLink(document.storageKey, DOCUMENT_LINK_TTL_SECONDS);
  if (!link.ok) return { ok: false, code: "document_rejected", message: link.error.message };

  await recordReportAccess({ reportId: share.reportId, action: "DOWNLOADED", note: "shared link" });
  return {
    ok: true,
    url: link.data.url,
    expiresAt: link.data.expiresAt,
    fileName: document.fileName,
    mimeType: document.mimeType,
  };
}

// ---------------------------------------------------------------------------
// Report exchange
// ---------------------------------------------------------------------------

/**
 * Hands an authenticated report to a recipient's system.
 *
 * The exchange needs a live signed URL for the document and a named recipient.
 * The strongest claim it produces is transport acceptance, and the outcome is
 * returned verbatim so a page can say exactly what happened.
 */
export async function exchangeLabReport(input: {
  actor: ReportActor;
  ownerUserId: string;
  reportId: string;
  recipient: { name: string; reference: string; kind: "CLINICIAN" | "FACILITY" | "SYSTEM" };
}) {
  const report = await prisma.labReport.findFirst({
    where: { id: input.reportId, booking: { patientUserId: input.ownerUserId }, deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      authenticatedByName: true,
      authenticatedByRegistration: true,
      authenticatedAt: true,
      documents: {
        where: { deletedAt: null, status: "READY" },
        orderBy: { createdAt: "asc" },
        select: { id: true, mimeType: true, storageKey: true },
        take: 1,
      },
      results: { select: { flag: true } },
    },
  });
  if (!report) return { ok: false as const, code: "not_found" as const, message: "That report was not found on your account." };
  if (report.status !== "PUBLISHED") {
    return { ok: false as const, code: "report_not_shareable" as const, message: "Only a published report can be exchanged." };
  }
  if (!report.authenticatedByName || !report.authenticatedByRegistration || !report.authenticatedAt) {
    return {
      ok: false as const,
      code: "authenticator_required" as const,
      message: "This report has no recorded authenticator, so it cannot be exchanged.",
    };
  }

  const document = report.documents[0];
  if (!document) {
    return { ok: false as const, code: "not_publishable" as const, message: "This report has no stored document to exchange." };
  }

  const link = await createDocumentLink(document.storageKey, DOCUMENT_LINK_TTL_SECONDS);
  if (!link.ok) {
    return { ok: false as const, code: "document_rejected" as const, message: link.error.message };
  }

  const outcome = await exchangeReport({
    reportReference: report.reference,
    recipient: input.recipient,
    documentUrl: link.data.url,
    documentContentType: document.mimeType,
    documentUrlExpiresAt: link.data.expiresAt,
    authenticatedByName: report.authenticatedByName,
    authenticatedByRegistration: report.authenticatedByRegistration,
    authenticatedAt: report.authenticatedAt,
    summary: {
      analyteCount: report.results.length,
      hasAbnormalFlags: report.results.some((line) => line.flag !== "NORMAL" && line.flag !== "UNKNOWN"),
    },
  });

  await recordAuditEvent({
    action: "diagnostics.report_shared",
    entityType: "lab_report",
    entityId: report.id,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    metadata: { reference: report.reference, exchange: outcome.outcome, recipient: input.recipient.reference },
  });

  return { ok: true as const, outcome };
}

// ---------------------------------------------------------------------------
// Patient reads
// ---------------------------------------------------------------------------

/**
 * Resolves a patient-visible reference to the report behind it.
 *
 * A route that has a reference in its path needs the id, and it needs the
 * ownership check to happen once. This deliberately logs nothing: reading a
 * report is logged by `getPatientLabReportByReference`, and issuing a file link
 * is logged by `createPatientReportDocumentLink`.
 */
export async function findPatientReportId(input: { userId: string; reference: string }) {
  return prisma.labReport.findFirst({
    where: { reference: input.reference, booking: { patientUserId: input.userId }, deletedAt: null },
    select: { id: true, reference: true, status: true },
  });
}

export async function listPatientLabReports(userId: string): Promise<LabReportSummary[]> {
  return prisma.labReport.findMany({
    where: { booking: { patientUserId: userId }, deletedAt: null, status: { not: "DRAFT" } },
    select: REPORT_SUMMARY_SELECT,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

/**
 * One report, for the patient who owns it.
 *
 * Content — the result lines and the file list — is only attached when the
 * report is `PUBLISHED`. A withdrawn or in-amendment report returns its status
 * and nothing else, so a page can say "the laboratory has withdrawn this report"
 * instead of rendering a stale table.
 */
export async function getPatientLabReportByReference(input: {
  userId: string;
  reference: string;
}): Promise<{ report: LabReportDetail; contentAvailable: boolean } | null> {
  const report = await prisma.labReport.findFirst({
    where: { reference: input.reference, booking: { patientUserId: input.userId }, deletedAt: null },
    select: REPORT_DETAIL_SELECT,
  });
  if (!report) return null;

  const contentAvailable = PATIENT_READABLE_REPORT_STATUSES.includes(report.status);
  if (!contentAvailable) {
    return { report: { ...report, documents: [], results: [] }, contentAvailable: false };
  }

  await recordReportAccess({
    reportId: report.id,
    action: "VIEWED",
    actor: { userId: input.userId, role: "PATIENT" },
  });

  return { report, contentAvailable };
}

// ---------------------------------------------------------------------------
// Laboratory reads
// ---------------------------------------------------------------------------

export async function listLabReportQueue(input: {
  labProfileId: string;
  status?: LabReportStatus;
  limit?: number;
}): Promise<LabReportSummary[]> {
  return prisma.labReport.findMany({
    where: { labProfileId: input.labProfileId, deletedAt: null, ...(input.status ? { status: input.status } : {}) },
    select: REPORT_SUMMARY_SELECT,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(input.limit ?? 100, 200)),
  });
}

export async function getLabReportForOwner(input: {
  labProfileId: string;
  reportId: string;
}): Promise<LabReportDetail | null> {
  return prisma.labReport.findFirst({
    where: { id: input.reportId, labProfileId: input.labProfileId, deletedAt: null },
    select: REPORT_DETAIL_SELECT,
  });
}

/** Bookings a laboratory has that are ready for a report but do not have one. */
export async function listBookingsAwaitingReport(labProfileId: string) {
  return prisma.diagnosticBooking.findMany({
    where: {
      labProfileId,
      status: { in: ["SAMPLE_COLLECTED", "PROCESSING"] },
      reports: { none: { deletedAt: null, status: { in: ["DRAFT", "AMENDED"] } } },
    },
    select: { id: true, reference: true, status: true, scheduledAt: true, patientUserId: true },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });
}

export type { LabReportDocumentKind };
export const REPORT_RESULT_DISCIPLINE_NOTICE = LAB_RESULT_DISCIPLINE;
export const REPORT_CONSENT_POLICY_VERSION = DIAGNOSTIC_CONSENT_POLICY_VERSION;
