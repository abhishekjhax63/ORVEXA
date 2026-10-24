import "server-only";

import {
  Prisma,
  type CareServiceCategory,
  type CareServiceDeliveryMode,
  type CareServiceRequestStatus,
  type EducationResourceCategory,
  type MentalWellnessResourceKind,
  type SupportedLanguage,
  type VerificationState,
} from "@prisma/client";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { requireScope, resolveCareSubject } from "@/lib/care/access";
import { careFail, careOk, type CareResult } from "@/lib/care/errors";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import {
  careServiceListingCreateSchema,
  careServiceRequestStatusSchema,
  educationResourceCreateSchema,
  educationResourceUpdateSchema,
  mentalWellnessResourceCreateSchema,
  mentalWellnessResourceUpdateSchema,
  type CareServiceRequestCreateInput,
} from "@/lib/validation/care";

/**
 * The ORVEXA directory: the services a person can ask for, and the material the
 * platform publishes for them to read.
 *
 * ## What this module decides
 *
 * Four shapes share one file because they share one question — what is ORVEXA
 * entitled to *say*:
 *
 * - a **care service listing**: physiotherapy, home nursing, a home sample
 *   collection, and the rest;
 * - a **care service request**: that person's ask, which only ever moves when
 *   the provider moves it;
 * - **mental wellness material**, including crisis helplines; and
 * - **health education**, the patient-facing library.
 *
 * ## The safety rules this file exists to hold
 *
 * ORVEXA is a conduit here. It is not the clinician who delivers the service and
 * it is not the translator who rendered the article, and the code is shaped so
 * that neither claim can be made by accident:
 *
 * - **A listing is not a vetted provider.** `verificationStatus` starts at
 *   `UNVERIFIED` and is only ever set by the service, never accepted from a
 *   request, and every row carries that status and its `isDemo` flag to the
 *   screen so an unverified listing can say so. Verification is a separate
 *   workflow the platform has not implemented, and no listing pretends
 *   otherwise.
 * - **A request only moves when the provider moves it.** Nothing on a timer
 *   completes a request, because "your physiotherapist has finished" is not a
 *   statement a scheduler is entitled to make.
 * - **A crisis resource is never hidden.** Not behind a language filter, not
 *   behind a paywall, not behind a sign-in — which is why the mental wellness
 *   reads take no user at all.
 * - **Education is only listed in a language in which a reviewed resource
 *   exists.** When a person asks for a language the library does not hold, they
 *   are handed the English rows and told, rather than shown an empty page or a
 *   machine translation dressed up as reviewed clinical text.
 */

type CareServiceListingCreateInput = z.infer<typeof careServiceListingCreateSchema>;
type CareServiceRequestStatusInput = z.infer<typeof careServiceRequestStatusSchema>;
type MentalWellnessResourceCreateInput = z.infer<typeof mentalWellnessResourceCreateSchema>;
type MentalWellnessResourceUpdateInput = z.infer<typeof mentalWellnessResourceUpdateSchema>;
type EducationResourceCreateInput = z.infer<typeof educationResourceCreateSchema>;
type EducationResourceUpdateInput = z.infer<typeof educationResourceUpdateSchema>;

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

const LISTING_SELECT = {
  id: true,
  category: true,
  title: true,
  summary: true,
  deliveryMode: true,
  priceFromPaise: true,
  city: true,
  serviceAreas: true,
  providerLabel: true,
  languagesOffered: true,
  verificationStatus: true,
  isDemo: true,
  isActive: true,
} as const;

export type CareServiceListingSummary = {
  id: string;
  category: CareServiceCategory;
  title: string;
  summary: string | null;
  deliveryMode: CareServiceDeliveryMode;
  priceFromPaise: number | null;
  city: string | null;
  serviceAreas: string[];
  providerLabel: string;
  languagesOffered: SupportedLanguage[];
  /** Carried on every row so a screen can say "unverified" beside the result. */
  verificationStatus: VerificationState;
  isDemo: boolean;
  isActive: boolean;
};

export type CareServiceListingDetail = CareServiceListingSummary & { description: string | null };

/**
 * Searches the directory.
 *
 * Only `isActive` listings come back: one that a partner has switched off is no
 * longer something it offers, so discovery must not keep offering it. Every row
 * carries its `verificationStatus` and `isDemo` flag on purpose — the screen has
 * to be able to say "this is a listing, not a provider ORVEXA has vetted" beside
 * each result rather than only in a footnote.
 */
