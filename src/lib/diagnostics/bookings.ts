import "server-only";

import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import type {
  CancelledBy,
  DiagnosticBookingEventType,
  DiagnosticBookingStatus,
} from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { DIAGNOSTIC_CONSENT_POLICY_VERSION } from "@/lib/diagnostics/labels";
import { submitBookingToLab } from "@/lib/diagnostics/lab-integration";
import { sendNotification } from "@/lib/notifications/provider";
import { recordAuditEvent } from "@/lib/security/audit";
import { getRequestContext } from "@/lib/security/request";
import type { DiagnosticBookingInput } from "@/lib/validation/diagnostics";

/**
 * Diagnostic bookings: creation, rescheduling, cancellation and the laboratory's
 * own status updates.
 *
 * ## Money is frozen, never taken from the client
 *
 * Every price on a booking is read from the laboratory's own `DiagnosticTestOffer`
 * inside the same transaction that writes the booking, and copied onto the
 * invoice lines. The client names tests and a mode; it never sends a rupee. A
 * test the laboratory does not offer, or offers only inactively, fails the whole
 * booking rather than being silently priced at zero.
 *
 * ## Idempotency
 *
 * `DiagnosticBooking` carries `@@unique([createdById, idempotencyKey])`, so a
 * double tap or a retried submit resolves to the same booking instead of a
 * second one. A replay by a *different* account is refused, never adopted.
 *
 * ## The laboratory is informed, never assumed
 *
 * Pushing the booking to a partner's own system is best-effort and recorded as
 * an event. When no integration is configured the booking simply awaits the
 * laboratory's console action; nothing here claims the laboratory accepted it.
 */

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomReferenceBody(): string {
  const bytes = randomBytes(6);
  let body = "";
  for (const byte of bytes) body += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return body;
}

/** A patient-facing reference, e.g. ORX-DX-4M9K2P. Six base32 characters. */
export function generateDiagnosticReference(): string {
  return `ORX-DX-${randomReferenceBody()}`;
}

// ---------------------------------------------------------------------------
// Result vocabulary
// ---------------------------------------------------------------------------

export type DiagnosticErrorCode =
  | "lab_not_found"
  | "lab_not_verified"
  | "test_not_offered"
  | "test_not_listable"
  | "no_tests"
  | "home_collection_unavailable"
  | "address_not_found"
  | "family_member_not_found"
  | "consent_required"
  | "not_found"
  | "not_cancellable"
  | "not_reschedulable"
  | "invalid_transition"
  | "conflict";

class DiagnosticFailure extends Error {
  readonly code: DiagnosticErrorCode;

  constructor(code: DiagnosticErrorCode, message: string) {
    super(message);
    this.name = "DiagnosticFailure";
    this.code = code;
  }
}

export type DiagnosticActor = {
  userId?: string | null;
  role?: "PATIENT" | "LAB_PARTNER" | "PLATFORM_ADMIN" | null;
  label?: string | null;
};

// ---------------------------------------------------------------------------
// The status machine
// ---------------------------------------------------------------------------

/**
 * Which transitions are legal.
 *
 * `REPORT_READY` and `COMPLETED` are reachable only from a laboratory's own
 * progress — and `REPORT_READY` is written by the report service when an
 * authenticated report is published, never chosen by a partner, so a portal
 * cannot type a status that implies a result exists.
 */
