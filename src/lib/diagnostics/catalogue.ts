import "server-only";

import type {
  DiagnosticSampleType,
  Prisma,
  VerificationState,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Discovery for diagnostic laboratories and the tests they offer.
 *
 * Three honesty rules live here and nowhere else:
 *
 *  1. **Only a verified, approved laboratory is discoverable.** An offer is only
 *     counted when it comes from a `LabPartnerProfile` whose
 *     `verificationStatus` is `VERIFIED` and whose application is `APPROVED`.
 *     Neither flag can be set by the partner itself.
 *  2. **A non-listable test is never returned.** A test with `listable: false`,
 *     or one that has been deleted, is excluded from every query in this module,
 *     so it cannot reach a result page or a booking however a partner prices it.
 *  3. **A price is only a price when a partner published one.** A test with no
 *     qualifying offer is still returned — so a search explains itself — but with
 *     `lowestPriceInr: null`, and the UI is required to say the test is not
 *     currently offered by any participating laboratory rather than inventing a
 *     figure.
 *
 * This module reads. It never writes a catalogue row, a price or a report.
 */

/** The `where` fragment every discovery query shares for a catalogue test. */
const LISTABLE_TEST_WHERE = {
  listable: true,
  deletedAt: null,
} satisfies Prisma.DiagnosticTestWhereInput;

/**
 * A laboratory counts only when a platform administrator has verified it and its
 * application is approved. `verificationStatus: VERIFIED` is load-bearing.
 */
const VERIFIED_LAB_WHERE = {
  verificationStatus: "VERIFIED" as VerificationState,
  status: "APPROVED" as const,
} satisfies Prisma.LabPartnerProfileWhereInput;

const LAB_OFFER_SELECT = {
  id: true,
  priceInr: true,
  homeCollectionFeeInr: true,
  turnaroundHours: true,
  homeCollectionAvailable: true,
  notes: true,
  labProfile: {
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      verificationStatus: true,
      status: true,
      acceptsHomeCollection: true,
      homeCollectionRadiusKm: true,
      coverageCities: true,
      coveragePostalCodes: true,
      standardTurnaroundHours: true,
      facility: {
        select: {
          id: true,
          name: true,
          city: true,
          state: true,
          postalCode: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  },
} satisfies Prisma.DiagnosticTestOfferSelect;

export type DiagnosticOffer = Prisma.DiagnosticTestOfferGetPayload<{ select: typeof LAB_OFFER_SELECT }>;

export type DiagnosticTestCard = {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  categorySlug: string;
  categoryName: string | null;
  description: string | null;
  purposeSummary: string | null;
  preparationRequired: boolean;
  fastingRequired: boolean;
  fastingHours: number | null;
  sampleTypes: DiagnosticSampleType[];
  homeCollectionSupported: boolean;
  isPanel: boolean;
  standardTurnaroundHours: number | null;
  /** Catalogue verification state, shown as-is. Never rendered as "verified" unless VERIFIED. */
  verificationStatus: VerificationState;
  /** The cheapest qualifying offer, or null when no laboratory lists this test. */
  lowestOffer: DiagnosticOffer | null;
  /** How many verified laboratories currently offer this test. */
  offersCount: number;
};

export type DiagnosticLabCard = {
  id: string;
  legalName: string;
  tradeName: string | null;
  accreditationNumber: string | null;
  accreditationBody: string | null;
  verificationStatus: VerificationStatusView;
  acceptsHomeCollection: boolean;
  homeCollectionRadiusKm: number | null;
  coverageCities: string[];
  coveragePostalCodes: string[];
  standardTurnaroundHours: number | null;
  sampleCollectionFeeInr: number | null;
  facility: {
    id: string;
    name: string;
    city: string;
    state: string;
    postalCode: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
  testsOffered: number;
};

export type VerificationStatusView = VerificationState;

export type DiagnosticFacets = {
  categories: { slug: string; name: string; count: number }[];
};

export type DiagnosticSearchInput = {
  query?: string;
  categorySlug?: string;
  city?: string;
  postalCode?: string;
  mode?: "WALK_IN" | "HOME_COLLECTION";
  sort?: "relevance" | "price-asc" | "price-desc" | "name";
  page?: number;
  pageSize?: number;
};

export type DiagnosticSearchResult = {
  tests: DiagnosticTestCard[];
  labs: DiagnosticLabCard[];
  total: number;
  page: number;
  pageSize: number;
  facets: DiagnosticFacets;
};

export const DIAGNOSTIC_PAGE_SIZE = 12;

function labMatchesCoverage(lab: DiagnosticLabCard, city?: string, postalCode?: string): boolean {
  const facilityCity = lab.facility?.city ?? null;
  const facilityPostalCode = lab.facility?.postalCode ?? null;
  const cities = lab.coverageCities.map((value) => value.toLowerCase());
  const pins = lab.coveragePostalCodes;

  if (postalCode) {
    if (facilityPostalCode === postalCode) return true;
    if (pins.includes(postalCode)) return true;
    if (!facilityPostalCode && pins.length === 0) return false;
  }
  if (city) {
    const needle = city.toLowerCase();
    if (facilityCity && facilityCity.toLowerCase() === needle) return true;
    if (cities.includes(needle)) return true;
  }
  // A filter that names neither a city nor a postal code matches everything.
  return !city && !postalCode;
}

/** Every verified laboratory, with a count of the tests it currently offers. */
export async function listVerifiedLabs(input: {
  city?: string;
  postalCode?: string;
} = {}): Promise<DiagnosticLabCard[]> {
  const rows = await prisma.labPartnerProfile.findMany({
    where: VERIFIED_LAB_WHERE,
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      accreditationNumber: true,
      accreditationBody: true,
      verificationStatus: true,
      acceptsHomeCollection: true,
      homeCollectionRadiusKm: true,
      coverageCities: true,
      coveragePostalCodes: true,
      standardTurnaroundHours: true,
      sampleCollectionFeeInr: true,
      facility: {
        select: {
          id: true,
          name: true,
          city: true,
          state: true,
          postalCode: true,
          latitude: true,
          longitude: true,
        },
      },
      _count: { select: { offers: { where: { isActive: true } } } },
    },
    orderBy: [{ verificationStatus: "asc" }, { legalName: "asc" }],
    take: 200,
  });

  return rows
    .map((row) => ({
      id: row.id,
      legalName: row.legalName,
      tradeName: row.tradeName,
      accreditationNumber: row.accreditationNumber,
      accreditationBody: row.accreditationBody,
      verificationStatus: row.verificationStatus,
      acceptsHomeCollection: row.acceptsHomeCollection,
      homeCollectionRadiusKm: row.homeCollectionRadiusKm,
      coverageCities: row.coverageCities,
      coveragePostalCodes: row.coveragePostalCodes,
      standardTurnaroundHours: row.standardTurnaroundHours,
      sampleCollectionFeeInr: row.sampleCollectionFeeInr,
      facility: row.facility,
      testsOffered: row._count.offers,
    }))
    .filter((lab) => labMatchesCoverage(lab, input.city, input.postalCode));
}

/** Picks the lowest published price; ties broken by the earliest-created offer. */
function cheapestOffer(offers: DiagnosticOffer[]): DiagnosticOffer | null {
  if (offers.length === 0) return null;
  return offers.reduce((best, offer) => (offer.priceInr < best.priceInr ? offer : best));
}

function testWhere(input: DiagnosticSearchInput): Prisma.DiagnosticTestWhereInput {
  const where: Prisma.DiagnosticTestWhereInput = { ...LISTABLE_TEST_WHERE };
  if (input.categorySlug) where.categorySlug = input.categorySlug;
  // A home-collection filter must also be honoured by the laboratory, so it is
  // applied to the offers relation rather than to the test alone.
  const offerFilter: Prisma.DiagnosticTestOfferWhereInput = { isActive: true, labProfile: VERIFIED_LAB_WHERE };
  if (input.mode === "HOME_COLLECTION") offerFilter.homeCollectionAvailable = true;
  if (input.city || input.postalCode) {
    const coverage: Prisma.LabPartnerProfileWhereInput[] = [];
    if (input.city) {
      coverage.push({
        OR: [{ coverageCities: { has: input.city } }, { facility: { is: { city: input.city } } }],
      });
    }
    if (input.postalCode) {
      coverage.push({
        OR: [
          { coveragePostalCodes: { has: input.postalCode } },
          { facility: { is: { postalCode: input.postalCode } } },
        ],
      });
    }
    offerFilter.labProfile = { AND: [VERIFIED_LAB_WHERE, ...coverage] };
  }
  where.offers = { some: offerFilter };

  if (input.query && input.query.trim().length > 0) {
    const needle = input.query.trim();
    where.OR = [
      { name: { contains: needle, mode: "insensitive" } },
      { shortName: { contains: needle, mode: "insensitive" } },
      { description: { contains: needle, mode: "insensitive" } },
      { categorySlug: { contains: needle, mode: "insensitive" } },
      { panelComponents: { has: needle } },
    ];
  }
  return where;
}

function offerWhere(input: DiagnosticSearchInput): Prisma.DiagnosticTestOfferWhereInput {
  const where: Prisma.DiagnosticTestOfferWhereInput = { isActive: true, labProfile: VERIFIED_LAB_WHERE };
  if (input.mode === "HOME_COLLECTION") where.homeCollectionAvailable = true;
  return where;
}

export async function searchTests(input: DiagnosticSearchInput): Promise<{
  tests: DiagnosticTestCard[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(input.pageSize ?? DIAGNOSTIC_PAGE_SIZE, 48));

  const rows = await prisma.diagnosticTest.findMany({
    where: testWhere(input),
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      categorySlug: true,
      description: true,
      purposeSummary: true,
      preparationRequired: true,
      fastingRequired: true,
      fastingHours: true,
      sampleTypes: true,
      homeCollectionSupported: true,
      isPanel: true,
      standardTurnaroundHours: true,
      verificationStatus: true,
      category: { select: { name: true } },
      offers: {
        where: offerWhere(input),
        select: LAB_OFFER_SELECT,
        orderBy: { priceInr: "asc" },
      },
    },
    take: 500,
  });

  const cards: DiagnosticTestCard[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.shortName,
    categorySlug: row.categorySlug,
    categoryName: row.category?.name ?? null,
    description: row.description,
    purposeSummary: row.purposeSummary,
    preparationRequired: row.preparationRequired,
    fastingRequired: row.fastingRequired,
    fastingHours: row.fastingHours,
    sampleTypes: row.sampleTypes,
    homeCollectionSupported: row.homeCollectionSupported,
    isPanel: row.isPanel,
    standardTurnaroundHours: row.standardTurnaroundHours,
    verificationStatus: row.verificationStatus,
    lowestOffer: cheapestOffer(row.offers as DiagnosticOffer[]),
    offersCount: row.offers.length,
  }));

  const sorted = sortTests(cards, input.sort ?? "relevance");
  const start = (page - 1) * pageSize;
  return { tests: sorted.slice(start, start + pageSize), total: sorted.length, page, pageSize };
}

