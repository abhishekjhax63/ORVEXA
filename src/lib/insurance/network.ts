import "server-only";

import type { NetworkEntrySource, Prisma, VerificationState } from "@prisma/client";

import {
  COVERAGE_NOT_PUBLISHED,
  INTEGRATION_MODE_COPY,
  isNetworkEntryConfirmed,
  NETWORK_ENTRY_SOURCE_COPY,
} from "@/lib/insurance/labels";
import { prisma } from "@/lib/db/prisma";
import type { NetworkSearch } from "@/lib/validation/insurance";

/**
 * Network-hospital search.
 *
 * A search result here answers one question honestly: *who says* this hospital is
 * in this insurer's network. An entry whose source is the insurer's own list or
 * API is presented as confirmed; an entry a hospital declared, or that nobody has
 * attested, is presented with "not confirmed by the insurer" and its cashless
 * flag is never shown as a promise.
 *
 * Nothing is written by a search, so it consumes no rate-limit budget beyond the
 * limit the caller checks, and it records no audit event.
 */

export const NETWORK_PAGE_SIZE = 20;

export type NetworkHospitalResult = {
  id: string;
  insurerId: string;
  insurerName: string;
  hospitalId: string | null;
  hospitalName: string;
  addressLine1: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  /** What the source says; null means the source did not state it. */
  cashlessAvailable: boolean | null;
  /** True only when a confirming source backs the entry *and* says cashless. */
  cashlessConfirmed: boolean;
  productSlugs: string[];
  source: NetworkEntrySource;
  sourceLabel: string;
  sourceDetail: string;
  confirmed: boolean;
  verificationStatus: VerificationState;
  lastSyncedAt: Date | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
};

export type NetworkSearchResult = {
  results: NetworkHospitalResult[];
  total: number;
  page: number;
  pageSize: number;
  /** The sentence shown under the results, explaining what a listing means. */
  caveat: string;
};

const CAVEAT =
  "A listing says the source named on it considers this hospital in-network. Cashless admission is confirmed by the insurer at the time of admission, not by this page.";

type NetworkRow = Prisma.InsuranceNetworkHospitalGetPayload<{ include: { insurer: true } }>;

function toResult(row: NetworkRow): NetworkHospitalResult {
  const copy = NETWORK_ENTRY_SOURCE_COPY[row.source];
  const confirmed = isNetworkEntryConfirmed(row.source);
  return {
    id: row.id,
    insurerId: row.insurerId,
    insurerName: row.insurer.name,
    hospitalId: row.hospitalId,
    hospitalName: row.hospitalName,
    addressLine1: row.addressLine1,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    cashlessAvailable: row.cashlessAvailable,
    cashlessConfirmed: confirmed && row.cashlessAvailable === true,
    productSlugs: row.productSlugs,
    source: row.source,
    sourceLabel: copy.label,
    sourceDetail: copy.detail,
    confirmed,
    verificationStatus: row.verificationStatus,
    lastSyncedAt: row.lastSyncedAt,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}

/** Searches the network entries of every active insurer. Read-only. */
export async function searchNetworkHospitals(input: NetworkSearch): Promise<NetworkSearchResult> {
  const now = new Date();
  const pageSize = NETWORK_PAGE_SIZE;
  const page = input.page;

  const where: Prisma.InsuranceNetworkHospitalWhereInput = {
    insurer: { isActive: true },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
  };

  const filters: Prisma.InsuranceNetworkHospitalWhereInput[] = [];
  if (input.query) filters.push({ hospitalName: { contains: input.query, mode: "insensitive" } });
  if (input.city) filters.push({ city: { equals: input.city, mode: "insensitive" } });
  if (input.postalCode) filters.push({ postalCode: input.postalCode });
  if (input.insurerId) filters.push({ insurerId: input.insurerId });

  if (filters.length > 0) where.AND = filters;

  const [total, rows] = await Promise.all([
    prisma.insuranceNetworkHospital.count({ where }),
    prisma.insuranceNetworkHospital.findMany({
      where,
      include: { insurer: true },
      // Confirmed entries first, so the most reliable answer is at the top.
      orderBy: [{ source: "asc" }, { hospitalName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { results: rows.map(toResult), total, page, pageSize, caveat: CAVEAT };
}

/**
 * One network entry.
 *
 * The caller passes the insurer too when it needs to distinguish two insurers'
 * entries for the same hospital. `getNetworkEntry` reads by id alone and is only
 * used where the id came from an authorized list.
 */
export async function getNetworkEntry(entryId: string): Promise<NetworkHospitalResult | null> {
  const row = await prisma.insuranceNetworkHospital.findUnique({
    where: { id: entryId },
    include: { insurer: true },
  });
  return row ? toResult(row) : null;
}

/** The districts a search can be narrowed to, for the filter control. */
export async function listNetworkCities(): Promise<string[]> {
  const rows = await prisma.insuranceNetworkHospital.findMany({
    where: { insurer: { isActive: true } },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
    take: 200,
  });
  return rows.map((row) => row.city);
}

// ---------------------------------------------------------------------------
// Insurers
// ---------------------------------------------------------------------------

export type InsurerSummary = {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  irdaiRegistrationNumber: string | null;
  regulatorRegisterUrl: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  website: string | null;
  networkListUrl: string | null;
  /** How ORVEXA can reach this insurer, and whether that route is automated. */
  integrationMode: NetworkRow["insurer"]["integrationMode"];
  integrationLabel: string;
  integrationDetail: string;
  integrationAutomated: boolean;
  verificationStatus: VerificationState;
  networkEntryCount: number;
};

/**
 * The insurers a patient can pick from, with how each one can actually be
 * reached. Shows only active insurers; an inactive one is not a route to
 * anything, and offering it would imply cover that cannot be claimed.
 */
export async function listInsurers(): Promise<InsurerSummary[]> {
  const rows = await prisma.insurer.findMany({
    where: { isActive: true },
    include: { _count: { select: { networkEntries: true } } },
    orderBy: { name: "asc" },
  });

  return rows.map((insurer) => {
    const copy = INTEGRATION_MODE_COPY[insurer.integrationMode];
    return {
      id: insurer.id,
      slug: insurer.slug,
      name: insurer.name,
      legalName: insurer.legalName,
      irdaiRegistrationNumber: insurer.irdaiRegistrationNumber,
      regulatorRegisterUrl: insurer.regulatorRegisterUrl,
      supportPhone: insurer.supportPhone,
      supportEmail: insurer.supportEmail,
      website: insurer.website,
      networkListUrl: insurer.networkListUrl,
      integrationMode: insurer.integrationMode,
      integrationLabel: copy.label,
      integrationDetail: copy.detail,
      integrationAutomated: copy.automated,
      verificationStatus: insurer.verificationStatus,
      networkEntryCount: insurer._count.networkEntries,
    };
  });
}

/**
 * A single line a patient can be given when they ask "can you file this for me?"
 * for one insurer. Deliberately a sentence rather than a boolean, because the
 * honest answer for most insurers today is "by hand, with a reference number".
 */
export function describeInsurerRoute(insurer: { integrationMode: NetworkRow["insurer"]["integrationMode"] }) {
  const copy = INTEGRATION_MODE_COPY[insurer.integrationMode];
  return { label: copy.label, detail: copy.detail, automated: copy.automated };
}

/** Re-exported so a caller does not have to reach into `labels` for the fallback. */
export const NETWORK_TERM_NOT_PUBLISHED = COVERAGE_NOT_PUBLISHED;