export const DIAGNOSTIC_BOOKING_TRANSITIONS: Record<DiagnosticBookingStatus, readonly DiagnosticBookingStatus[]> = {
  REQUESTED: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["SAMPLE_COLLECTED", "CANCELLED", "NO_SHOW"],
  SAMPLE_COLLECTED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["REPORT_READY", "CANCELLED"],
  REPORT_READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const STATUS_TIMESTAMP_FIELD: Partial<
  Record<DiagnosticBookingStatus, "confirmedAt" | "sampleCollectedAt" | "completedAt">
> = {
  CONFIRMED: "confirmedAt",
  SAMPLE_COLLECTED: "sampleCollectedAt",
  COMPLETED: "completedAt",
};

const STATUS_EVENT: Record<DiagnosticBookingStatus, DiagnosticBookingEventType> = {
  REQUESTED: "REQUESTED",
  CONFIRMED: "CONFIRMED",
  SAMPLE_COLLECTED: "SAMPLE_COLLECTED",
  PROCESSING: "PROCESSING_STARTED",
  REPORT_READY: "REPORT_PUBLISHED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
};

export function canTransitionDiagnosticBooking(
  from: DiagnosticBookingStatus,
  to: DiagnosticBookingStatus,
): boolean {
  return DIAGNOSTIC_BOOKING_TRANSITIONS[from].includes(to);
}

export type DiagnosticTransitionResult =
  | { ok: true; bookingId: string; reference: string; status: DiagnosticBookingStatus; unchanged: boolean }
  | { ok: false; code: DiagnosticErrorCode; message: string };

export async function transitionDiagnosticBooking(input: {
  bookingId: string;
  next: DiagnosticBookingStatus;
  actor?: DiagnosticActor;
  note?: string | null;
  eventType?: DiagnosticBookingEventType;
  cancellationReason?: string | null;
}): Promise<DiagnosticTransitionResult> {
  const booking = await prisma.diagnosticBooking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, reference: true, status: true },
  });
  if (!booking) return { ok: false, code: "not_found", message: "That booking was not found." };

  if (booking.status === input.next) {
    return { ok: true, bookingId: booking.id, reference: booking.reference, status: booking.status, unchanged: true };
  }

  if (!canTransitionDiagnosticBooking(booking.status, input.next)) {
    return {
      ok: false,
      code: "invalid_transition",
      message: `A booking that is ${booking.status} cannot move to ${input.next}.`,
    };
  }

  const timestampField = STATUS_TIMESTAMP_FIELD[input.next];
  await prisma.diagnosticBooking.update({
    where: { id: booking.id },
    data: {
      status: input.next,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
      ...(input.next === "CANCELLED"
        ? {
            cancellationReason: input.cancellationReason ?? input.note ?? null,
            cancelledById: input.actor?.userId ?? null,
            cancelledByRole: mapActorToCancelledBy(input.actor),
            cancelledAt: new Date(),
          }
        : {}),
    },
  });

  await prisma.diagnosticBookingEvent.create({
    data: {
      bookingId: booking.id,
      type: input.eventType ?? STATUS_EVENT[input.next],
      fromStatus: booking.status,
      toStatus: input.next,
      actorUserId: input.actor?.userId ?? null,
      actorRole: input.actor?.role ?? null,
      actorLabel: input.actor?.label ?? null,
      note: input.note ?? null,
    },
  });

  await recordAuditEvent({
    action: input.next === "CANCELLED" ? "diagnostics.booking_cancelled" : "diagnostics.booking_status_changed",
    entityType: "diagnostic_booking",
    entityId: booking.id,
    actorUserId: input.actor?.userId ?? null,
    actorLabel: input.actor?.label ?? null,
    metadata: { from: booking.status, to: input.next, reference: booking.reference },
  });

  return { ok: true, bookingId: booking.id, reference: booking.reference, status: input.next, unchanged: false };
}

function mapActorToCancelledBy(actor?: DiagnosticActor): CancelledBy | null {
  if (!actor?.role) return null;
  if (actor.role === "PATIENT") return "PATIENT";
  if (actor.role === "LAB_PARTNER") return "PROVIDER";
  if (actor.role === "PLATFORM_ADMIN") return "PLATFORM";
  return null;
}

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const BOOKING_SUMMARY_SELECT = {
  id: true,
  reference: true,
  status: true,
  mode: true,
  scheduledAt: true,
  scheduledEndAt: true,
  estimatedTotalInr: true,
  testsSubtotalInr: true,
  homeCollectionFeeInr: true,
  patientUserId: true,
  familyMemberId: true,
  labProfileId: true,
  createdAt: true,
  confirmedAt: true,
  sampleCollectedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  labProfile: { select: { id: true, legalName: true, tradeName: true, verificationStatus: true } },
  _count: { select: { items: true, reports: true } },
} satisfies Prisma.DiagnosticBookingSelect;

export type DiagnosticBookingSummary = Prisma.DiagnosticBookingGetPayload<{ select: typeof BOOKING_SUMMARY_SELECT }>;

const BOOKING_DETAIL_SELECT = {
  ...BOOKING_SUMMARY_SELECT,
  facilityId: true,
  collectionContactName: true,
  collectionPhone: true,
  collectionAddressId: true,
  collectionAddressText: true,
  collectionCity: true,
  collectionPostalCode: true,
  patientNotes: true,
  consentAcknowledgedAt: true,
  consentPolicyVersion: true,
  rescheduledFromId: true,
  createdById: true,
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      testId: true,
      offerId: true,
      testNameSnapshot: true,
      priceInr: true,
      homeCollectionFeeInr: true,
    },
  },
  events: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      fromStatus: true,
      toStatus: true,
      actorRole: true,
      actorLabel: true,
      note: true,
      createdAt: true,
    },
  },
  reports: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      status: true,
      publishedAt: true,
      reportedAt: true,
    },
  },
  familyMember: { select: { id: true, fullName: true, relationship: true } },
} satisfies Prisma.DiagnosticBookingSelect;

