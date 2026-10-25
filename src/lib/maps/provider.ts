import "server-only";

import { getMapsServerConfig } from "@/lib/env";
import { type Coordinates, isValidCoordinates } from "@/lib/maps/geo";
import type { MapsProvider, TravelMode } from "@/lib/maps/config";

/**
 * Provider-agnostic map lookups.
 *
 * These calls are made from the server so a secret token never reaches the
 * browser, and so every failure mode arrives as a typed value instead of a
 * thrown error the UI has to guess at. The rule for callers: a lookup that is
 * not `ok` must be rendered as a failure state. There is no fallback that
 * fabricates an address, a distance or an ETA.
 *
 * Endpoints used (both are the providers' current documented REST APIs):
 *  - Mapbox  Geocoding v6: /search/geocode/v6/forward and /reverse
 *  - Mapbox  Directions v5: /directions/v5/mapbox/{profile}
 *  - Google  Geocoding API: /maps/api/geocode/json
 *  - Google  Directions API: /maps/api/directions/json
 */

export type MapErrorKind =
  | "not_configured"
  | "no_results"
  | "timeout"
  | "network_error"
  | "rate_limited"
  | "unsupported_mode"
  | "provider_error";

export type MapError = {
  kind: MapErrorKind;
  /** Safe to show to a user; never contains a token or a raw provider payload. */
  message: string;
  /** Upstream HTTP status when one was received. */
  status?: number;
};

export type MapResult<T> = { ok: true; data: T } | { ok: false; error: MapError };

const REQUEST_TIMEOUT_MS = 8_000;

const ERROR_COPY: Record<MapErrorKind, string> = {
  not_configured: "The mapping provider is not configured on this deployment.",
  no_results: "No matching place was found.",
  timeout: "The mapping provider did not respond in time.",
  network_error: "The mapping provider could not be reached. Check the connection and try again.",
  rate_limited: "The mapping provider is rate limiting this deployment. Try again shortly.",
  unsupported_mode: "This travel mode is not available from the configured provider.",
  provider_error: "The mapping provider returned an error.",
};

function failure<T>(kind: MapErrorKind, status?: number): MapResult<T> {
  return { ok: false, error: { kind, message: ERROR_COPY[kind], status } };
}

/**
 * One place of the fetch/parse/error-classify sequence used by every lookup, so
 * a network drop, a DNS failure and a provider 500 all converge on the same
 * typed result instead of escaping as an unhandled rejection.
 */
async function requestJson<T>(url: string, provider: MapsProvider): Promise<MapResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return failure<T>("timeout");
    console.error(`[maps] ${provider} request failed`, error);
    return failure<T>("network_error");
  }

  if (response.status === 429) return failure<T>("rate_limited", 429);
  if (!response.ok) return failure<T>("provider_error", response.status);

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return failure<T>("provider_error", response.status);
  }
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

export type GeocodedPlace = {
  id: string;
  /** Full formatted address for display. */
  label: string;
  /** Short name, e.g. "Cubbon Park". */
  primary: string;
  /** Trailing context, e.g. "Bengaluru, Karnataka". */
  secondary: string | null;
  coordinates: Coordinates;
  /** Provider's own precision hint, passed through verbatim or null. */
  precision: string | null;
  provider: MapsProvider;
};

export type GeocodeOptions = {
  /** Bias results towards a known point — the user's current fix. */
  proximity?: Coordinates | null;
  limit?: number;
  /** ISO 3166-1 alpha-2 filter. Defaults to IN for this deployment. */
  country?: string | null;
  signal?: AbortSignal;
};

function buildUrl(base: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return `${base}?${search.toString()}`;
}