function sortTests(tests: DiagnosticTestCard[], sort: DiagnosticSearchInput["sort"]): DiagnosticTestCard[] {
  const copy = [...tests];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => priceKey(a) - priceKey(b));
    case "price-desc":
      return copy.sort((a, b) => (b.lowestOffer?.priceInr ?? -1) - (a.lowestOffer?.priceInr ?? -1));
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    default:
      // Relevance: offered tests before unoffered ones, then by name.
      return copy.sort((a, b) => {
        const aOffered = a.lowestOffer ? 0 : 1;
        const bOffered = b.lowestOffer ? 0 : 1;
        if (aOffered !== bOffered) return aOffered - bOffered;
        return a.name.localeCompare(b.name);
      });
  }
}

function priceKey(test: DiagnosticTestCard): number {
  return test.lowestOffer?.priceInr ?? Number.POSITIVE_INFINITY;
}

/**
 * The combined discovery search.
 *
 * A test search and a laboratory search answer different questions, so both are
 * returned: "which laboratory near me offers a lipid profile" and "which tests
 * can this laboratory actually run" are not the same query, and collapsing them
 * would hide one of the two answers.
 */
export async function searchDiagnostics(input: DiagnosticSearchInput): Promise<DiagnosticSearchResult> {
  const [testResult, labs] = await Promise.all([
    searchTests(input),
    listVerifiedLabs({ city: input.city, postalCode: input.postalCode }),
  ]);

  const categoryCounts = new Map<string, number>();
  for (const test of testResult.tests) {
    categoryCounts.set(test.categorySlug, (categoryCounts.get(test.categorySlug) ?? 0) + 1);
  }

  const categoryNames = new Map<string, string>();
  for (const test of testResult.tests) {
    if (test.categoryName) categoryNames.set(test.categorySlug, test.categoryName);
  }

  return {
    tests: testResult.tests,
    labs,
    total: testResult.total,
    page: testResult.page,
    pageSize: testResult.pageSize,
    facets: {
      categories: [...categoryCounts.entries()]
        .map(([slug, count]) => ({ slug, name: categoryNames.get(slug) ?? slug, count }))
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    },
  };
}

