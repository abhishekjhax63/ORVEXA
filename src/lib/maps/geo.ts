/**
 * Geographic helpers.
 *
 * Pure functions with no provider and no environment dependency, so both the
 * server and the map component can share them and they can be unit tested
 * without a network. Distances are computed here only for ranking and display;
 * anything shown as a *route* distance comes back from the provider (see
 * `src/lib/maps/provider.ts`) because a straight line is not a road.
 */

export type Coordinates = {
  latitude: number;
  longitude: number;
};

/** Mean earth radius in metres (IUGG). */
const EARTH_RADIUS_METRES = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function isValidCoordinates(value: { latitude: unknown; longitude: unknown }): boolean {
  const { latitude, longitude } = value;
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Great-circle distance in metres. Used for ranking, never for a quoted ETA. */
export function haversineMetres(from: Coordinates, to: Coordinates): number {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function boundingBox(center: Coordinates, radiusMetres: number) {
  const latDelta = (radiusMetres / EARTH_RADIUS_METRES) * (180 / Math.PI);
  const cosLat = Math.cos(toRadians(center.latitude));
  // Guard against a pole where the longitude span would divide by ~zero.
  const lngDelta = cosLat > 0.01 ? latDelta / cosLat : 180;
  return {
    minLatitude: Math.max(center.latitude - latDelta, -90),
    maxLatitude: Math.min(center.latitude + latDelta, 90),
    minLongitude: Math.max(center.longitude - lngDelta, -180),
    maxLongitude: Math.min(center.longitude + lngDelta, 180),
  };
}

export function boundingBoxCenter(box: ReturnType<typeof boundingBox>): Coordinates {
  return {
    latitude: (box.minLatitude + box.maxLatitude) / 2,
    longitude: (box.minLongitude + box.maxLongitude) / 2,
  };
}

/**
 * Distance for display. Sub-kilometre distances stay in metres because "0.4 km"
 * is harder to act on than "400 m" when you are deciding whether to walk.
 */
export function formatDistance(metres: number | null | undefined): string {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return "Distance unavailable";
  if (metres < 950) return `${Math.round(metres / 10) * 10} m away`;
  return `${(metres / 1000).toFixed(1)} km away`;
}

/** Duration for display, from a provider-reported figure. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "Time unavailable";
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

/**
 * A deliberately coarse accuracy band. Showing "± 4 m" invites false precision
 * on a device that is usually wrong by far more; the band tells the user whether
 * the fix is good enough to dispatch to.
 */
export type AccuracyBand = "precise" | "approximate" | "coarse" | "unknown";

export function accuracyBand(accuracyMetres: number | null | undefined): AccuracyBand {
  if (accuracyMetres === null || accuracyMetres === undefined || !Number.isFinite(accuracyMetres)) return "unknown";
  if (accuracyMetres <= 50) return "precise";
  if (accuracyMetres <= 500) return "approximate";
  return "coarse";
}

export const ACCURACY_COPY: Record<AccuracyBand, string> = {
  precise: "Location is accurate enough to route a vehicle to your door.",
  approximate: "Location is approximate. Add a landmark if you can.",
  coarse: "Location is very approximate — it may only identify the area. Add a landmark and read out the nearest junction.",
  unknown: "Location accuracy was not reported by this device.",
};

/** Rounds to 4 decimals (~11 m) before a coordinate is persisted or displayed. */
export function roundCoordinates(coordinates: Coordinates): Coordinates {
  return {
    latitude: Math.round(coordinates.latitude * 10_000) / 10_000,
    longitude: Math.round(coordinates.longitude * 10_000) / 10_000,
  };
}

/** Rough bounding judgement used to reject obviously spoofed or stale fixes. */
export function isPlausibleJump(from: Coordinates, to: Coordinates, secondsElapsed: number, toleranceMetres = 2_000) {
  if (secondsElapsed <= 0) return true;
  const metres = haversineMetres(from, to);
  const metresPerSecond = metres / secondsElapsed;
  // ~200 km/h plus a tolerance band for GPS noise.
  return metresPerSecond <= 55 || metres <= toleranceMetres;
}