export async function searchCareServices(input: {
  category?: CareServiceCategory;
  deliveryMode?: CareServiceDeliveryMode;
  city?: string;
  language?: SupportedLanguage;
  query?: string;
  limit?: number;
}): Promise<CareServiceListingSummary[]> {
  const where: Prisma.CareServiceListingWhereInput = { isActive: true };
  if (input.category) where.category = input.category;
  if (input.deliveryMode) where.deliveryMode = input.deliveryMode;
  if (input.city) where.city = { contains: input.city, mode: "insensitive" };
  if (input.language) where.languagesOffered = { has: input.language };
  if (input.query) {
    where.OR = [
      { title: { contains: input.query, mode: "insensitive" } },
      { summary: { contains: input.query, mode: "insensitive" } },
      { providerLabel: { contains: input.query, mode: "insensitive" } },
    ];
  }

  return prisma.careServiceListing.findMany({
    where,
    orderBy: [{ category: "asc" }, { title: "asc" }],
    take: input.limit ?? 30,
    select: LISTING_SELECT,
  });
}

/**
 * One listing, returned even when it has been switched off.
 *
 * Discovery excludes inactive listings, but somebody opening a link from a
 * request or a history must still be shown the listing rather than a blank
 * screen — so the row comes back with a boolean saying whether it can actually
 * be requested right now.
 */
export async function getCareServiceListing(input: {
  listingId: string;
}): Promise<{ listing: CareServiceListingDetail; canRequest: boolean } | null> {
  const listing = await prisma.careServiceListing.findUnique({
    where: { id: input.listingId },
    select: { ...LISTING_SELECT, description: true },
  });
  if (!listing) return null;
  return { listing, canRequest: listing.isActive };
}

// ---------------------------------------------------------------------------
// Listing management
// ---------------------------------------------------------------------------

/**
 * Creates a listing.
 *
 * `verificationStatus` is set to `UNVERIFIED` here and is deliberately not a
 * field of the create schema, so a caller cannot post a listing that claims to
 * be vetted. A listing is not a vetted provider: it is a service somebody has
 * said they offer, and marking it verified is a separate workflow ORVEXA has
 * not implemented — until it exists, every listing says so.
 */
export async function createCareServiceListing(input: {
  user: AuthenticatedUser;
  data: CareServiceListingCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ listingId: string }>> {
  if (!input.user.permissions.includes("care.service_listing_manage")) {
    return careFail("not_found", "You do not have access to manage care service listings.");
  }

  const listing = await prisma.careServiceListing.create({
    data: {
      category: input.data.category,
      title: input.data.title,
      summary: input.data.summary ?? null,
      description: input.data.description ?? null,
      deliveryMode: input.data.deliveryMode,
      priceFromPaise: input.data.priceFromPaise ?? null,
      city: input.data.city ?? null,
      serviceAreas: input.data.serviceAreas,
      providerLabel: input.data.providerLabel,
      languagesOffered: input.data.languagesOffered,
      verificationStatus: "UNVERIFIED",
      isDemo: false,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "care.care_service_listing_created",
    entityType: "care_service_listing",
    entityId: listing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      category: input.data.category,
      deliveryMode: input.data.deliveryMode,
      providerLabel: input.data.providerLabel,
    },
  });

  return careOk({ listingId: listing.id });
}

/**
 * Edits a listing.
 *
 * `isActive` is not part of the accepted data: switching a listing on or off is
 * `setCareServiceListingActive`, a distinct act with its own audit trail, and a
 * general edit must not be able to do it quietly. Verification status is not
 * editable here either.
 */
export async function updateCareServiceListing(input: {
  user: AuthenticatedUser;
  listingId: string;
  data: Partial<CareServiceListingCreateInput>;
  context?: RequestContext;
}): Promise<CareResult<{ listingId: string }>> {
  if (!input.user.permissions.includes("care.service_listing_manage")) {
    return careFail("not_found", "You do not have access to manage care service listings.");
  }

  const existing = await prisma.careServiceListing.findUnique({
    where: { id: input.listingId },
    select: { id: true },
  });
  if (!existing) return careFail("listing_not_found", "That care service listing was not found.");

  await prisma.careServiceListing.update({
    where: { id: existing.id },
    data: {
      category: input.data.category,
      title: input.data.title,
      summary: input.data.summary,
      description: input.data.description,
      deliveryMode: input.data.deliveryMode,
      priceFromPaise: input.data.priceFromPaise,
      city: input.data.city,
      serviceAreas: input.data.serviceAreas,
      providerLabel: input.data.providerLabel,
      languagesOffered: input.data.languagesOffered,
    },
  });

  await recordAuditEvent({
    action: "care.care_service_listing_updated",
    entityType: "care_service_listing",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      fields: Object.keys(input.data).filter((key) => input.data[key as keyof typeof input.data] !== undefined),
    },
  });

  return careOk({ listingId: existing.id });
}

