import "server-only";

import type { MedicineScheduleClass, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * The storefront catalogue.
 *
 * Two honesty rules live here and nowhere else:
 *
 *  1. **A price is only a price when a partner published one.** The cheapest
 *     offer returned is the lowest `pricePublished` offer from a pharmacy whose
 *     credentials a platform administrator has verified. An unpublished offer is
 *     never returned as a number.
 *  2. **Restricted classes are never listed.** Schedule X, narcotic and other
 *     restricted products are excluded from every query in this module, so they
 *     cannot reach a result page or an order regardless of what a partner does.
 *
 * A product with no qualifying offer is still returned (so a search for a known
 * medicine explains itself) but with `lowestOffer: null`, and the UI is required
 * to say the medicine is not currently listed by any participating pharmacy
 * rather than inventing a price or a stock level.
 */

/** Schedule classes the platform may not list or sell at all. */
export const NON_LISTABLE_SCHEDULE_CLASSES: readonly MedicineScheduleClass[] = [
  "SCHEDULE_X",
  "NARCOTIC",
  "RESTRICTED_OTHER",
];

/** The `where` fragment every storefront query shares. */
const LISTABLE_PRODUCT_WHERE = {
  listable: true,
  deletedAt: null,
  scheduleClass: { notIn: NON_LISTABLE_SCHEDULE_CLASSES as MedicineScheduleClass[] },
} satisfies Prisma.MedicineProductWhereInput;

/**
 * An offer only counts if it comes from a pharmacy that is verified *and* whose
 * application is approved. `verificationStatus: VERIFIED` is the load-bearing
 * check; a partner cannot set it on its own profile.
 */
const LIVE_PHARMACY_WHERE = {
  verificationStatus: "VERIFIED",
  status: "APPROVED",
} satisfies Prisma.PharmacyPartnerProfileWhereInput;

const OFFER_SELECT = {
  id: true,
  priceInPaise: true,
  mrpInPaise: true,
  pricePublished: true,
  taxRateBps: true,
  stockStatus: true,
  stockQuantity: true,
  lowStockThreshold: true,
  restockEtaDays: true,
  deliveryEtaMinutes: true,
  maxPerOrder: true,
  verificationStatus: true,
  pharmacy: {
    select: {
      id: true,
      tradeName: true,
      legalName: true,
      verificationStatus: true,
      status: true,
      homeDeliveryAvailable: true,
    },
  },
} satisfies Prisma.PharmacyOfferSelect;

export type CatalogueOffer = Prisma.PharmacyOfferGetPayload<{ select: typeof OFFER_SELECT }>;

export type CatalogueProduct = {
  id: string;
  slug: string;
  brandName: string;
  genericName: string;
  strengthLabel: string;
  dosageForm: string;
  packSizeLabel: string;
  manufacturer: string | null;
  scheduleClass: MedicineScheduleClass;
  prescriptionRequired: boolean;
  isControlled: boolean;
  categorySlug: string;
  imageUrl: string | null;
  /** The cheapest qualifying offer, or null when no pharmacy lists this product. */
  lowestOffer: CatalogueOffer | null;
};

export type CatalogueFacets = {
  categories: { slug: string; count: number }[];
  scheduleClasses: { scheduleClass: MedicineScheduleClass; count: number }[];
};

export type CatalogueSearchResult = {
  products: CatalogueProduct[];
  total: number;
  page: number;
  pageSize: number;
  facets: CatalogueFacets;
};

export const CATALOGUE_PAGE_SIZE = 12;

export type CatalogueSearchInput = {
  query?: string;
  categorySlug?: string;
  scheduleClass?: MedicineScheduleClass;
  prescriptionRequiredOnly?: boolean;
  sort?: "relevance" | "price-asc" | "price-desc" | "name";
  page?: number;
  pageSize?: number;
  /** Excludes restricted classes regardless of the filter, always on for the storefront. */
  excludeRestricted?: boolean;
};

function productWhere(input: CatalogueSearchInput): Prisma.MedicineProductWhereInput {
  const where: Prisma.MedicineProductWhereInput = { ...LISTABLE_PRODUCT_WHERE };
  if (input.categorySlug) where.categorySlug = input.categorySlug;
  if (input.scheduleClass) where.scheduleClass = input.scheduleClass;
  if (input.prescriptionRequiredOnly) where.prescriptionRequired = true;
  if (input.query && input.query.trim().length > 0) {
    const needle = input.query.trim();
    where.OR = [
      { brandName: { contains: needle, mode: "insensitive" } },
      { genericName: { contains: needle, mode: "insensitive" } },
    ];
  }
  return where;
}

/** Picks the lowest published price; ties broken by the earliest-created offer. */
function cheapestOffer(offers: CatalogueOffer[]): CatalogueOffer | null {
  const published = offers.filter((offer) => offer.pricePublished);
  if (published.length === 0) return null;
  return published.reduce((best, offer) => (offer.priceInPaise < best.priceInPaise ? offer : best));
}

export async function searchCatalogue(input: CatalogueSearchInput): Promise<CatalogueSearchResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(input.pageSize ?? CATALOGUE_PAGE_SIZE, 48));

  const rows = await prisma.medicineProduct.findMany({
    where: productWhere(input),
    select: {
      id: true,
      slug: true,
      brandName: true,
      genericName: true,
      strengthLabel: true,
      dosageForm: true,
      packSizeLabel: true,
      manufacturer: true,
      scheduleClass: true,
      prescriptionRequired: true,
      isControlled: true,
      categorySlug: true,
      imageUrl: true,
      offers: {
        where: {
          isActive: true,
          pharmacy: LIVE_PHARMACY_WHERE,
        },
        select: OFFER_SELECT,
        orderBy: { priceInPaise: "asc" },
      },
    },
    take: 500,
  });

  const products: CatalogueProduct[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    brandName: row.brandName,
    genericName: row.genericName,
    strengthLabel: row.strengthLabel,
    dosageForm: row.dosageForm,
    packSizeLabel: row.packSizeLabel,
    manufacturer: row.manufacturer,
    scheduleClass: row.scheduleClass,
    prescriptionRequired: row.prescriptionRequired,
    isControlled: row.isControlled,
    categorySlug: row.categorySlug,
    imageUrl: row.imageUrl,
    lowestOffer: cheapestOffer(row.offers as CatalogueOffer[]),
  }));

  const sorted = sortProducts(products, input.sort ?? "relevance");

  const facets = buildFacets(products);
  const total = sorted.length;
  const start = (page - 1) * pageSize;

  return { products: sorted.slice(start, start + pageSize), total, page, pageSize, facets };
}