// ---------------------------------------------------------------------------
// Single test
// ---------------------------------------------------------------------------

export type DiagnosticTestDetail = {
  test: DiagnosticTestCard & {
    method: string | null;
    panelComponents: string[];
    preparationInstructions: string | null;
    pediatricSafe: boolean | null;
    riskNotes: string | null;
    categoryId: string | null;
  };
  /** One entry per verified laboratory that lists this test. */
  offers: {
    offerId: string;
    labProfileId: string;
    labName: string;
    labVerified: boolean;
    /** True only when the price is the partner's own published figure. */
    priceInr: number;
    homeCollectionFeeInr: number | null;
    homeCollectionAvailable: boolean;
    turnaroundHours: number | null;
    city: string | null;
    state: string | null;
    notes: string | null;
  }[];
};

export async function getTestBySlug(slug: string): Promise<DiagnosticTestDetail | null> {
  const test = await prisma.diagnosticTest.findFirst({
    where: { ...LISTABLE_TEST_WHERE, slug },
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      categorySlug: true,
      categoryId: true,
      description: true,
      purposeSummary: true,
      preparationInstructions: true,
      preparationRequired: true,
      fastingRequired: true,
      fastingHours: true,
      sampleTypes: true,
      method: true,
      homeCollectionSupported: true,
      pediatricSafe: true,
      riskNotes: true,
      isPanel: true,
      panelComponents: true,
      standardTurnaroundHours: true,
      verificationStatus: true,
      category: { select: { name: true } },
      offers: {
        where: { isActive: true, labProfile: VERIFIED_LAB_WHERE },
        select: LAB_OFFER_SELECT,
        orderBy: { priceInr: "asc" },
      },
    },
  });

  if (!test) return null;

  const offers = (test.offers as DiagnosticOffer[]).map((offer) => ({
    offerId: offer.id,
    labProfileId: offer.labProfile.id,
    labName: offer.labProfile.tradeName ?? offer.labProfile.legalName,
    labVerified: offer.labProfile.verificationStatus === "VERIFIED",
    priceInr: offer.priceInr,
    homeCollectionFeeInr: offer.homeCollectionFeeInr,
    homeCollectionAvailable: offer.homeCollectionAvailable,
    turnaroundHours: offer.turnaroundHours ?? offer.labProfile.standardTurnaroundHours,
    city: offer.labProfile.facility?.city ?? null,
    state: offer.labProfile.facility?.state ?? null,
    notes: offer.notes,
  }));

  return {
    test: {
      id: test.id,
      slug: test.slug,
      name: test.name,
      shortName: test.shortName,
      categorySlug: test.categorySlug,
      categoryId: test.categoryId,
      categoryName: test.category?.name ?? null,
      description: test.description,
      purposeSummary: test.purposeSummary,
      preparationInstructions: test.preparationInstructions,
      preparationRequired: test.preparationRequired,
      fastingRequired: test.fastingRequired,
      fastingHours: test.fastingHours,
      sampleTypes: test.sampleTypes,
      method: test.method,
      homeCollectionSupported: test.homeCollectionSupported,
      pediatricSafe: test.pediatricSafe,
      riskNotes: test.riskNotes,
      isPanel: test.isPanel,
      panelComponents: test.panelComponents,
      standardTurnaroundHours: test.standardTurnaroundHours,
      verificationStatus: test.verificationStatus,
      lowestOffer: cheapestOffer(test.offers as DiagnosticOffer[]),
      offersCount: offers.length,
    },
    offers,
  };
}