/** Takes a listing out of discovery, or puts it back. */
export async function setCareServiceListingActive(input: {
  user: AuthenticatedUser;
  listingId: string;
  isActive: boolean;
  context?: RequestContext;
}): Promise<CareResult<{ listingId: string; isActive: boolean }>> {
  if (!input.user.permissions.includes("care.service_listing_manage")) {
    return careFail("not_found", "You do not have access to manage care service listings.");
  }

  const existing = await prisma.careServiceListing.findUnique({
    where: { id: input.listingId },
    select: { id: true },
  });
  if (!existing) return careFail("listing_not_found", "That care service listing was not found.");

  await prisma.careServiceListing.update({
    where: { id: existing.id },
    data: { isActive: input.isActive },
  });

  // There is no dedicated action for this change, so the update event is used
  // with the flag recorded in the metadata.
  await recordAuditEvent({
    action: "care.care_service_listing_updated",
    entityType: "care_service_listing",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { isActive: input.isActive },
  });

  return careOk({ listingId: existing.id, isActive: input.isActive });
}

// ---------------------------------------------------------------------------
// Requesting a service
// ---------------------------------------------------------------------------

const REQUEST_SELECT = {
  id: true,
  requesterUserId: true,
  familyMemberId: true,
  listingId: true,
  status: true,
  preferredAt: true,
  addressLine: true,
  city: true,
  postalCode: true,
  contactPhone: true,
  notes: true,
  providerResponse: true,
  scheduledFor: true,
  createdAt: true,
} as const;

export type CareServiceRequestSummary = {
  id: string;
  requesterUserId: string;
  familyMemberId: string | null;
  listingId: string;
  status: CareServiceRequestStatus;
  preferredAt: Date | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  contactPhone: string | null;
  notes: string | null;
  providerResponse: string | null;
  scheduledFor: Date | null;
  createdAt: Date;
};

export type StaffCareServiceRequestSummary = CareServiceRequestSummary & {
  requester: { id: string; fullName: string; email: string; phone: string | null } | null;
};

/** Request statuses that have ended; a request in one of them cannot move again. */
const TERMINAL_REQUEST_STATUSES: readonly CareServiceRequestStatus[] = ["COMPLETED", "CANCELLED", "DECLINED"];

/**
 * Raises a request for a listing, on behalf of the record the caller is acting
 * on.
 *
 * Booking a home visit is the same kind of act as booking an appointment, so it
 * requires the same `BOOK_APPOINTMENTS` scope: a caregiver who may arrange a
 * physiotherapy visit for a relative may do this, and one who may not cannot
 * reach it by another door.
 *
 * ## A retried submit succeeds, it does not fail
 *
 * `idempotencyKey` is unique per record owner. A form resubmitted because the
 * first response was lost, or a double tap, lands on the unique constraint — and
 * the correct answer there is the *existing* request, returned as a success. A
 * client told "duplicate" would show an error for an action that in fact
 * succeeded; a client handed the original request id can simply open it.
 *
 * `CareServiceRequest` carries no `reference`, so none is allocated: unlike a
 * support ticket, nobody reads a care request out loud on the phone.
 */