function sortProducts(products: CatalogueProduct[], sort: CatalogueSearchInput["sort"]): CatalogueProduct[] {
  const copy = [...products];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => priceKey(a) - priceKey(b));
    case "price-desc":
      return copy.sort((a, b) => {
        const aPrice = a.lowestOffer?.priceInPaise ?? -1;
        const bPrice = b.lowestOffer?.priceInPaise ?? -1;
        return bPrice - aPrice;
      });
    case "name":
      return copy.sort((a, b) => a.brandName.localeCompare(b.brandName));
    default:
      // Relevance: listed medicines before unlisted ones, then by name.
      return copy.sort((a, b) => {
        const aListed = a.lowestOffer ? 0 : 1;
        const bListed = b.lowestOffer ? 0 : 1;
        if (aListed !== bListed) return aListed - bListed;
        return a.brandName.localeCompare(b.brandName);
      });
  }
}

function priceKey(product: CatalogueProduct): number {
  return product.lowestOffer?.priceInPaise ?? Number.POSITIVE_INFINITY;
}

function buildFacets(products: CatalogueProduct[]): CatalogueFacets {
  const categoryCounts = new Map<string, number>();
  const scheduleCounts = new Map<MedicineScheduleClass, number>();
  for (const product of products) {
    categoryCounts.set(product.categorySlug, (categoryCounts.get(product.categorySlug) ?? 0) + 1);
    scheduleCounts.set(product.scheduleClass, (scheduleCounts.get(product.scheduleClass) ?? 0) + 1);
  }
  return {
    categories: [...categoryCounts.entries()]
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
    scheduleClasses: [...scheduleCounts.entries()]
      .map(([scheduleClass, count]) => ({ scheduleClass, count }))
      .sort((a, b) => a.scheduleClass.localeCompare(b.scheduleClass)),
  };
}