export type DiagnosticBookingDetail = Prisma.DiagnosticBookingGetPayload<{ select: typeof BOOKING_DETAIL_SELECT }>;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateDiagnosticBookingResult =
  | { ok: true; booking: DiagnosticBookingSummary; reused: boolean; labSubmission: string }
  | { ok: false; code: DiagnosticErrorCode; message: string };

async function reserveDiagnosticReference(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateDiagnosticReference();
    const clash = await tx.diagnosticBooking.findUnique({ where: { reference: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  throw new DiagnosticFailure("conflict", "A booking reference could not be allocated. Please try again.");
}

export async function createDiagnosticBooking(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName" | "email" | "phone">;
  data: DiagnosticBookingInput;
}): Promise<CreateDiagnosticBookingResult> {
  const { data } = input;

  if (!data.consentAcknowledged) {
    return {
      ok: false,
      code: "consent_required",
      message: "Confirm that you consent to the sample being collected and the report being released to this account.",
    };
  }

  // A replay finds its booking and returns it, rather than opening a second one.
  const existing = await prisma.diagnosticBooking.findUnique({
    where: { createdById_idempotencyKey: { createdById: input.user.id, idempotencyKey: data.idempotencyKey } },
    select: BOOKING_SUMMARY_SELECT,
  });
  if (existing) {
    if (existing.patientUserId !== input.user.id) {
      return { ok: false, code: "conflict", message: "That booking key has already been used on another account." };
    }
    return { ok: true, booking: existing, reused: true, labSubmission: "not_configured" };
  }

  const lab = await prisma.labPartnerProfile.findUnique({
    where: { id: data.labProfileId },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      facilityId: true,
      verificationStatus: true,
      status: true,
      acceptsHomeCollection: true,
      sampleCollectionFeeInr: true,
      complianceAcknowledgedAt: true,
    },
  });
  if (!lab) return { ok: false, code: "lab_not_found", message: "That laboratory was not found." };
  if (lab.verificationStatus !== "VERIFIED" || lab.status !== "APPROVED") {
    return {
      ok: false,
      code: "lab_not_verified",
      message: "That laboratory is not verified to take bookings on ORVEXA yet.",
    };
  }
  if (data.mode === "HOME_COLLECTION" && !lab.acceptsHomeCollection) {
    return {
      ok: false,
      code: "home_collection_unavailable",
      message: "That laboratory does not offer home sample collection. Choose a walk-in collection centre instead.",
    };
  }

  let collectionAddress: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    postalCode: string;
  } | null = null;

  if (data.mode === "HOME_COLLECTION" && data.collectionAddressId) {
    const address = await prisma.patientAddress.findFirst({
      where: { id: data.collectionAddressId, ownerUserId: input.user.id, deletedAt: null },
      select: {
        recipientName: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        landmark: true,
        city: true,
        state: true,
        postalCode: true,
      },
    });
    if (!address) {
      return { ok: false, code: "address_not_found", message: "That collection address was not found on your account." };
    }
    collectionAddress = address;
  }

  if (data.familyMemberId) {
    const member = await prisma.familyMember.findFirst({
      where: { id: data.familyMemberId, patientProfile: { userId: input.user.id } },
      select: { id: true, canBookAppointments: true },
    });
    if (!member) {
      return { ok: false, code: "family_member_not_found", message: "That family member is not on your account." };
    }
    if (!member.canBookAppointments) {
      return {
        ok: false,
        code: "family_member_not_found",
        message: "You do not have permission to book for that family member.",
      };
    }
  }

  const context = await getRequestContext();

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Re-read every offer inside the transaction so the price charged against
      // is the price at the moment of the write.
      const offers = await tx.diagnosticTestOffer.findMany({
        where: { labProfileId: lab.id, testId: { in: data.testIds }, isActive: true },
        select: {
          id: true,
          testId: true,
          priceInr: true,
          homeCollectionFeeInr: true,
          homeCollectionAvailable: true,
          isActive: true,
          test: { select: { id: true, name: true, listable: true, deletedAt: true } },
        },
      });

      const byTestId = new Map(offers.map((offer) => [offer.testId, offer]));
      const lines: {
        testId: string;
        offerId: string;
        testNameSnapshot: string;
        priceInr: number;
        homeCollectionFeeInr: number;
      }[] = [];
      let subtotalInr = 0;

      for (const testId of data.testIds) {
        const offer = byTestId.get(testId);
        if (!offer) {
          throw new DiagnosticFailure(
            "test_not_offered",
            "One of the tests you selected is not offered by this laboratory. Re-select your tests and try again.",
          );
        }
        if (!offer.test.listable || offer.test.deletedAt) {
          throw new DiagnosticFailure(
            "test_not_listable",
            "One of the tests you selected is not available through ORVEXA. Nothing was booked.",
          );
        }
        if (data.mode === "HOME_COLLECTION" && !offer.homeCollectionAvailable) {
          throw new DiagnosticFailure(
            "home_collection_unavailable",
            `This laboratory does not collect a sample at home for ${offer.test.name}. Book it as a walk-in instead.`,
          );
        }
        lines.push({
          testId: offer.testId,
          offerId: offer.id,
          testNameSnapshot: offer.test.name,
          priceInr: offer.priceInr,
          homeCollectionFeeInr: data.mode === "HOME_COLLECTION" ? (offer.homeCollectionFeeInr ?? 0) : 0,
        });
        subtotalInr += offer.priceInr;
      }

      if (lines.length === 0) {
        throw new DiagnosticFailure("no_tests", "Choose at least one test to book.");
      }

      // The collection fee is charged once per visit, not per test: the higher of
      // the laboratory's own stated fee and any offer-level fee, and never
      // invented when the laboratory has published neither.
      const homeCollectionFeeInr =
        data.mode === "HOME_COLLECTION"
          ? Math.max(lab.sampleCollectionFeeInr ?? 0, ...lines.map((line) => line.homeCollectionFeeInr))
          : 0;

      const estimatedTotalInr = subtotalInr + homeCollectionFeeInr;
      const reference = await reserveDiagnosticReference(tx);

      const scheduledAt = data.scheduledAt;
      const created = await tx.diagnosticBooking.create({
        data: {
          reference,
          patientUserId: input.user.id,
          familyMemberId: data.familyMemberId ?? null,
          labProfileId: lab.id,
          facilityId: data.facilityId ?? lab.facilityId ?? null,
          mode: data.mode,
          status: "REQUESTED",
          scheduledAt,
          scheduledEndAt: new Date(scheduledAt.getTime() + 60 * 60 * 1000),
          patientNotes: data.patientNotes ?? null,
          ...(data.mode === "HOME_COLLECTION"
            ? {
                collectionContactName: collectionAddress?.recipientName ?? data.collectionContactName ?? null,
                collectionPhone: collectionAddress?.phone ?? data.collectionPhone ?? null,
                collectionAddressId: data.collectionAddressId ?? null,
                collectionAddressText: collectionAddress
                  ? [collectionAddress.addressLine1, collectionAddress.addressLine2, collectionAddress.landmark]
                      .filter(Boolean)
                      .join(", ")
                  : (data.collectionAddressText ?? null),
                collectionCity: collectionAddress?.city ?? data.collectionCity ?? null,
                collectionPostalCode: collectionAddress?.postalCode ?? data.collectionPostalCode ?? null,
              }
            : {}),
          testsSubtotalInr: subtotalInr,
          homeCollectionFeeInr,
          estimatedTotalInr,
          consentAcknowledgedAt: new Date(),
          consentPolicyVersion: data.consentPolicyVersion,
          createdById: input.user.id,
          idempotencyKey: data.idempotencyKey,
          items: {
            create: lines.map((line) => ({
              testId: line.testId,
              offerId: line.offerId,
              testNameSnapshot: line.testNameSnapshot,
              priceInr: line.priceInr,
              homeCollectionFeeInr: line.homeCollectionFeeInr,
            })),
          },
          events: {
            create: {
              type: "REQUESTED",
              toStatus: "REQUESTED",
              actorUserId: input.user.id,
              actorRole: "PATIENT",
              actorLabel: input.user.fullName,
              metadata: { reference, mode: data.mode, testCount: lines.length },
            },
          },
        },
        select: BOOKING_SUMMARY_SELECT,
      });

      // Consent is a row, not a flag on the booking: withdrawing it later is its
      // own decision, and this is what makes that possible.
      await tx.consentRecord.create({
        data: {
          userId: input.user.id,
          consentType: "DIAGNOSTIC_SAMPLE_COLLECTION",
          policyVersion: data.consentPolicyVersion || DIAGNOSTIC_CONSENT_POLICY_VERSION,
          granted: true,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      });

      return {
        booking: created,
        testNames: lines.map((line) => line.testNameSnapshot),
        collectionAddressText: collectionAddress
          ? [collectionAddress.addressLine1, collectionAddress.addressLine2, collectionAddress.landmark, collectionAddress.city, collectionAddress.state, collectionAddress.postalCode]
              .filter(Boolean)
              .join(", ")
          : (data.collectionAddressText ?? null),
        contactPhone: collectionAddress?.phone ?? data.collectionPhone ?? input.user.phone ?? null,
      };
    });
    const { booking, testNames, collectionAddressText, contactPhone } = outcome;

    await recordAuditEvent({
      action: "diagnostics.booking_created",
      entityType: "diagnostic_booking",
      entityId: booking.id,
      actorUserId: input.user.id,
      actorLabel: input.user.fullName,
      metadata: { reference: booking.reference, labProfileId: lab.id, mode: data.mode, idempotencyKey: data.idempotencyKey },
    });

    // Best-effort hand-off to the laboratory's own system. Its outcome is
    // recorded as an event and reported; it never changes the booking's status.
    const submission = await submitBookingToLab({
      reference: booking.reference,
      mode: data.mode,
      scheduledAt: data.scheduledAt,
      patientName: input.user.fullName,
      patientPhone: contactPhone,
      tests: testNames,
      collectionAddress: data.mode === "HOME_COLLECTION" ? collectionAddressText : null,
      notes: data.patientNotes ?? null,
    }).catch(() => null);

    const labSubmission = submission?.outcome ?? "failed";
    if (submission) {
      await prisma.diagnosticBookingEvent.create({
        data: {
          bookingId: booking.id,
          type: "NOTE",
          actorLabel: "ORVEXA",
          note:
            submission.outcome === "submitted"
              ? "The booking was sent to the laboratory's own system."
              : submission.message,
          metadata: { labIntegration: submission.outcome },
        },
      });
    }

    // Notification attempt. The transport reports honestly whether anything left
    // the building; it never claims an email was delivered when none was sent.
    await sendNotification({
      kind: "diagnostic_booking_confirmed",
      channel: "EMAIL",
      to: input.user.email,
      subject: `Diagnostic booking ${booking.reference} received`,
      body:
        submission?.outcome === "submitted"
          ? "Your booking has been sent to the laboratory for confirmation."
          : "Your booking has been received and is awaiting the laboratory's confirmation.",
      reference: booking.reference,
    }).catch(() => null);

    return { ok: true, booking, reused: false, labSubmission };
  } catch (error) {
    if (error instanceof DiagnosticFailure) return { ok: false, code: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        code: "conflict",
        message: "This booking was already submitted. Open your bookings to see it.",
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reschedule and cancel
// ---------------------------------------------------------------------------

export type ManageBookingResult =
  | { ok: true; bookingId: string; reference: string; status: DiagnosticBookingStatus }
  | { ok: false; code: DiagnosticErrorCode; message: string };

const MANAGEABLE_STATUSES: readonly DiagnosticBookingStatus[] = ["REQUESTED", "CONFIRMED"];

export async function rescheduleDiagnosticBooking(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName">;
  bookingId: string;
  scheduledAt: Date;
  reason?: string | null;
}): Promise<ManageBookingResult> {
  const booking = await prisma.diagnosticBooking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, reference: true, status: true, patientUserId: true, labProfileId: true },
  });
  if (!booking) return { ok: false, code: "not_found", message: "That booking was not found." };
  if (booking.patientUserId !== input.user.id) {
    return { ok: false, code: "not_found", message: "That booking was not found on your account." };
  }
  if (!MANAGEABLE_STATUSES.includes(booking.status)) {
    return {
      ok: false,
      code: "not_reschedulable",
      message: `A booking that is ${booking.status} cannot be rescheduled.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.diagnosticBooking.update({
      where: { id: booking.id },
      data: {
        scheduledAt: input.scheduledAt,
        scheduledEndAt: new Date(input.scheduledAt.getTime() + 60 * 60 * 1000),
      },
    });
    await tx.diagnosticBookingEvent.create({
      data: {
        bookingId: booking.id,
        type: "RESCHEDULED",
        fromStatus: booking.status,
        toStatus: booking.status,
        actorUserId: input.user.id,
        actorRole: "PATIENT",
        actorLabel: input.user.fullName,
        note: input.reason ?? null,
        metadata: { scheduledAt: input.scheduledAt.toISOString() },
      },
    });
  });

  await recordAuditEvent({
    action: "diagnostics.booking_rescheduled",
    entityType: "diagnostic_booking",
    entityId: booking.id,
    actorUserId: input.user.id,
    actorLabel: input.user.fullName,
    metadata: { reference: booking.reference, scheduledAt: input.scheduledAt.toISOString() },
  });

  return { ok: true, bookingId: booking.id, reference: booking.reference, status: booking.status };
}

export async function cancelDiagnosticBooking(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName" | "email">;
  bookingId: string;
  reason: string;
}): Promise<ManageBookingResult> {
  const booking = await prisma.diagnosticBooking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, reference: true, status: true, patientUserId: true },
  });
  if (!booking) return { ok: false, code: "not_found", message: "That booking was not found." };
  if (booking.patientUserId !== input.user.id) {
    return { ok: false, code: "not_found", message: "That booking was not found on your account." };
  }
  if (booking.status === "CANCELLED") {
    return { ok: true, bookingId: booking.id, reference: booking.reference, status: "CANCELLED" };
  }
  if (!canTransitionDiagnosticBooking(booking.status, "CANCELLED")) {
    return {
      ok: false,
      code: "not_cancellable",
      message: `A booking that is ${booking.status} can no longer be cancelled here. Contact the laboratory.`,
    };
  }

  const result = await transitionDiagnosticBooking({
    bookingId: booking.id,
    next: "CANCELLED",
    actor: { userId: input.user.id, role: "PATIENT", label: input.user.fullName },
    cancellationReason: input.reason,
    note: input.reason,
  });
  if (!result.ok) return result;

  await sendNotification({
    kind: "diagnostic_booking_cancelled",
    channel: "EMAIL",
    to: input.user.email,
    subject: `Diagnostic booking ${booking.reference} cancelled`,
    body: "Your diagnostic booking has been cancelled. No sample will be collected.",
    reference: booking.reference,
  }).catch(() => null);

  return { ok: true, bookingId: booking.id, reference: booking.reference, status: "CANCELLED" };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listPatientDiagnosticBookings(userId: string): Promise<DiagnosticBookingSummary[]> {
  return prisma.diagnosticBooking.findMany({
    where: { patientUserId: userId },
    select: BOOKING_SUMMARY_SELECT,
    orderBy: [{ scheduledAt: "desc" }],
    take: 100,
  });
}

export async function getPatientDiagnosticBookingByReference(input: {
  userId: string;
  reference: string;
}): Promise<DiagnosticBookingDetail | null> {
  return prisma.diagnosticBooking.findFirst({
    where: { reference: input.reference, patientUserId: input.userId },
    select: BOOKING_DETAIL_SELECT,
  });
}

export async function listLabBookings(input: {
  labProfileId: string;
  status?: DiagnosticBookingStatus;
  limit?: number;
}): Promise<DiagnosticBookingSummary[]> {
  return prisma.diagnosticBooking.findMany({
    where: { labProfileId: input.labProfileId, ...(input.status ? { status: input.status } : {}) },
    select: BOOKING_SUMMARY_SELECT,
    orderBy: [{ scheduledAt: "asc" }],
    take: Math.max(1, Math.min(input.limit ?? 100, 200)),
  });
}

/** True only when this booking belongs to the laboratory the caller owns. */
export async function getLabBookingById(input: {
  labProfileId: string;
  bookingId: string;
}): Promise<DiagnosticBookingDetail | null> {
  return prisma.diagnosticBooking.findFirst({
    where: { id: input.bookingId, labProfileId: input.labProfileId },
    select: BOOKING_DETAIL_SELECT,
  });
}

/** The laboratory profile owned by a signed-in account, if any. */
export async function getLabProfileForOwner(userId: string) {
  return prisma.labPartnerProfile.findUnique({
    where: { ownerUserId: userId },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      verificationStatus: true,
      status: true,
      canPublishReports: true,
      acceptsHomeCollection: true,
      sampleCollectionFeeInr: true,
      coverageCities: true,
      coveragePostalCodes: true,
      standardTurnaroundHours: true,
      accreditationNumber: true,
      complianceAcknowledgedAt: true,
    },
  });
}