/** Forward geocode: address or locality text to candidate places. */
export async function geocodeAddress(query: string, options: GeocodeOptions = {}): Promise<MapResult<GeocodedPlace[]>> {
  const config = getMapsServerConfig();
  if (!config) return failure<GeocodedPlace[]>("not_configured");
  const trimmed = query.trim();
  if (trimmed.length < 3) return failure<GeocodedPlace[]>("no_results");

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const proximity = options.proximity && isValidCoordinates(options.proximity) ? options.proximity : null;
  const country = options.country === null ? undefined : (options.country ?? "in");

  if (config.provider === "mapbox") {
    const url = buildUrl("https://api.mapbox.com/search/geocode/v6/forward", {
      q: trimmed,
      access_token: config.secretToken,
      limit,
      country,
      proximity: proximity ? `${proximity.longitude},${proximity.latitude}` : undefined,
      language: "en",
    });
    const result = await requestJson<MapboxForwardResponse>(url, "mapbox");
    if (!result.ok) return result;
    const places = (result.data.features ?? [])
      .map((feature) => mapboxPlace(feature))
      .filter((place): place is GeocodedPlace => place !== null);
    return places.length > 0 ? { ok: true, data: places } : failure<GeocodedPlace[]>("no_results");
  }

  if (config.provider === "geoapify") {
    const url = buildUrl("https://api.geoapify.com/v1/geocode/search", {
      text: trimmed,
      apiKey: config.secretToken,
      limit,
      filter: country ? `countrycode:${country.toLowerCase()}` : undefined,
      bias: proximity ? `proximity:${proximity.longitude},${proximity.latitude}` : undefined,
      lang: "en",
    });
    const result = await requestJson<GeoapifyGeocodeResponse>(url, "geoapify");
    if (!result.ok) return result;
    if (!Array.isArray(result.data.features)) return failure<GeocodedPlace[]>("provider_error");
    const places = result.data.features.map(geoapifyPlace).filter((place): place is GeocodedPlace => place !== null);
    return places.length > 0 ? { ok: true, data: places } : failure<GeocodedPlace[]>("no_results");
  }

  const url = buildUrl("https://maps.googleapis.com/maps/api/geocode/json", {
    address: trimmed,
    key: config.secretToken,
    components: country ? `country:${country.toUpperCase()}` : undefined,
    language: "en",
  });
  const result = await requestJson<GoogleGeocodeResponse>(url, "google");
  if (!result.ok) return result;
  if (result.data.status === "ZERO_RESULTS") return failure<GeocodedPlace[]>("no_results");
  if (result.data.status !== "OK") return failure<GeocodedPlace[]>("provider_error");
  const places = (result.data.results ?? []).slice(0, limit).map(googlePlace).filter(Boolean) as GeocodedPlace[];
  return places.length > 0 ? { ok: true, data: places } : failure<GeocodedPlace[]>("no_results");
}

/** Reverse geocode: coordinates to the nearest addressable place. */
export async function reverseGeocode(coordinates: Coordinates): Promise<MapResult<GeocodedPlace>> {
  const config = getMapsServerConfig();
  if (!config) return failure<GeocodedPlace>("not_configured");
  if (!isValidCoordinates(coordinates)) return failure<GeocodedPlace>("provider_error");

  if (config.provider === "mapbox") {
    const url = buildUrl("https://api.mapbox.com/search/geocode/v6/reverse", {
      longitude: coordinates.longitude,
      latitude: coordinates.latitude,
      access_token: config.secretToken,
      limit: 1,
      language: "en",
    });
    const result = await requestJson<MapboxForwardResponse>(url, "mapbox");
    if (!result.ok) return result;
    const place = result.data.features?.[0] ? mapboxPlace(result.data.features[0]) : null;
    return place ? { ok: true, data: place } : failure<GeocodedPlace>("no_results");
  }

  if (config.provider === "geoapify") {
    const url = buildUrl("https://api.geoapify.com/v1/geocode/reverse", {
      lat: coordinates.latitude,
      lon: coordinates.longitude,
      apiKey: config.secretToken,
      lang: "en",
    });
    const result = await requestJson<GeoapifyGeocodeResponse>(url, "geoapify");
    if (!result.ok) return result;
    if (!Array.isArray(result.data.features)) return failure<GeocodedPlace>("provider_error");
    const place = result.data.features[0] ? geoapifyPlace(result.data.features[0]) : null;
    return place ? { ok: true, data: place } : failure<GeocodedPlace>("no_results");
  }

  const url = buildUrl("https://maps.googleapis.com/maps/api/geocode/json", {
    latlng: `${coordinates.latitude},${coordinates.longitude}`,
    key: config.secretToken,
    language: "en",
  });
  const result = await requestJson<GoogleGeocodeResponse>(url, "google");
  if (!result.ok) return result;
  if (result.data.status === "ZERO_RESULTS") return failure<GeocodedPlace>("no_results");
  if (result.data.status !== "OK") return failure<GeocodedPlace>("provider_error");
  const place = result.data.results?.[0] ? googlePlace(result.data.results[0]) : null;
  return place ? { ok: true, data: place } : failure<GeocodedPlace>("no_results");
}

