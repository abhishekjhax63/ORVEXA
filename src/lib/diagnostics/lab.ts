import "server-only";

import { Prisma } from "@prisma/client";
import type { DiagnosticBookingStatus, LabReportStatus } from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { LAB_RECORDABLE_BOOKING_STATUSES } from "@/lib/validation/diagnostics";
import {
  transitionDiagnosticBooking,
  type DiagnosticErrorCode,
} from "@/lib/diagnostics/bookings";
import { paiseToRupees } from "@/lib/diagnostics/money";
import { recordAuditEvent } from "@/lib/security/audit";
import type {
  DiagnosticCategoryInput,
  DiagnosticTestInput,
  LabOfferInput,
  LabProfileInput,
  LabVerificationInput,
} from "@/lib/validation/diagnostics";

/**
 * The laboratory partner portal's write path.
 *
 * ## What a partner may change, and what it may not
 *
 * A partner owns its own profile and its own prices. It does **not** own its
 * verification, its `canPublishReports` flag, the catalogue, or a booking's
 * status beyond the four collection states a laboratory genuinely observes.
 * Those live in the admin functions at the bottom of this file, which are
 * reachable only through the `diagnostics.catalogue_manage` and
 * `provider.verification_manage` permissions.
 *
 * ## Statuses a partner may record
 *
 * `LAB_RECORDABLE_BOOKING_STATUSES` is `CONFIRMED`, `SAMPLE_COLLECTED`,
 * `PROCESSING` and `NO_SHOW`. `REPORT_READY` and `COMPLETED` are deliberately
 * absent: `REPORT_READY` is written by the report service when a report is
 * actually published, and `COMPLETED` by `completeDiagnosticBooking` only once
 * that report exists. A partner therefore cannot type a status that implies a
 * result exists.
 */

export type LabServiceError = { ok: false; code: DiagnosticErrorCode | "not_found" | "test_not_found" | "test_not_listable"; message: string };

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const LAB_COMPLIANCE_POLICY_VERSION = "orvexa.lab-partner.v1";

export const LAB_COMPLIANCE_STATEMENT =
  "I confirm this laboratory is registered under the Clinical Establishments (Registration and Regulation) Act and holds the " +
  "accreditation recorded here, that every report released through ORVEXA will be authenticated by a named pathologist with their " +
  "registration number, and that no result will be released before that authentication.";

/**
 * Creates or updates the laboratory profile owned by the signed-in account.
 *
 * The verification fields are untouched by design: a partner cannot verify
 * itself, and `canPublishReports` is never written here.
 */
export async function saveLabProfile(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName">;
  data: LabProfileInput;
}): Promise<{ ok: true; labProfileId: string; created: boolean } | LabServiceError> {
  const { data } = input;

  if (!data.complianceAcknowledged && !data.legalName) {
    return { ok: false, code: "not_found", message: "Name the laboratory's legal entity before saving." };
  }

  const existing = await prisma.labPartnerProfile.findUnique({
    where: { ownerUserId: input.user.id },
    select: { id: true, complianceAcknowledgedAt: true },
  });

  const acknowledgement = data.complianceAcknowledged
    ? { complianceAcknowledgedAt: existing?.complianceAcknowledgedAt ?? new Date(), compliancePolicyVersion: data.compliancePolicyVersion ?? LAB_COMPLIANCE_POLICY_VERSION }
    : {};

  const shared = {
    legalName: data.legalName,
    tradeName: data.tradeName ?? null,
    accreditationNumber: data.accreditationNumber ?? null,
    accreditationBody: data.accreditationBody ?? null,
    registrationNumber: data.registrationNumber ?? null,
    gstin: data.gstin ?? null,
    pathologistName: data.pathologistName ?? null,
    pathologistRegistrationNumber: data.pathologistRegistrationNumber ?? null,
    pathologistCouncil: data.pathologistCouncil ?? null,
    acceptsHomeCollection: data.acceptsHomeCollection,
    homeCollectionRadiusKm: data.homeCollectionRadiusKm ?? null,
    coverageCities: data.coverageCities,
    coveragePostalCodes: data.coveragePostalCodes,
    sampleCollectionFeeInr:
      data.sampleCollectionFeePaise === undefined ? null : paiseToRupees(data.sampleCollectionFeePaise),
    standardTurnaroundHours: data.standardTurnaroundHours ?? null,
    ...acknowledgement,
  } satisfies Prisma.LabPartnerProfileUncheckedUpdateInput;

  const saved = await prisma.labPartnerProfile.upsert({
    where: { ownerUserId: input.user.id },
    create: { ownerUserId: input.user.id, ...shared },
    update: shared,
    select: { id: true },
  });

  await recordAuditEvent({
    action: existing ? "lab.partner_updated" : "lab.partner_registered",
    entityType: "lab_partner_profile",
    entityId: saved.id,
    actorUserId: input.user.id,
    actorLabel: input.user.fullName,
    metadata: { legalName: data.legalName, acceptsHomeCollection: data.acceptsHomeCollection },
  });

  return { ok: true, labProfileId: saved.id, created: !existing };
}

