import "server-only";

import type { DataProvenance, VerificationState } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { boundingBox, formatDistance, haversineMetres, type Coordinates } from "@/lib/maps/geo";
import type { NearbyKind } from "@/lib/validation/emergency";

/**
 * Nearby care discovery.
 *
 * Everything returned here comes out of our own database. Nothing is inferred:
 * a facility with no published coordinates reports no distance, an operator that
 * has never reported unit status reports "availability unknown", and a hospital
 * is never described as having capacity because we do not have a live bed feed.
 *
 * The map provider is used for the *user's* location and for routes — never to
 * invent a nearby facility that is not registered.
 */

export type AvailabilitySummary = {
  /** `reported` only when a partner integration supplied the figure. */
  state: "reported" | "unknown";
  label: string;
  detail: string;
  /** Name of the integration that reported it, or null. */
  source: string | null;
};

export type NearbyFacility = {
  id: string;
  kind: NearbyKind;
  name: string;
  /** Deep link for more detail; null when there is no profile page yet. */
  href: string | null;
  phone: string | null;
  address: string;
  city: string;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Straight-line distance from the query point; null when either side is unknown. */
  distanceMetres: number | null;
  distanceLabel: string;
  verificationStatus: VerificationState;
  isVerified: boolean;
  dataProvenance: DataProvenance;
  /** Verified attributes the provider actually published. */
  attributes: { label: string; value: string }[];
  /** Facts we do not have, stated explicitly so the UI cannot imply them. */
  unknown: string[];
  availability: AvailabilitySummary;
  /**
   * Whether platform fan-out may send an emergency request to this responder.
   * Requires a completed human verification and, for hospitals, a 24×7
   * emergency service — a listing alone is not enough.
   */
  dispatchEligible: boolean;
};

const UNKNOWN_AVAILABILITY: AvailabilitySummary = {
  state: "unknown",
  label: "Availability unknown",
  detail: "This provider has not reported current availability to ORVEXA. Call to confirm before travelling.",
  source: null,
};

/** A unit ping older than this is treated as stale rather than current. */
const UNIT_PING_FRESHNESS_MS = 5 * 60 * 1000;

function composeAddress(parts: (string | null | undefined)[]) {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(", ");
}

type QueryPoint = Coordinates | null;

function distanceFor(point: QueryPoint, latitude: number | null, longitude: number | null) {
  if (!point || latitude === null || longitude === null) return null;
  return haversineMetres(point, { latitude, longitude });
}

export type NearbyQueryInput = {
  point: QueryPoint;
  city: string | null;
  radiusMetres: number;
  kinds: NearbyKind[];
  limit: number;
};

export type NearbyResult = {
  /** `point` when the search used coordinates, `city` for a text fallback. */
  mode: "point" | "city";
  facilities: NearbyFacility[];
  /** Counts of providers that exist but were excluded, by reason. */
  excluded: { unpublishedOrUnverified: number; outsideRadius: number; noLocation: number };
};