export async function requestCareService(input: {
  user: AuthenticatedUser;
  data: CareServiceRequestCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ requestId: string; reused: boolean }>> {
  const subject = await resolveCareSubject({
    viewerUserId: input.user.id,
    ownerUserId: input.data.ownerUserId ?? null,
    familyMemberId: input.data.familyMemberId ?? null,
  });
  if (!subject.ok) return subject;

  const scoped = requireScope(subject.data, "BOOK_APPOINTMENTS");
  if (!scoped.ok) return scoped;

  const listing = await prisma.careServiceListing.findUnique({
    where: { id: input.data.listingId },
    select: { id: true, category: true, isActive: true },
  });
  if (!listing) return careFail("listing_not_found", "That care service listing does not exist.");
  if (!listing.isActive) {
    return careFail("listing_not_available", "That care service is not currently available to request.");
  }

  try {
    const request = await prisma.careServiceRequest.create({
      data: {
        // Recorded against the person whose record it is, not the account that
        // typed it: a caregiver booking for a relative raises the relative's
        // request, which is the one that must appear on the relative's list.
        requesterUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        listingId: listing.id,
        status: "REQUESTED",
        preferredAt: input.data.preferredAt ?? null,
        addressLine: input.data.addressLine ?? null,
        city: input.data.city ?? null,
        postalCode: input.data.postalCode ?? null,
        contactPhone: input.data.contactPhone ?? null,
        notes: input.data.notes ?? null,
        idempotencyKey: input.data.idempotencyKey,
        isDemo: false,
      },
      select: { id: true },
    });

    await recordAuditEvent({
      action: "care.care_service_requested",
      entityType: "care_service_request",
      entityId: request.id,
      actorUserId: input.user.id,
      context: input.context,
      metadata: {
        listingId: listing.id,
        category: listing.category,
        ownerUserId: subject.data.ownerUserId,
        familyMemberId: subject.data.familyMemberId,
        actingAs: subject.data.kind,
      },
    });

    return careOk({ requestId: request.id, reused: false });
  } catch (error) {
    // A retried submit trips the (requesterUserId, idempotencyKey) unique
    // constraint. That is not a failure — the request already exists — so the
    // original is returned as a successful result.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.careServiceRequest.findUnique({
        where: {
          requesterUserId_idempotencyKey: {
            requesterUserId: subject.data.ownerUserId,
            idempotencyKey: input.data.idempotencyKey,
          },
        },
        select: { id: true },
      });
      if (existing) return careOk({ requestId: existing.id, reused: true });
    }
    throw error;
  }
}

/** The caller's own requests, newest first. */
export async function listMyCareServiceRequests(input: {
  user: AuthenticatedUser;
}): Promise<CareServiceRequestSummary[]> {
  return prisma.careServiceRequest.findMany({
    where: { requesterUserId: input.user.id },
    orderBy: { createdAt: "desc" },
    select: REQUEST_SELECT,
  });
}

/**
 * The staff queue.
 *
 * Unlike the person's own list, this one carries the requester's contact
 * details — a home-visit request is useless to whoever is arranging it without
 * a phone number — which is exactly why it is gated on the manage permission.
 */
export async function listCareServiceRequestsForStaff(input: {
  user: AuthenticatedUser;
  status?: CareServiceRequestStatus;
  listingId?: string;
}): Promise<CareResult<StaffCareServiceRequestSummary[]>> {
  if (!input.user.permissions.includes("care.service_request_manage")) {
    return careFail("not_found", "You do not have access to the care service request queue.");
  }

  const rows = await prisma.careServiceRequest.findMany({
    where: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.listingId ? { listingId: input.listingId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      ...REQUEST_SELECT,
      requester: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  });

  return careOk(rows);
}

/**
 * Advances a request along its lifecycle.
 *
 * A request that has already ended — completed, cancelled or declined — cannot
 * be moved again, and no status here implies a completion on its own: the
 * caller sets `COMPLETED` when the provider has actually said so. That is the
 * whole point of the seven-value lifecycle, so a request is never quietly closed
 * by anything but a human.
 */
export async function updateCareServiceRequestStatus(input: {
  user: AuthenticatedUser;
  requestId: string;
  data: CareServiceRequestStatusInput;
  context?: RequestContext;
}): Promise<CareResult<{ requestId: string; status: CareServiceRequestStatus }>> {
  if (!input.user.permissions.includes("care.service_request_manage")) {
    return careFail("not_found", "You do not have access to manage care service requests.");
  }

  const request = await prisma.careServiceRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, status: true },
  });
  if (!request) return careFail("request_not_found", "That care service request was not found.");
  if (TERMINAL_REQUEST_STATUSES.includes(request.status)) {
    return careFail("validation", "This request has already ended and its status cannot change again.");
  }

  await prisma.careServiceRequest.update({
    where: { id: request.id },
    data: {
      status: input.data.status,
      providerResponse: input.data.providerResponse,
      scheduledFor: input.data.scheduledFor,
    },
  });

  await recordAuditEvent({
    action: "care.care_service_request_status_changed",
    entityType: "care_service_request",
    entityId: request.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { from: request.status, to: input.data.status },
  });

  return careOk({ requestId: request.id, status: input.data.status });
}