// ---------------------------------------------------------------------------
// Directions
// ---------------------------------------------------------------------------

export type RouteStep = {
  instruction: string;
  distanceMetres: number;
  durationSeconds: number;
};

export type RouteResult = {
  provider: MapsProvider;
  mode: TravelMode;
  /** Road distance reported by the provider. Not the straight-line distance. */
  distanceMetres: number;
  durationSeconds: number;
  /** Route geometry as [longitude, latitude] pairs, ready for GeoJSON. */
  geometry: [number, number][];
  steps: RouteStep[];
};

const MAPBOX_PROFILES: Record<TravelMode, string | null> = {
  driving: "driving-traffic",
  walking: "walking",
  cycling: "cycling",
  // Mapbox Directions has no public transit profile.
  transit: null,
};

const GOOGLE_MODES: Record<TravelMode, string> = {
  driving: "driving",
  walking: "walking",
  cycling: "bicycling",
  transit: "transit",
};

const GEOAPIFY_MODES: Record<TravelMode, string | null> = {
  driving: "drive",
  walking: "walk",
  cycling: "bicycle",
  transit: null,
};

export async function fetchRoute(
  origin: Coordinates,
  destination: Coordinates,
  mode: TravelMode = "driving",
): Promise<MapResult<RouteResult>> {
  const config = getMapsServerConfig();
  if (!config) return failure<RouteResult>("not_configured");
  if (!isValidCoordinates(origin) || !isValidCoordinates(destination)) return failure<RouteResult>("provider_error");

  if (config.provider === "mapbox") {
    const profile = MAPBOX_PROFILES[mode];
    if (!profile) return failure<RouteResult>("unsupported_mode");
    const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = buildUrl(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}`, {
      access_token: config.secretToken,
      geometries: "geojson",
      overview: "full",
      steps: "true",
      language: "en",
    });
    const result = await requestJson<MapboxDirectionsResponse>(url, "mapbox");
    if (!result.ok) return result;
    if (result.data.code !== "Ok" || !result.data.routes?.length) return failure<RouteResult>("no_results");
    const route = result.data.routes[0];
    return {
      ok: true,
      data: {
        provider: "mapbox",
        mode,
        distanceMetres: route.distance,
        durationSeconds: route.duration,
        geometry: (route.geometry?.coordinates ?? []) as [number, number][],
        steps: (route.legs ?? []).flatMap((leg) =>
          (leg.steps ?? []).map((step) => ({
            instruction: step.maneuver?.instruction ?? "Continue",
            distanceMetres: step.distance,
            durationSeconds: step.duration,
          })),
        ),
      },
    };
  }

  if (config.provider === "google") {
    const url = buildUrl("https://maps.googleapis.com/maps/api/directions/json", {
      origin: `${origin.latitude},${origin.longitude}`,
      destination: `${destination.latitude},${destination.longitude}`,
      mode: GOOGLE_MODES[mode],
      key: config.secretToken,
      language: "en",
    });
    const result = await requestJson<GoogleDirectionsResponse>(url, "google");
    if (!result.ok) return result;
    if (result.data.status === "ZERO_RESULTS") return failure<RouteResult>("no_results");
    if (result.data.status !== "OK" || !result.data.routes?.length) return failure<RouteResult>("provider_error");
    const route = result.data.routes[0];
    const legs = route.legs ?? [];
    return {
      ok: true,
      data: {
        provider: "google",
        mode,
        distanceMetres: legs.reduce((total, leg) => total + (leg.distance?.value ?? 0), 0),
        durationSeconds: legs.reduce((total, leg) => total + (leg.duration?.value ?? 0), 0),
        geometry: decodePolyline(route.overview_polyline?.points ?? ""),
        steps: legs.flatMap((leg) =>
          (leg.steps ?? []).map((step) => ({
            instruction: stripHtml(step.html_instructions ?? "Continue"),
            distanceMetres: step.distance?.value ?? 0,
            durationSeconds: step.duration?.value ?? 0,
          })),
        ),
      },
    };
  }

  const providerMode = GEOAPIFY_MODES[mode];
  if (!providerMode) return failure<RouteResult>("unsupported_mode");
  const url = buildUrl("https://api.geoapify.com/v1/routing", {
    waypoints: `${origin.latitude},${origin.longitude}|${destination.latitude},${destination.longitude}`,
    mode: providerMode,
    details: "instruction_details",
    apiKey: config.secretToken,
    lang: "en",
  });
  const result = await requestJson<GeoapifyRouteResponse>(url, "geoapify");
  if (!result.ok) return result;
  const route = result.data.features?.[0];
  const properties = route?.properties;
  if (
    !route ||
    typeof properties?.distance !== "number" ||
    typeof properties.time !== "number" ||
    !Array.isArray(route.geometry?.coordinates)
  ) {
    return failure<RouteResult>("no_results");
  }

  const geometry = route.geometry.coordinates.filter(
    (coordinate): coordinate is [number, number] =>
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      Number.isFinite(coordinate[0]) &&
      Number.isFinite(coordinate[1]),
  );

  return {
    ok: true,
    data: {
      provider: "geoapify",
      mode,
      distanceMetres: properties.distance,
      durationSeconds: properties.time,
      geometry,
      steps: (properties.legs ?? []).flatMap((leg) =>
        (leg.steps ?? []).map((step) => ({
          instruction: step.instruction?.text ?? step.instructions?.text ?? "Continue",
          distanceMetres: typeof step.distance === "number" ? step.distance : 0,
          durationSeconds: typeof step.time === "number" ? step.time : 0,
        })),
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Provider payload mapping
// ---------------------------------------------------------------------------

type MapboxForwardResponse = {
  features?: {
    id?: string;
    geometry?: { coordinates?: [number, number] };
    properties?: {
      name?: string;
      name_preferred?: string;
      full_address?: string;
      place_formatted?: string;
      coordinates?: { longitude?: number; latitude?: number; accuracy?: string };
      mapbox_id?: string;
    };
  }[];
};

type MapboxDirectionsResponse = {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: { coordinates?: number[][] };
    legs?: {
      steps?: { distance: number; duration: number; maneuver?: { instruction?: string } }[];
    }[];
  }[];
};

type GoogleGeocodeResponse = {
  status?: string;
  results?: {
    place_id?: string;
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
    address_components?: { long_name?: string; short_name?: string; types?: string[] }[];
  }[];
};

type GoogleDirectionsResponse = {
  status?: string;
  routes?: {
    overview_polyline?: { points?: string };
    legs?: {
      distance?: { value?: number };
      duration?: { value?: number };
      steps?: {
        html_instructions?: string;
        distance?: { value?: number };
        duration?: { value?: number };
      }[];
    }[];
  }[];
};

type GeoapifyRouteResponse = {
  features?: {
    geometry?: { coordinates?: number[][] };
    properties?: {
      distance?: number;
      time?: number;
      legs?: {
        steps?: {
          instruction?: { text?: string };
          instructions?: { text?: string };
          distance?: number;
          time?: number;
        }[];
      }[];
    };
  }[];
};

function geoapifyPlace(feature: NonNullable<GeoapifyGeocodeResponse["features"]>[number]): GeocodedPlace | null {
  const properties = feature.properties;
  const latitude = properties?.lat ?? feature.geometry?.coordinates?.[1];
  const longitude = properties?.lon ?? feature.geometry?.coordinates?.[0];
  if (typeof latitude !== "number" || typeof longitude !== "number" || !isValidCoordinates({ latitude, longitude })) {
    return null;
  }

  const primary = properties?.name ?? properties?.address_line1 ?? properties?.formatted ?? "Unnamed place";
  const secondary =
    properties?.address_line2 ??
    [properties?.city, properties?.state].filter((value, index, values) => value && values.indexOf(value) === index).join(", ");

  return {
    id: properties?.place_id ?? `${longitude},${latitude}`,
    label: properties?.formatted ?? primary,
    primary,
    secondary: secondary || null,
    coordinates: { latitude, longitude },
    precision: properties?.result_type ?? properties?.rank?.match_type ?? null,
    provider: "geoapify",
  };
}

function mapboxPlace(feature: NonNullable<MapboxForwardResponse["features"]>[number]): GeocodedPlace | null {
  const properties = feature.properties;
  const coordinates = properties?.coordinates;
  const latitude = coordinates?.latitude ?? feature.geometry?.coordinates?.[1];
  const longitude = coordinates?.longitude ?? feature.geometry?.coordinates?.[0];
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;

  const name = properties?.name_preferred ?? properties?.name ?? properties?.full_address ?? "Unnamed place";
  return {
    id: properties?.mapbox_id ?? feature.id ?? `${longitude},${latitude}`,
    label: properties?.full_address ?? properties?.place_formatted ?? name,
    primary: name,
    secondary: properties?.place_formatted ?? null,
    coordinates: { latitude, longitude },
    precision: coordinates?.accuracy ?? null,
    provider: "mapbox",
  };
}

function googlePlace(result: NonNullable<GoogleGeocodeResponse["results"]>[number]): GeocodedPlace | null {
  const latitude = result.geometry?.location?.lat;
  const longitude = result.geometry?.location?.lng;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;

  const components = result.address_components ?? [];
  const shortName = components.find((component) => component.types?.includes("sublocality"))?.long_name;
  const locality = components.find((component) => component.types?.includes("locality"))?.long_name;
  const secondary = [locality, components.find((c) => c.types?.includes("administrative_area_level_1"))?.long_name]
    .filter(Boolean)
    .join(", ");

  return {
    id: result.place_id ?? `${longitude},${latitude}`,
    label: result.formatted_address ?? "Unnamed place",
    primary: shortName ?? locality ?? result.formatted_address ?? "Unnamed place",
    secondary: secondary || null,
    coordinates: { latitude, longitude },
    precision: result.geometry?.location_type ?? null,
    provider: "google",
  };
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Google returns route geometry as an encoded polyline rather than coordinates.
 * The decoding algorithm is published and stable; precision 5 is what the
 * Directions API emits.
 */
export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  if (!encoded) return [];
  const factor = 10 ** precision;
  const points: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([longitude / factor, latitude / factor]);
  }

  return points;
}

// ---------------------------------------------------------------------------
// Geoapify Types & Facilities Discovery
// ---------------------------------------------------------------------------

export type GeoapifyFacility = {
  id: string;
  name: string;
  address: string;
  distanceMetres: number;
  coordinates: Coordinates;
  phone: string | null;
  website: string | null;
  emergency: boolean;
  categories: string[];
  isMapListing: true;
  verificationStatus: "Verification not confirmed";
  source: string;
};

export type GeoapifyGeocodeResponse = {
  features?: {
    properties?: {
      place_id?: string;
      formatted?: string;
      name?: string;
      address_line1?: string;
      address_line2?: string;
      city?: string;
      state?: string;
      country?: string;
      lat?: number;
      lon?: number;
      result_type?: string;
      rank?: { match_type?: string };
    };
    geometry?: {
      coordinates?: [number, number];
    };
  }[];
};

export type GeoapifyPlacesResponse = {
  features?: {
    properties?: {
      place_id?: string;
      name?: string;
      formatted?: string;
      address_line1?: string;
      address_line2?: string;
      city?: string;
      lat?: number;
      lon?: number;
      distance?: number;
      categories?: string[];
      contact?: { phone?: string; website?: string };
      datasource?: { raw?: { phone?: string; website?: string; emergency?: string } };
    };
    geometry?: {
      coordinates?: [number, number];
    };
  }[];
};

/**
 * Searches for nearby hospitals and clinics using Geoapify Places API.
 * Results are explicitly marked as "Verification not confirmed" with source attribution
 * so raw map listings are never confused with official accreditation.
 */
export async function searchNearbyHealthcareGeoapify(
  coordinates: Coordinates,
  options: { radiusMetres?: number; limit?: number; category?: string } = {},
): Promise<MapResult<GeoapifyFacility[]>> {
  const config = getMapsServerConfig();
  if (!config) return failure<GeoapifyFacility[]>("not_configured");
  if (!isValidCoordinates(coordinates)) return failure<GeoapifyFacility[]>("provider_error");

  const radius = Math.min(Math.max(options.radiusMetres ?? 15_000, 1_000), 50_000);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const categories = options.category ?? "healthcare.hospital,healthcare.clinic";

  const url = buildUrl("https://api.geoapify.com/v2/places", {
    categories,
    filter: `circle:${coordinates.longitude},${coordinates.latitude},${radius}`,
    bias: `proximity:${coordinates.longitude},${coordinates.latitude}`,
    limit,
    apiKey: config.secretToken,
  });

  const result = await requestJson<GeoapifyPlacesResponse>(url, "geoapify");
  if (!result.ok) return result;

  const facilities: GeoapifyFacility[] = (result.data.features ?? []).map((feature) => {
    const p = feature.properties ?? {};
    const lat = p.lat ?? feature.geometry?.coordinates?.[1] ?? coordinates.latitude;
    const lon = p.lon ?? feature.geometry?.coordinates?.[0] ?? coordinates.longitude;
    const name = p.name ?? p.address_line1 ?? "Healthcare Facility";
    const address = p.formatted ?? ([p.address_line1, p.address_line2].filter(Boolean).join(", ") || "Address unavailable");

    // Distance calculation
    const deltaLat = ((lat - coordinates.latitude) * Math.PI) / 180;
    const deltaLng = ((lon - coordinates.longitude) * Math.PI) / 180;
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos((coordinates.latitude * Math.PI) / 180) *
        Math.cos((lat * Math.PI) / 180) *
        Math.sin(deltaLng / 2) ** 2;
    const haversineDist = Math.round(2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(a))));

    const distanceMetres = p.distance ?? haversineDist;

    return {
      id: p.place_id ?? `geoapify-${lon}-${lat}`,
      name,
      address,
      distanceMetres,
      coordinates: { latitude: lat, longitude: lon },
      phone: p.contact?.phone ?? p.datasource?.raw?.phone ?? null,
      website: p.contact?.website ?? p.datasource?.raw?.website ?? null,
      emergency: (p.categories ?? []).includes("healthcare.hospital") || p.datasource?.raw?.emergency === "yes",
      categories: p.categories ?? ["healthcare"],
      isMapListing: true,
      verificationStatus: "Verification not confirmed",
      source: "Geoapify / OpenStreetMap Healthcare Directory",
    };
  });

  facilities.sort((a, b) => a.distanceMetres - b.distanceMetres);
  return { ok: true, data: facilities };
}