/**
 * Submits a completed profile for review.
 *
 * The application moves to `SUBMITTED`/`PENDING` and stops there: approval is a
 * reviewer's act. A profile missing its registration or pathologist cannot be
 * submitted, because a laboratory that cannot name a pathologist cannot
 * authenticate a report.
 */
export async function submitLabProfileForReview(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName">;
}): Promise<{ ok: true; labProfileId: string; status: string } | LabServiceError> {
  const lab = await prisma.labPartnerProfile.findUnique({
    where: { ownerUserId: input.user.id },
    select: {
      id: true,
      legalName: true,
      registrationNumber: true,
      pathologistName: true,
      pathologistRegistrationNumber: true,
      accreditationNumber: true,
      complianceAcknowledgedAt: true,
      verificationStatus: true,
      status: true,
    },
  });
  if (!lab) return { ok: false, code: "not_found", message: "Save the laboratory profile before submitting it." };

  if (!lab.complianceAcknowledgedAt) {
    return { ok: false, code: "not_found", message: "Acknowledge the diagnostic-regulation statement before submitting." };
  }
  if (!lab.registrationNumber || !lab.pathologistName || !lab.pathologistRegistrationNumber || !lab.accreditationNumber) {
    return {
      ok: false,
      code: "not_found",
      message:
        "A submission needs the registration number, the accreditation number, and the pathologist's name and registration number.",
    };
  }
  if (lab.verificationStatus === "VERIFIED" && lab.status === "APPROVED") {
    return { ok: false, code: "not_found", message: "This laboratory is already verified and approved." };
  }

  await prisma.labPartnerProfile.update({
    where: { id: lab.id },
    data: { status: "SUBMITTED", verificationStatus: "PENDING" },
  });

  await recordAuditEvent({
    action: "lab.partner_updated",
    entityType: "lab_partner_profile",
    entityId: lab.id,
    actorUserId: input.user.id,
    actorLabel: input.user.fullName,
    metadata: { submitted: true, legalName: lab.legalName },
  });

  return { ok: true, labProfileId: lab.id, status: "SUBMITTED" };
}

// ---------------------------------------------------------------------------
// Profile reads
// ---------------------------------------------------------------------------

/**
 * The laboratory profile as its owner sees it.
 *
 * This is the read the partner's own settings page renders, so it includes the
 * editable fields — and the two the partner cannot edit, `verificationStatus`
 * and `canPublishReports`, so the page can state plainly where the application
 * stands rather than implying a verification it does not have.
 */