/**
 * The requester cancelling their own request.
 *
 * Only allowed while the request is still `REQUESTED` or `ACKNOWLEDGED`: once a
 * provider has scheduled or begun the work, cancelling is a conversation, not a
 * button. The model has no column for a cancellation reason, so the reason the
 * person gave is recorded in the audit trail rather than in a field that would
 * imply the provider wrote it.
 */
export async function cancelOwnCareServiceRequest(input: {
  user: AuthenticatedUser;
  requestId: string;
  reason?: string | null;
  context?: RequestContext;
}): Promise<CareResult<{ requestId: string }>> {
  const request = await prisma.careServiceRequest.findFirst({
    where: { id: input.requestId, requesterUserId: input.user.id },
    select: { id: true, status: true },
  });
  if (!request) return careFail("request_not_found", "That care service request was not found on your record.");
  if (request.status !== "REQUESTED" && request.status !== "ACKNOWLEDGED") {
    return careFail("validation", "This request can no longer be cancelled — the provider has already progressed it.");
  }

  await prisma.careServiceRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED" },
  });

  await recordAuditEvent({
    action: "care.care_service_request_status_changed",
    entityType: "care_service_request",
    entityId: request.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: { from: request.status, to: "CANCELLED", cancelledBy: "requester", reason: input.reason ?? null },
  });

  return careOk({ requestId: request.id });
}

// ---------------------------------------------------------------------------
// Mental wellness
// ---------------------------------------------------------------------------

const WELLNESS_SELECT = {
  id: true,
  kind: true,
  title: true,
  summary: true,
  bodyMarkdown: true,
  language: true,
  helplineNumber: true,
  helplineHours: true,
  externalUrl: true,
  isCrisisResource: true,
  reviewedByLabel: true,
  publishedAt: true,
  isActive: true,
} as const;

export type MentalWellnessResourceSummary = {
  id: string;
  kind: MentalWellnessResourceKind;
  title: string;
  summary: string;
  bodyMarkdown: string | null;
  language: SupportedLanguage;
  helplineNumber: string | null;
  helplineHours: string | null;
  externalUrl: string | null;
  isCrisisResource: boolean;
  reviewedByLabel: string | null;
  publishedAt: Date | null;
  isActive: boolean;
};

/**
 * Mental wellness material, in the language asked for.
 *
 * These reads take no user, because this material — and the crisis resources in
 * particular — must be reachable by a signed-out visitor. A crisis resource is
 * never hidden behind a language filter, a paywall or a sign-in: the helplines
 * are fetched with no language and no kind filter at all, and only the ordinary
 * material falls back to English when the requested language holds none.
 */
export async function listMentalWellnessResources(input: {
  language?: SupportedLanguage;
  kind?: MentalWellnessResourceKind;
}): Promise<MentalWellnessResourceSummary[]> {
  const language = input.language ?? "ENGLISH";

  // No language or kind filter on this query, by design. Somebody in a crisis
  // must reach the helplines even if the only content ORVEXA holds is filed
  // under another language or another kind.
  const crisis = await prisma.mentalWellnessResource.findMany({
    where: { isActive: true, isCrisisResource: true },
    orderBy: { title: "asc" },
    select: WELLNESS_SELECT,
  });

  const ordinaryWhere: Prisma.MentalWellnessResourceWhereInput = {
    isActive: true,
    isCrisisResource: false,
    language,
  };
  if (input.kind) ordinaryWhere.kind = input.kind;

  let ordinary = await prisma.mentalWellnessResource.findMany({
    where: ordinaryWhere,
    orderBy: { title: "asc" },
    select: WELLNESS_SELECT,
  });

  // The fallback applies to the ordinary material only. The crisis resources
  // above are never subject to it.
  if (ordinary.length === 0 && language !== "ENGLISH") {
    ordinary = await prisma.mentalWellnessResource.findMany({
      where: {
        isActive: true,
        isCrisisResource: false,
        language: "ENGLISH",
        ...(input.kind ? { kind: input.kind } : {}),
      },
      orderBy: { title: "asc" },
      select: WELLNESS_SELECT,
    });
  }

  return [...crisis, ...ordinary];
}