// ---------------------------------------------------------------------------
// Single laboratory
// ---------------------------------------------------------------------------

export type DiagnosticLabDetail = {
  lab: {
    id: string;
    legalName: string;
    tradeName: string | null;
    accreditationNumber: string | null;
    accreditationBody: string | null;
    accreditationExpiresAt: Date | null;
    registrationNumber: string | null;
    verificationStatus: VerificationState;
    verifiedAt: Date | null;
    acceptsHomeCollection: boolean;
    homeCollectionRadiusKm: number | null;
    coverageCities: string[];
    coveragePostalCodes: string[];
    sampleCollectionFeeInr: number | null;
    standardTurnaroundHours: number | null;
    /** True only when a platform reviewer has released the report desk. */
    canPublishReports: boolean;
    facility: DiagnosticLabCard["facility"];
  };
  tests: DiagnosticTestCard[];
};

export async function getVerifiedLabById(id: string): Promise<DiagnosticLabDetail | null> {
  const lab = await prisma.labPartnerProfile.findFirst({
    where: { id, ...VERIFIED_LAB_WHERE },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      accreditationNumber: true,
      accreditationBody: true,
      accreditationExpiresAt: true,
      registrationNumber: true,
      verificationStatus: true,
      verifiedAt: true,
      acceptsHomeCollection: true,
      homeCollectionRadiusKm: true,
      coverageCities: true,
      coveragePostalCodes: true,
      sampleCollectionFeeInr: true,
      standardTurnaroundHours: true,
      canPublishReports: true,
      facility: {
        select: {
          id: true,
          name: true,
          city: true,
          state: true,
          postalCode: true,
          latitude: true,
          longitude: true,
        },
      },
      offers: {
        where: { isActive: true, test: LISTABLE_TEST_WHERE },
        select: {
          id: true,
          priceInr: true,
          homeCollectionFeeInr: true,
          turnaroundHours: true,
          homeCollectionAvailable: true,
          notes: true,
          test: {
            select: {
              id: true,
              slug: true,
              name: true,
              shortName: true,
              categorySlug: true,
              description: true,
              purposeSummary: true,
              preparationRequired: true,
              fastingRequired: true,
              fastingHours: true,
              sampleTypes: true,
              homeCollectionSupported: true,
              isPanel: true,
              standardTurnaroundHours: true,
              verificationStatus: true,
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { priceInr: "asc" },
        take: 300,
      },
    },
  });

  if (!lab) return null;

  const tests: DiagnosticTestCard[] = lab.offers.map((offer) => ({
    id: offer.test.id,
    slug: offer.test.slug,
    name: offer.test.name,
    shortName: offer.test.shortName,
    categorySlug: offer.test.categorySlug,
    categoryName: offer.test.category?.name ?? null,
    description: offer.test.description,
    purposeSummary: offer.test.purposeSummary,
    preparationRequired: offer.test.preparationRequired,
    fastingRequired: offer.test.fastingRequired,
    fastingHours: offer.test.fastingHours,
    sampleTypes: offer.test.sampleTypes,
    homeCollectionSupported: offer.test.homeCollectionSupported || offer.homeCollectionAvailable,
    isPanel: offer.test.isPanel,
    standardTurnaroundHours: offer.turnaroundHours ?? offer.test.standardTurnaroundHours,
    verificationStatus: offer.test.verificationStatus,
    lowestOffer: {
      id: offer.id,
      priceInr: offer.priceInr,
      homeCollectionFeeInr: offer.homeCollectionFeeInr,
      turnaroundHours: offer.turnaroundHours,
      homeCollectionAvailable: offer.homeCollectionAvailable,
      notes: offer.notes,
      labProfile: {
        id: lab.id,
        legalName: lab.legalName,
        tradeName: lab.tradeName,
        verificationStatus: lab.verificationStatus,
        status: "APPROVED",
        acceptsHomeCollection: lab.acceptsHomeCollection,
        homeCollectionRadiusKm: lab.homeCollectionRadiusKm,
        coverageCities: lab.coverageCities,
        coveragePostalCodes: lab.coveragePostalCodes,
        standardTurnaroundHours: lab.standardTurnaroundHours,
        facility: lab.facility,
      },
    },
    offersCount: 1,
  }));

  return {
    lab: {
      id: lab.id,
      legalName: lab.legalName,
      tradeName: lab.tradeName,
      accreditationNumber: lab.accreditationNumber,
      accreditationBody: lab.accreditationBody,
      accreditationExpiresAt: lab.accreditationExpiresAt,
      registrationNumber: lab.registrationNumber,
      verificationStatus: lab.verificationStatus,
      verifiedAt: lab.verifiedAt,
      acceptsHomeCollection: lab.acceptsHomeCollection,
      homeCollectionRadiusKm: lab.homeCollectionRadiusKm,
      coverageCities: lab.coverageCities,
      coveragePostalCodes: lab.coveragePostalCodes,
      sampleCollectionFeeInr: lab.sampleCollectionFeeInr,
      standardTurnaroundHours: lab.standardTurnaroundHours,
      canPublishReports: lab.canPublishReports,
      facility: lab.facility,
    },
    tests,
  };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listDiagnosticCategories(): Promise<{ slug: string; name: string; description: string | null }[]> {
  return prisma.diagnosticCategory.findMany({
    where: { isActive: true },
    select: { slug: true, name: true, description: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 100,
  });
}