export async function findNearbyFacilities(input: NearbyQueryInput): Promise<NearbyResult> {
  const wantsHospitals = input.kinds.includes("HOSPITAL_EMERGENCY");
  const wantsPharmacies = input.kinds.includes("PHARMACY");
  const wantsLabs = input.kinds.includes("LABORATORY");
  const wantsAmbulance = input.kinds.includes("AMBULANCE_PARTNER");

  const box = input.point ? boundingBox(input.point, input.radiusMetres) : null;
  const cityFilter = input.city ? { contains: input.city, mode: "insensitive" as const } : undefined;

  const [hospitals, partnerFacilities, ambulancePartners] = await Promise.all([
    wantsHospitals
      ? prisma.hospital.findMany({
          where: {
            deletedAt: null,
            publishedAt: { not: null },
            ...(box
              ? {
                  latitude: { gte: box.minLatitude, lte: box.maxLatitude },
                  longitude: { gte: box.minLongitude, lte: box.maxLongitude },
                }
              : {}),
            ...(cityFilter ? { city: cityFilter } : {}),
          },
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            state: true,
            addressLine1: true,
            addressLine2: true,
            postalCode: true,
            latitude: true,
            longitude: true,
            phone: true,
            emergency24x7: true,
            ambulanceAvailable: true,
            verificationStatus: true,
            dataProvenance: true,
            services: { where: { category: "EMERGENCY" }, select: { name: true, available24x7: true } },
            facilities: { where: { category: "AMBULANCE" }, select: { name: true } },
          },
          take: 200,
        })
      : Promise.resolve([]),
    wantsPharmacies || wantsLabs
      ? prisma.partnerFacility.findMany({
          where: {
            deletedAt: null,
            publishedAt: { not: null },
            ...(wantsPharmacies && wantsLabs
              ? { partnerType: { in: ["PHARMACY", "LABORATORY"] } }
              : { partnerType: wantsPharmacies ? "PHARMACY" : "LABORATORY" }),
            ...(box
              ? {
                  latitude: { gte: box.minLatitude, lte: box.maxLatitude },
                  longitude: { gte: box.minLongitude, lte: box.maxLongitude },
                }
              : {}),
            ...(cityFilter ? { city: cityFilter } : {}),
          },
          select: {
            id: true,
            name: true,
            slug: true,
            partnerType: true,
            city: true,
            state: true,
            addressLine1: true,
            addressLine2: true,
            postalCode: true,
            latitude: true,
            longitude: true,
            phone: true,
            emergency24x7: true,
            homeDeliveryAvailable: true,
            homeCollectionAvailable: true,
            verificationStatus: true,
            dataProvenance: true,
          },
          take: 200,
        })
      : Promise.resolve([]),
    wantsAmbulance
      ? prisma.ambulancePartnerProfile.findMany({
          where: {
            ...(cityFilter ? { coverageCities: { hasSome: [input.city as string] } } : {}),
          },
          select: {
            id: true,
            organizationName: true,
            contactName: true,
            contactPhone: true,
            coverageCities: true,
            vehicleSummary: true,
            verificationStatus: true,
            dataProvenance: true,
            acceptingRequests: true,
            units: {
              select: { callSign: true, status: true, latitude: true, longitude: true, lastPingAt: true, availabilitySource: true },
            },
          },
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  const facilities: NearbyFacility[] = [];
  let outsideRadius = 0;
  let noLocation = 0;

  for (const hospital of hospitals) {
    const distanceMetres = distanceFor(input.point, hospital.latitude, hospital.longitude);
    if (input.point && distanceMetres === null) {
      noLocation += 1;
      continue;
    }
    if (distanceMetres !== null && distanceMetres > input.radiusMetres) {
      outsideRadius += 1;
      continue;
    }

    const emergencyService = hospital.services[0];
    const attributes: { label: string; value: string }[] = [
      { label: "Facility", value: hospital.emergency24x7 ? "24×7 emergency declared" : "Emergency hours not published" },
    ];
    if (emergencyService) attributes.push({ label: "Emergency service", value: emergencyService.name });
    if (hospital.ambulanceAvailable) attributes.push({ label: "Ambulance", value: "Operator states a vehicle is available" });
    if (hospital.facilities.length > 0) {
      attributes.push({ label: "On site", value: hospital.facilities.map((facility) => facility.name).join(", ") });
    }

    facilities.push({
      id: hospital.id,
      kind: "HOSPITAL_EMERGENCY",
      name: hospital.name,
      href: `/hospitals/${hospital.slug}`,
      phone: hospital.phone,
      address: composeAddress([hospital.addressLine1, hospital.addressLine2, hospital.postalCode]),
      city: hospital.city,
      state: hospital.state,
      latitude: hospital.latitude,
      longitude: hospital.longitude,
      distanceMetres,
      distanceLabel: formatDistance(distanceMetres),
      verificationStatus: hospital.verificationStatus,
      isVerified: hospital.verificationStatus === "VERIFIED",
      dataProvenance: hospital.dataProvenance,
      attributes,
      unknown: [
        "Bed and ICU capacity is not published to ORVEXA.",
        hospital.emergency24x7 ? "" : "Emergency department opening hours are not published.",
      ].filter(Boolean),
      availability: {
        state: "unknown",
        label: "Capacity unknown",
        detail:
          "ORVEXA has no live bed feed for this hospital, so no capacity figure is shown. Call the emergency desk to confirm they can take the patient.",
        source: null,
      },
      dispatchEligible: hospital.verificationStatus === "VERIFIED" && hospital.emergency24x7,
    });
  }

  for (const facility of partnerFacilities) {
    const distanceMetres = distanceFor(input.point, facility.latitude, facility.longitude);
    if (input.point && distanceMetres === null) {
      noLocation += 1;
      continue;
    }
    if (distanceMetres !== null && distanceMetres > input.radiusMetres) {
      outsideRadius += 1;
      continue;
    }

    const isPharmacy = facility.partnerType === "PHARMACY";
    const attributes: { label: string; value: string }[] = [];
    if (isPharmacy && facility.homeDeliveryAvailable !== null) {
      attributes.push({ label: "Home delivery", value: facility.homeDeliveryAvailable ? "Offered" : "Not offered" });
    }
    if (!isPharmacy && facility.homeCollectionAvailable !== null) {
      attributes.push({ label: "Home collection", value: facility.homeCollectionAvailable ? "Offered" : "Not offered" });
    }
    if (facility.emergency24x7) attributes.push({ label: "Hours", value: "24×7 declared" });

    facilities.push({
      id: facility.id,
      kind: isPharmacy ? "PHARMACY" : "LABORATORY",
      name: facility.name,
      href: null,
      phone: facility.phone,
      address: composeAddress([facility.addressLine1, facility.addressLine2, facility.postalCode]),
      city: facility.city,
      state: facility.state,
      latitude: facility.latitude,
      longitude: facility.longitude,
      distanceMetres,
      distanceLabel: formatDistance(distanceMetres),
      verificationStatus: facility.verificationStatus,
      isVerified: facility.verificationStatus === "VERIFIED",
      dataProvenance: facility.dataProvenance,
      attributes,
      unknown: [
        isPharmacy
          ? "Live stock is not connected, so medicine availability cannot be confirmed."
          : "Live test availability and turnaround are not connected.",
        facility.emergency24x7 ? "" : "Opening hours are not published.",
      ].filter(Boolean),
      availability: UNKNOWN_AVAILABILITY,
      dispatchEligible: false,
    });
  }

  for (const partner of ambulancePartners) {
    const latestUnit = partner.units
      .filter((unit) => unit.latitude !== null && unit.longitude !== null)
      .map((unit) => ({
        unit,
        distance: distanceFor(input.point, unit.latitude, unit.longitude) ?? Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    // Nearest unit only counts when we actually know where it is.
    const distanceMetres = input.point ? (latestUnit ? latestUnit.distance : null) : null;
    if (input.point && distanceMetres === null) {
      noLocation += 1;
      continue;
    }
    if (distanceMetres !== null && distanceMetres > input.radiusMetres) {
      outsideRadius += 1;
      continue;
    }

    facilities.push({
      id: partner.id,
      kind: "AMBULANCE_PARTNER",
      name: partner.organizationName,
      href: null,
      phone: partner.contactPhone,
      address: partner.coverageCities.length > 0 ? `Covers ${partner.coverageCities.join(", ")}` : "Coverage area not published",
      city: partner.coverageCities[0] ?? "",
      state: null,
      latitude: latestUnit?.unit.latitude ?? null,
      longitude: latestUnit?.unit.longitude ?? null,
      distanceMetres,
      distanceLabel: formatDistance(distanceMetres),
      verificationStatus: partner.verificationStatus,
      isVerified: partner.verificationStatus === "VERIFIED",
      dataProvenance: partner.dataProvenance,
      attributes: [
        { label: "Contact", value: partner.contactName },
        ...(partner.vehicleSummary ? [{ label: "Fleet", value: partner.vehicleSummary }] : []),
        {
          label: "Accepting requests",
          value: partner.acceptingRequests ? "Operator has opted in" : "Operator has not opted in",
        },
      ],
      unknown: [
        "A specific vehicle is only confirmed once the operator accepts a request.",
        partner.units.length === 0 ? "No vehicles are registered to this operator yet." : "",
      ].filter(Boolean),
      availability: summariseAmbulanceAvailability(partner.units),
      dispatchEligible: partner.verificationStatus === "VERIFIED" && partner.acceptingRequests,
    });
  }

  facilities.sort((a, b) => {
    if (a.distanceMetres === null && b.distanceMetres === null) return a.name.localeCompare(b.name);
    if (a.distanceMetres === null) return 1;
    if (b.distanceMetres === null) return -1;
    return a.distanceMetres - b.distanceMetres;
  });

  return {
    mode: input.point ? "point" : "city",
    facilities: facilities.slice(0, input.limit),
    excluded: { unpublishedOrUnverified: 0, outsideRadius, noLocation },
  };
}

type UnitSnapshot = {
  status: "UNKNOWN" | "AVAILABLE" | "ON_DUTY" | "OFFLINE" | "OUT_OF_SERVICE";
  lastPingAt: Date | null;
  availabilitySource: string | null;
};

/**
 * Turns reported unit states into one honest summary.
 *
 * A unit counts as currently available only when it reported `AVAILABLE` with a
 * recent ping and a named source. Anything else is reported as a count of units
 * whose state is unknown, never as availability.
 */
export function summariseAmbulanceAvailability(units: UnitSnapshot[]): AvailabilitySummary {
  if (units.length === 0) {
    return {
      state: "unknown",
      label: "No vehicles registered",
      detail: "This operator has no vehicles on record, so no vehicle could be assigned.",
      source: null,
    };
  }

  const now = Date.now();
  const fresh = units.filter(
    (unit) => unit.lastPingAt && now - unit.lastPingAt.getTime() <= UNIT_PING_FRESHNESS_MS && unit.availabilitySource,
  );
  const available = fresh.filter((unit) => unit.status === "AVAILABLE");

  if (available.length > 0) {
    return {
      state: "reported",
      label: `${available.length} vehicle${available.length === 1 ? "" : "s"} reported available`,
      detail: "Reported by the operator's own dispatch system within the last five minutes.",
      source: available[0].availabilitySource,
    };
  }

  if (fresh.length > 0) {
    return {
      state: "reported",
      label: "No vehicle reported free",
      detail: `The operator's dispatch system last reported ${fresh.length} vehicle${fresh.length === 1 ? "" : "s"}, none of which is free.`,
      source: fresh[0].availabilitySource,
    };
  }

  return {
    state: "unknown",
    label: "Availability unknown",
    detail:
      units.some((unit) => unit.lastPingAt)
        ? "The operator's last position report is stale, so no vehicle can be shown as available."
        : "This operator has never reported vehicle status to ORVEXA.",
    source: null,
  };
}