export async function getLabProfileDetail(userId: string) {
  return prisma.labPartnerProfile.findUnique({
    where: { ownerUserId: userId },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      accreditationNumber: true,
      accreditationBody: true,
      registrationNumber: true,
      gstin: true,
      pathologistName: true,
      pathologistRegistrationNumber: true,
      pathologistCouncil: true,
      acceptsHomeCollection: true,
      homeCollectionRadiusKm: true,
      coverageCities: true,
      coveragePostalCodes: true,
      sampleCollectionFeeInr: true,
      standardTurnaroundHours: true,
      complianceAcknowledgedAt: true,
      compliancePolicyVersion: true,
      status: true,
      verificationStatus: true,
      canPublishReports: true,
      verificationNotes: true,
      verifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export type LabOfferRow = {
  offerId: string;
  testId: string;
  testName: string;
  testSlug: string;
  categorySlug: string;
  priceInr: number;
  homeCollectionFeeInr: number | null;
  turnaroundHours: number | null;
  homeCollectionAvailable: boolean;
  isActive: boolean;
  notes: string | null;
  updatedAt: Date;
};

export async function listLabOffers(labProfileId: string): Promise<LabOfferRow[]> {
  const rows = await prisma.diagnosticTestOffer.findMany({
    where: { labProfileId },
    select: {
      id: true,
      testId: true,
      priceInr: true,
      homeCollectionFeeInr: true,
      turnaroundHours: true,
      homeCollectionAvailable: true,
      isActive: true,
      notes: true,
      updatedAt: true,
      test: { select: { name: true, slug: true, categorySlug: true } },
    },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    take: 300,
  });

  return rows.map((row) => ({
    offerId: row.id,
    testId: row.testId,
    testName: row.test.name,
    testSlug: row.test.slug,
    categorySlug: row.test.categorySlug,
    priceInr: row.priceInr,
    homeCollectionFeeInr: row.homeCollectionFeeInr,
    turnaroundHours: row.turnaroundHours,
    homeCollectionAvailable: row.homeCollectionAvailable,
    isActive: row.isActive,
    notes: row.notes,
    updatedAt: row.updatedAt,
  }));
}

/**
 * The catalogue a partner can price, each row carrying the partner's own offer
 * when one exists. A non-listable test is never offered here.
 */
export async function listPriceableTests(input: {
  labProfileId: string;
  query?: string;
  limit?: number;
}): Promise<
  {
    testId: string;
    name: string;
    slug: string;
    categorySlug: string;
    homeCollectionSupported: boolean;
    offer: { offerId: string; priceInr: number; isActive: boolean } | null;
  }[]
> {
  const needle = input.query?.trim();
  const rows = await prisma.diagnosticTest.findMany({
    where: {
      listable: true,
      deletedAt: null,
      ...(needle
        ? { OR: [{ name: { contains: needle, mode: "insensitive" } }, { slug: { contains: needle, mode: "insensitive" } }] }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      categorySlug: true,
      homeCollectionSupported: true,
      offers: {
        where: { labProfileId: input.labProfileId },
        select: { id: true, priceInr: true, isActive: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
    take: Math.max(1, Math.min(input.limit ?? 200, 500)),
  });

  return rows.map((row) => ({
    testId: row.id,
    name: row.name,
    slug: row.slug,
    categorySlug: row.categorySlug,
    homeCollectionSupported: row.homeCollectionSupported,
    offer: row.offers[0]
      ? { offerId: row.offers[0].id, priceInr: row.offers[0].priceInr, isActive: row.offers[0].isActive }
      : null,
  }));
}

/**
 * Creates or updates this laboratory's price for one catalogue test.
 *
 * The price is the partner's own published figure, converted once from paise to
 * whole rupees at the boundary. The test itself is never modified.
 */
export async function saveLabOffer(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName">;
  labProfileId: string;
  data: LabOfferInput;
}): Promise<{ ok: true; offerId: string } | LabServiceError> {
  const test = await prisma.diagnosticTest.findFirst({
    where: { id: input.data.testId, deletedAt: null },
    select: { id: true, name: true, listable: true },
  });
  if (!test) return { ok: false, code: "test_not_found", message: "That test is not in the ORVEXA catalogue." };
  if (!test.listable) {
    return { ok: false, code: "test_not_listable", message: "That test is not available to list through ORVEXA." };
  }

  const shared = {
    priceInr: paiseToRupees(input.data.pricePaise),
    homeCollectionFeeInr:
      input.data.homeCollectionFeePaise === undefined ? null : paiseToRupees(input.data.homeCollectionFeePaise),
    turnaroundHours: input.data.turnaroundHours ?? null,
    homeCollectionAvailable: input.data.homeCollectionAvailable,
    isActive: input.data.isActive,
    notes: input.data.notes ?? null,
  } satisfies Prisma.DiagnosticTestOfferUncheckedUpdateInput;

  const offer = await prisma.diagnosticTestOffer.upsert({
    where: { labProfileId_testId: { labProfileId: input.labProfileId, testId: test.id } },
    create: { labProfileId: input.labProfileId, testId: test.id, ...shared },
    update: shared,
    select: { id: true },
  });

  await recordAuditEvent({
    action: "lab.offer_updated",
    entityType: "diagnostic_test_offer",
    entityId: offer.id,
    actorUserId: input.user.id,
    actorLabel: input.user.fullName,
    metadata: { testName: test.name, priceInr: shared.priceInr, isActive: shared.isActive },
  });

  return { ok: true, offerId: offer.id };
}

// ---------------------------------------------------------------------------
// Booking management (the partner's version of the status machine)
// ---------------------------------------------------------------------------

const RECORDABLE: readonly DiagnosticBookingStatus[] = LAB_RECORDABLE_BOOKING_STATUSES;

/**
 * Records a collection-side status. The booking must belong to this laboratory.
 */
export async function recordLabBookingStatus(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName">;
  labProfileId: string;
  bookingId: string;
  status: DiagnosticBookingStatus;
  note?: string | null;
}): Promise<{ ok: true; bookingId: string; reference: string; status: DiagnosticBookingStatus } | LabServiceError> {
  if (!RECORDABLE.includes(input.status)) {
    return {
      ok: false,
      code: "invalid_transition",
      message: "That status is written by the report workflow, not by the laboratory console.",
    };
  }

  const booking = await prisma.diagnosticBooking.findFirst({
    where: { id: input.bookingId, labProfileId: input.labProfileId },
    select: { id: true },
  });
  if (!booking) return { ok: false, code: "not_found", message: "That booking was not found for your laboratory." };

  const result = await transitionDiagnosticBooking({
    bookingId: booking.id,
    next: input.status,
    actor: { userId: input.user.id, role: "LAB_PARTNER", label: input.user.fullName },
    note: input.note ?? null,
  });
  if (!result.ok) return result;

  return { ok: true, bookingId: result.bookingId, reference: result.reference, status: result.status };
}

/**
 * Closes a booking once its report has been released.
 *
 * Reachable only from `REPORT_READY`, which is itself only ever written by a
 * successful publish, so a booking cannot be completed without an
 * authenticated report behind it.
 */
export async function completeDiagnosticBooking(input: {
  user: Pick<AuthenticatedUser, "id" | "fullName">;
  labProfileId: string;
  bookingId: string;
}): Promise<{ ok: true; bookingId: string; reference: string; status: DiagnosticBookingStatus } | LabServiceError> {
  const booking = await prisma.diagnosticBooking.findFirst({
    where: { id: input.bookingId, labProfileId: input.labProfileId },
    select: { id: true, status: true, reports: { where: { status: "PUBLISHED", deletedAt: null }, select: { id: true }, take: 1 } },
  });
  if (!booking) return { ok: false, code: "not_found", message: "That booking was not found for your laboratory." };
  if (booking.status !== "REPORT_READY" || booking.reports.length === 0) {
    return {
      ok: false,
      code: "invalid_transition",
      message: "A booking can only be completed once its report has been published.",
    };
  }

  const result = await transitionDiagnosticBooking({
    bookingId: booking.id,
    next: "COMPLETED",
    actor: { userId: input.user.id, role: "LAB_PARTNER", label: input.user.fullName },
    note: "Report released and booking closed.",
  });
  if (!result.ok) return result;

  return { ok: true, bookingId: result.bookingId, reference: result.reference, status: result.status };
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

/**
 * A platform reviewer's verification decision.
 *
 * This is the only path that writes `canPublishReports`, and a reviewer may only
 * grant it alongside `VERIFIED`. A rejected or suspended laboratory loses it.
 */
export async function setLabVerification(input: {
  actorUserId: string;
  actorLabel?: string | null;
  data: LabVerificationInput;
}): Promise<{ ok: true; labProfileId: string } | LabServiceError> {
  const lab = await prisma.labPartnerProfile.findUnique({
    where: { id: input.data.labProfileId },
    select: { id: true, legalName: true, ownerUserId: true },
  });
  if (!lab) return { ok: false, code: "not_found", message: "That laboratory profile was not found." };

  const verified = input.data.verificationStatus === "VERIFIED";
  const status =
    input.data.verificationStatus === "VERIFIED"
      ? "APPROVED"
      : input.data.verificationStatus === "REJECTED"
        ? "REJECTED"
        : input.data.verificationStatus === "SUSPENDED"
          ? "APPROVED"
          : "UNDER_REVIEW";

  await prisma.labPartnerProfile.update({
    where: { id: lab.id },
    data: {
      verificationStatus: input.data.verificationStatus,
      status,
      verificationNotes: input.data.verificationNotes ?? null,
      // The report desk can only be released together with a VERIFIED state.
      canPublishReports: verified ? input.data.canPublishReports : false,
      verifiedAt: verified ? new Date() : null,
      verifiedById: verified ? input.actorUserId : null,
    },
  });

  await recordAuditEvent({
    action: "lab.partner_updated",
    entityType: "lab_partner_profile",
    entityId: lab.id,
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel ?? null,
    metadata: {
      verificationStatus: input.data.verificationStatus,
      canPublishReports: verified ? input.data.canPublishReports : false,
    },
  });

  return { ok: true, labProfileId: lab.id };
}

export async function listLabsForReview(input: {
  verificationStatus?: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
}) {
  return prisma.labPartnerProfile.findMany({
    where: input.verificationStatus ? { verificationStatus: input.verificationStatus } : {},
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      accreditationNumber: true,
      registrationNumber: true,
      pathologistName: true,
      pathologistRegistrationNumber: true,
      verificationStatus: true,
      status: true,
      canPublishReports: true,
      acceptsHomeCollection: true,
      coverageCities: true,
      verificationNotes: true,
      createdAt: true,
      _count: { select: { offers: true, bookings: true, reports: true } },
    },
    orderBy: [{ verificationStatus: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
}

// ---------------------------------------------------------------------------
// Catalogue administration
// ---------------------------------------------------------------------------

export async function saveDiagnosticCategory(input: {
  actorUserId: string;
  actorLabel?: string | null;
  data: DiagnosticCategoryInput;
}): Promise<{ ok: true; categoryId: string; created: boolean }> {
  const existing = input.data.id
    ? await prisma.diagnosticCategory.findUnique({ where: { id: input.data.id }, select: { id: true } })
    : await prisma.diagnosticCategory.findUnique({ where: { slug: input.data.slug }, select: { id: true } });

  const row = existing
    ? await prisma.diagnosticCategory.update({
        where: { id: existing.id },
        data: {
          slug: input.data.slug,
          name: input.data.name,
          description: input.data.description ?? null,
          iconKey: input.data.iconKey ?? null,
          sortOrder: input.data.sortOrder,
          isActive: input.data.isActive,
        },
        select: { id: true },
      })
    : await prisma.diagnosticCategory.create({
        data: {
          slug: input.data.slug,
          name: input.data.name,
          description: input.data.description ?? null,
          iconKey: input.data.iconKey ?? null,
          sortOrder: input.data.sortOrder,
          isActive: input.data.isActive,
        },
        select: { id: true },
      });

  await recordAuditEvent({
    action: existing ? "diagnostics.category_updated" : "diagnostics.category_recorded",
    entityType: "diagnostic_category",
    entityId: row.id,
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel ?? null,
    metadata: { slug: input.data.slug },
  });

  return { ok: true, categoryId: row.id, created: !existing };
}

/**
 * Records a catalogue test.
 *
 * A test the platform may not list is stored with `listable: false` and a reason,
 * and is then invisible to every discovery and booking query.
 */
export async function saveDiagnosticTest(input: {
  actorUserId: string;
  actorLabel?: string | null;
  data: DiagnosticTestInput;
}): Promise<{ ok: true; testId: string; created: boolean } | LabServiceError> {
  const category = await prisma.diagnosticCategory.findUnique({
    where: { slug: input.data.categorySlug },
    select: { id: true, slug: true },
  });
  if (!category) {
    return { ok: false, code: "test_not_found", message: "That catalogue category does not exist. Create it first." };
  }

  const existing = input.data.id
    ? await prisma.diagnosticTest.findUnique({ where: { id: input.data.id }, select: { id: true } })
    : await prisma.diagnosticTest.findUnique({ where: { slug: input.data.slug }, select: { id: true } });

  const shared = {
    slug: input.data.slug,
    name: input.data.name,
    shortName: input.data.shortName ?? null,
    categoryId: category.id,
    categorySlug: category.slug,
    description: input.data.description ?? null,
    purposeSummary: input.data.purposeSummary ?? null,
    preparationInstructions: input.data.preparationInstructions ?? null,
    preparationRequired: input.data.preparationRequired,
    fastingRequired: input.data.fastingRequired,
    fastingHours: input.data.fastingHours ?? null,
    sampleTypes: input.data.sampleTypes,
    method: input.data.method ?? null,
    standardTurnaroundHours: input.data.standardTurnaroundHours ?? null,
    homeCollectionSupported: input.data.homeCollectionSupported,
    pediatricSafe: input.data.pediatricSafe ?? null,
    riskNotes: input.data.riskNotes ?? null,
    isPanel: input.data.isPanel,
    panelComponents: input.data.panelComponents,
    listable: input.data.listable,
    nonListableReason: input.data.listable ? null : (input.data.nonListableReason ?? null),
  } satisfies Prisma.DiagnosticTestUncheckedUpdateInput;

  const row = existing
    ? await prisma.diagnosticTest.update({ where: { id: existing.id }, data: shared, select: { id: true } })
    : await prisma.diagnosticTest.create({ data: shared, select: { id: true } });

  await recordAuditEvent({
    action: existing ? "diagnostics.test_updated" : "diagnostics.test_recorded",
    entityType: "diagnostic_test",
    entityId: row.id,
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel ?? null,
    metadata: { slug: input.data.slug, listable: input.data.listable },
  });

  return { ok: true, testId: row.id, created: !existing };
}

export async function setCatalogueTestVerification(input: {
  actorUserId: string;
  actorLabel?: string | null;
  testId: string;
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
}): Promise<{ ok: true; testId: string } | LabServiceError> {
  const test = await prisma.diagnosticTest.findUnique({ where: { id: input.testId }, select: { id: true } });
  if (!test) return { ok: false, code: "test_not_found", message: "That test was not found." };

  await prisma.diagnosticTest.update({
    where: { id: test.id },
    data: {
      verificationStatus: input.verificationStatus,
      verifiedAt: input.verificationStatus === "VERIFIED" ? new Date() : null,
      dataProvenance: input.verificationStatus === "VERIFIED" ? "PLATFORM_VERIFIED" : "PROVIDER_SUBMITTED",
    },
  });

  await recordAuditEvent({
    action: "diagnostics.test_updated",
    entityType: "diagnostic_test",
    entityId: test.id,
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel ?? null,
    metadata: { verificationStatus: input.verificationStatus },
  });

  return { ok: true, testId: test.id };
}

/** The report statuses a laboratory console groups its queue by. */
export const LAB_QUEUE_REPORT_STATUSES: readonly LabReportStatus[] = ["DRAFT", "AMENDED", "PUBLISHED", "WITHDRAWN"];