/**
 * Every live crisis resource.
 *
 * `isCrisisResource: true` and `isActive: true` and nothing else. There is no
 * language filter and never will be: the number a person needs to reach is not
 * conditional on the language they read.
 */
export async function listCrisisResources(): Promise<MentalWellnessResourceSummary[]> {
  return prisma.mentalWellnessResource.findMany({
    where: { isCrisisResource: true, isActive: true },
    orderBy: { title: "asc" },
    select: WELLNESS_SELECT,
  });
}

export async function createMentalWellnessResource(input: {
  user: AuthenticatedUser;
  data: MentalWellnessResourceCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ resourceId: string }>> {
  if (!input.user.permissions.includes("care.content_manage")) {
    return careFail("not_found", "You do not have access to manage mental wellness content.");
  }

  const resource = await prisma.mentalWellnessResource.create({
    data: {
      kind: input.data.kind,
      title: input.data.title,
      summary: input.data.summary,
      bodyMarkdown: input.data.bodyMarkdown ?? null,
      language: input.data.language,
      helplineNumber: input.data.helplineNumber ?? null,
      helplineHours: input.data.helplineHours ?? null,
      externalUrl: input.data.externalUrl ?? null,
      isCrisisResource: input.data.isCrisisResource,
      reviewedByLabel: input.data.reviewedByLabel ?? null,
      // A created resource is publishable and active by default, so its
      // publication time is stamped here rather than left as a contradiction.
      publishedAt: new Date(),
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "care.mental_wellness_resource_created",
    entityType: "mental_wellness_resource",
    entityId: resource.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      kind: input.data.kind,
      language: input.data.language,
      isCrisisResource: input.data.isCrisisResource,
    },
  });

  return careOk({ resourceId: resource.id });
}

export async function updateMentalWellnessResource(input: {
  user: AuthenticatedUser;
  resourceId: string;
  data: MentalWellnessResourceUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ resourceId: string }>> {
  if (!input.user.permissions.includes("care.content_manage")) {
    return careFail("not_found", "You do not have access to manage mental wellness content.");
  }

  const existing = await prisma.mentalWellnessResource.findUnique({
    where: { id: input.resourceId },
    select: { id: true },
  });
  if (!existing) return careFail("not_found", "That mental wellness resource was not found.");

  await prisma.mentalWellnessResource.update({
    where: { id: existing.id },
    data: {
      kind: input.data.kind,
      title: input.data.title,
      summary: input.data.summary,
      bodyMarkdown: input.data.bodyMarkdown,
      language: input.data.language,
      helplineNumber: input.data.helplineNumber,
      helplineHours: input.data.helplineHours,
      externalUrl: input.data.externalUrl,
      isCrisisResource: input.data.isCrisisResource,
      reviewedByLabel: input.data.reviewedByLabel,
      isActive: input.data.isActive,
    },
  });

  await recordAuditEvent({
    action: "care.mental_wellness_resource_updated",
    entityType: "mental_wellness_resource",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      fields: Object.keys(input.data).filter((key) => input.data[key as keyof typeof input.data] !== undefined),
    },
  });

  return careOk({ resourceId: existing.id });
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

const EDUCATION_SELECT = {
  id: true,
  category: true,
  language: true,
  title: true,
  summary: true,
  bodyMarkdown: true,
  readingMinutes: true,
  reviewedByLabel: true,
  reviewedOn: true,
  isActive: true,
} as const;

export type EducationResourceSummary = {
  id: string;
  category: EducationResourceCategory;
  language: SupportedLanguage;
  title: string;
  summary: string;
  bodyMarkdown: string;
  readingMinutes: number | null;
  reviewedByLabel: string;
  reviewedOn: Date | null;
  isActive: boolean;
};

export type EducationResourceList = {
  resources: EducationResourceSummary[];
  /**
   * True when the requested language holds no reviewed material and the English
   * rows were substituted, so a caller can say so rather than passing one
   * language off as another.
   */
  languageUnavailable: boolean;
};

/**
 * The education library.
 *
 * Only `isActive` rows are returned, and only for a language in which a
 * *reviewed* resource actually exists. When the requested language holds none,
 * the English rows come back and `languageUnavailable` is set — the caller is
 * told, rather than handed an empty shelf. ORVEXA does not publish a machine
 * translation as if a clinician had reviewed it, so it also does not relabel
 * English text with a language it was not written in.
 */
export async function listEducationResources(input: {
  category?: EducationResourceCategory;
  language?: SupportedLanguage;
  limit?: number;
}): Promise<EducationResourceList> {
  const language = input.language ?? "ENGLISH";

  const rows = await prisma.healthEducationResource.findMany({
    where: { isActive: true, language, ...(input.category ? { category: input.category } : {}) },
    orderBy: { title: "asc" },
    take: input.limit ?? 50,
    select: EDUCATION_SELECT,
  });

  if (rows.length > 0 || language === "ENGLISH") {
    return { resources: rows, languageUnavailable: false };
  }

  const englishRows = await prisma.healthEducationResource.findMany({
    where: { isActive: true, language: "ENGLISH", ...(input.category ? { category: input.category } : {}) },
    orderBy: { title: "asc" },
    take: input.limit ?? 50,
    select: EDUCATION_SELECT,
  });

  return { resources: englishRows, languageUnavailable: true };
}

export async function getEducationResource(input: {
  resourceId: string;
}): Promise<EducationResourceSummary | null> {
  return prisma.healthEducationResource.findUnique({
    where: { id: input.resourceId },
    select: EDUCATION_SELECT,
  });
}

export async function createEducationResource(input: {
  user: AuthenticatedUser;
  data: EducationResourceCreateInput;
  context?: RequestContext;
}): Promise<CareResult<{ resourceId: string }>> {
  if (!input.user.permissions.includes("care.content_manage")) {
    return careFail("not_found", "You do not have access to manage health education content.");
  }

  const resource = await prisma.healthEducationResource.create({
    data: {
      category: input.data.category,
      language: input.data.language,
      title: input.data.title,
      summary: input.data.summary,
      bodyMarkdown: input.data.bodyMarkdown,
      readingMinutes: input.data.readingMinutes ?? null,
      // Required by the schema and by the model: ORVEXA does not publish
      // unattributed clinical text.
      reviewedByLabel: input.data.reviewedByLabel,
      reviewedOn: input.data.reviewedOn ?? null,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "care.education_resource_created",
    entityType: "health_education_resource",
    entityId: resource.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      category: input.data.category,
      language: input.data.language,
      reviewedByLabel: input.data.reviewedByLabel,
    },
  });

  return careOk({ resourceId: resource.id });
}

export async function updateEducationResource(input: {
  user: AuthenticatedUser;
  resourceId: string;
  data: EducationResourceUpdateInput;
  context?: RequestContext;
}): Promise<CareResult<{ resourceId: string }>> {
  if (!input.user.permissions.includes("care.content_manage")) {
    return careFail("not_found", "You do not have access to manage health education content.");
  }

  const existing = await prisma.healthEducationResource.findUnique({
    where: { id: input.resourceId },
    select: { id: true },
  });
  if (!existing) return careFail("not_found", "That education resource was not found.");

  await prisma.healthEducationResource.update({
    where: { id: existing.id },
    data: {
      category: input.data.category,
      language: input.data.language,
      title: input.data.title,
      summary: input.data.summary,
      bodyMarkdown: input.data.bodyMarkdown,
      readingMinutes: input.data.readingMinutes,
      reviewedByLabel: input.data.reviewedByLabel,
      reviewedOn: input.data.reviewedOn,
      isActive: input.data.isActive,
    },
  });

  await recordAuditEvent({
    action: "care.education_resource_updated",
    entityType: "health_education_resource",
    entityId: existing.id,
    actorUserId: input.user.id,
    context: input.context,
    metadata: {
      fields: Object.keys(input.data).filter((key) => input.data[key as keyof typeof input.data] !== undefined),
    },
  });

  return careOk({ resourceId: existing.id });
}