// ---------------------------------------------------------------------------
// Single product
// ---------------------------------------------------------------------------

export type ProductDetail = {
  product: {
    id: string;
    slug: string;
    brandName: string;
    genericName: string;
    strengthLabel: string;
    dosageForm: string;
    packSizeLabel: string;
    unitsPerPack: number | null;
    manufacturer: string | null;
    manufacturerCountry: string | null;
    drugCode: string | null;
    scheduleClass: MedicineScheduleClass;
    prescriptionRequired: boolean;
    isControlled: boolean;
    categorySlug: string;
    description: string | null;
    usesSummary: string | null;
    commonSideEffects: string | null;
    storageNotes: string | null;
    warnings: string | null;
    imageUrl: string | null;
  };
  offers: {
    id: string;
    pharmacyProfileId: string;
    pharmacyName: string;
    pharmacyVerified: boolean;
    pharmacyDispensesControlled: boolean;
    priceInPaise: number | null;
    mrpInPaise: number | null;
    pricePublished: boolean;
    taxRateBps: number | null;
    stockStatus: CatalogueOffer["stockStatus"];
    stockQuantity: number | null;
    deliveryEtaMinutes: number | null;
    maxPerOrder: number | null;
    /** True only when the offer is priced, in stock and from a live verified pharmacy. */
    orderable: boolean;
    reason: string | null;
  }[];
  equivalents: { id: string; relationship: string; note: string | null; product: { slug: string; brandName: string; genericName: string; strengthLabel: string } }[];
  related: CatalogueProduct[];
};

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const product = await prisma.medicineProduct.findFirst({
    where: { ...LISTABLE_PRODUCT_WHERE, slug },
    select: {
      id: true,
      slug: true,
      brandName: true,
      genericName: true,
      strengthLabel: true,
      dosageForm: true,
      packSizeLabel: true,
      unitsPerPack: true,
      manufacturer: true,
      manufacturerCountry: true,
      drugCode: true,
      scheduleClass: true,
      prescriptionRequired: true,
      isControlled: true,
      categorySlug: true,
      description: true,
      usesSummary: true,
      commonSideEffects: true,
      storageNotes: true,
      warnings: true,
      imageUrl: true,
      offers: {
        where: { isActive: true },
        select: {
          ...OFFER_SELECT,
          pharmacyProfileId: true,
          pharmacy: {
            select: {
              id: true,
              tradeName: true,
              legalName: true,
              verificationStatus: true,
              status: true,
              canDispenseControlledMedicines: true,
              homeDeliveryAvailable: true,
            },
          },
        },
        orderBy: [{ pricePublished: "desc" }, { priceInPaise: "asc" }],
      },
      equivalents: {
        where: { verificationStatus: "VERIFIED" },
        select: {
          id: true,
          relationship: true,
          note: true,
          relatedProduct: { select: { slug: true, brandName: true, genericName: true, strengthLabel: true } },
        },
      },
    },
  });

  if (!product) return null;

  const offers = product.offers.map((offer) => {
    const pharmacyLive = offer.pharmacy.verificationStatus === "VERIFIED" && offer.pharmacy.status === "APPROVED";
    const pharmacyName = offer.pharmacy.tradeName ?? offer.pharmacy.legalName;
    let orderable = true;
    let reason: string | null = null;

    if (!pharmacyLive) {
      orderable = false;
      reason = "This pharmacy is not verified to sell on ORVEXA yet.";
    } else if (!offer.pricePublished) {
      orderable = false;
      reason = "This pharmacy has not published a price. Ask them for a quote.";
    } else if (offer.stockStatus === "OUT_OF_STOCK") {
      orderable = false;
      reason = "This pharmacy is out of stock.";
    } else if (offer.stockStatus === "DISCONTINUED") {
      orderable = false;
      reason = "This pharmacy has discontinued this medicine.";
    } else if (product.isControlled && !offer.pharmacy.canDispenseControlledMedicines) {
      orderable = false;
      reason = "This pharmacy is not licensed to dispense controlled medicines.";
    }

    return {
      id: offer.id,
      pharmacyProfileId: offer.pharmacyProfileId,
      pharmacyName,
      pharmacyVerified: pharmacyLive,
      pharmacyDispensesControlled: offer.pharmacy.canDispenseControlledMedicines,
      priceInPaise: offer.pricePublished ? offer.priceInPaise : null,
      mrpInPaise: offer.mrpInPaise,
      pricePublished: offer.pricePublished,
      taxRateBps: offer.taxRateBps,
      stockStatus: offer.stockStatus,
      stockQuantity: offer.stockQuantity,
      deliveryEtaMinutes: offer.deliveryEtaMinutes,
      maxPerOrder: offer.maxPerOrder,
      orderable,
      reason,
    };
  });

  const related = await prisma.medicineProduct.findMany({
    where: { ...LISTABLE_PRODUCT_WHERE, categorySlug: product.categorySlug, id: { not: product.id } },
    select: {
      id: true,
      slug: true,
      brandName: true,
      genericName: true,
      strengthLabel: true,
      dosageForm: true,
      packSizeLabel: true,
      manufacturer: true,
      scheduleClass: true,
      prescriptionRequired: true,
      isControlled: true,
      categorySlug: true,
      imageUrl: true,
      offers: {
        where: { isActive: true, pharmacy: LIVE_PHARMACY_WHERE },
        select: OFFER_SELECT,
        orderBy: { priceInPaise: "asc" },
      },
    },
    take: 6,
  });

  return {
    product: {
      id: product.id,
      slug: product.slug,
      brandName: product.brandName,
      genericName: product.genericName,
      strengthLabel: product.strengthLabel,
      dosageForm: product.dosageForm,
      packSizeLabel: product.packSizeLabel,
      unitsPerPack: product.unitsPerPack,
      manufacturer: product.manufacturer,
      manufacturerCountry: product.manufacturerCountry,
      drugCode: product.drugCode,
      scheduleClass: product.scheduleClass,
      prescriptionRequired: product.prescriptionRequired,
      isControlled: product.isControlled,
      categorySlug: product.categorySlug,
      description: product.description,
      usesSummary: product.usesSummary,
      commonSideEffects: product.commonSideEffects,
      storageNotes: product.storageNotes,
      warnings: product.warnings,
      imageUrl: product.imageUrl,
    },
    offers,
    equivalents: product.equivalents.map((equivalent) => ({
      id: equivalent.id,
      relationship: equivalent.relationship,
      note: equivalent.note,
      product: equivalent.relatedProduct,
    })),
    related: related.map((row) => ({
      id: row.id,
      slug: row.slug,
      brandName: row.brandName,
      genericName: row.genericName,
      strengthLabel: row.strengthLabel,
      dosageForm: row.dosageForm,
      packSizeLabel: row.packSizeLabel,
      manufacturer: row.manufacturer,
      scheduleClass: row.scheduleClass,
      prescriptionRequired: row.prescriptionRequired,
      isControlled: row.isControlled,
      categorySlug: row.categorySlug,
      imageUrl: row.imageUrl,
      lowestOffer: cheapestOffer(row.offers as CatalogueOffer[]),
    })),
  };
}

// ---------------------------------------------------------------------------
// Categories and suggestions
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<{ slug: string; count: number }[]> {
  const grouped = await prisma.medicineProduct.groupBy({
    by: ["categorySlug"],
    where: LISTABLE_PRODUCT_WHERE,
    _count: { _all: true },
  });
  return grouped
    .map((row) => ({ slug: row.categorySlug, count: row._count._all }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function searchSuggestions(
  query: string,
  limit = 6,
): Promise<{ slug: string; brandName: string; genericName: string; strengthLabel: string }[]> {
  const needle = query.trim();
  if (needle.length < 2) return [];
  return prisma.medicineProduct.findMany({
    where: {
      ...LISTABLE_PRODUCT_WHERE,
      OR: [
        { brandName: { contains: needle, mode: "insensitive" } },
        { genericName: { contains: needle, mode: "insensitive" } },
      ],
    },
    select: { slug: true, brandName: true, genericName: true, strengthLabel: true },
    take: Math.max(1, Math.min(limit, 10)),
    orderBy: { brandName: "asc" },
  });
}
