/**
 * Map provider configuration.
 *
 * Client-safe by design: the values here are a public map token (Mapbox public
 * tokens and Geoapify browser keys are designed to be embedded in a page) and
 * presentation defaults. Anything used for server-side geocoding or directions
 * is read in `src/lib/env.ts` and never reaches this module.
 *
 * When no provider is configured the app must not pretend a map exists. Every
 * consumer checks `isMapConfigured()` and falls back to the address search and
 * the listed nearby facilities, which come from our own database.
 */

export type MapsProvider = "mapbox" | "google" | "geoapify";

export type MapConfig = {
  provider: MapsProvider | null;
  /** Public Mapbox style token or Geoapify tile key. */
  accessToken: string | null;
  /** Mapbox style URL. */
  style: string | null;
  defaultCenter: { latitude: number; longitude: number };
  defaultZoom: number;
  /**
   * 3D needs a provider that supports terrain and a device that can render it.
   * The UI always keeps a 2D view as the default and as the fallback.
   */
  supports3d: boolean;
};

function readProvider(): MapsProvider | null {
  const configured = process.env.NEXT_PUBLIC_MAPS_PROVIDER?.trim().toLowerCase();
  if (configured === "mapbox" || configured === "google" || configured === "geoapify") return configured;
  if (process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || process.env.GEOAPIFY_API_KEY) return "geoapify";
  return null;
}

function readToken() {
  const token = (
    process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY ||
    process.env.NEXT_PUBLIC_MAPS_ACCESS_TOKEN ||
    process.env.GEOAPIFY_API_KEY
  )?.trim();
  return token && token !== "" ? token : null;
}

/**
 * "lng,lat" — the order Mapbox and Google both use in URLs, so the same string
 * can be pasted into either provider's documentation.
 */
function readDefaultCenter() {
  const configured = process.env.NEXT_PUBLIC_MAPS_DEFAULT_CENTER?.trim();
  if (configured) {
    const [lng, lat] = configured.split(",").map((part) => Number.parseFloat(part.trim()));
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { latitude: lat, longitude: lng };
  }
  // Bengaluru — the platform's operating base. Only a starting viewport.
  return { latitude: 12.9716, longitude: 77.5946 };
}

function readDefaultZoom() {
  const zoom = Number.parseFloat(process.env.NEXT_PUBLIC_MAPS_DEFAULT_ZOOM ?? "");
  return Number.isFinite(zoom) ? Math.min(Math.max(zoom, 1), 20) : 11;
}

export const mapConfig: MapConfig = (() => {
  const provider = readProvider();
  const accessToken = readToken();
  const defaultStyle =
    process.env.NEXT_PUBLIC_MAPS_STYLE_URL?.trim() ||
    (provider === "geoapify" && accessToken
      ? `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${accessToken}`
      : null);

  return {
    provider,
    accessToken,
    style: defaultStyle,
    defaultCenter: readDefaultCenter(),
    defaultZoom: readDefaultZoom(),
    supports3d: provider === "mapbox",
  };
})();

/** An interactive map is only implemented for Mapbox and Geoapify. */
export function isMapConfigured(config: MapConfig = mapConfig) {
  return Boolean(
    config.accessToken && (config.provider === "mapbox" || config.provider === "geoapify"),
  );
}

/** Human-readable provider name for attribution and the "not configured" state. */
export function mapProviderLabel(config: MapConfig = mapConfig) {
  if (!config.provider) return "Mapping provider not configured";
  if (config.provider === "mapbox") return "Mapbox";
  if (config.provider === "geoapify") return "Geoapify";
  return "Google Maps";
}

/**
 * Tile URL template for Geoapify map tiles (OSM-based, no extra SDK required).
 * Returns null when the provider is not Geoapify.
 */
export function geoapifyTileUrl(config: MapConfig = mapConfig): string | null {
  if (config.provider !== "geoapify" || !config.accessToken) return null;
  // Geoapify OSM Carto style – change the style slug to switch themes.
  return `https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=${config.accessToken}`;
}

/**
 * Attribution text that must be visible whenever provider tiles are shown. Both
 * providers require it in their terms; omitting it is a licence violation, so it
 * is rendered next to every map and never behind a toggle.
 */
export function mapAttribution(config: MapConfig = mapConfig) {
  if (!config.provider) return null;
<<<<<<< HEAD
  if (config.provider === "geoapify") {
    return "Powered by Geoapify | © OpenStreetMap contributors";
  }
  return config.provider === "mapbox"
    ? "© Mapbox © OpenStreetMap"
    : "© Google Maps";
=======
  if (config.provider === "mapbox") return "© Mapbox © OpenStreetMap";
  if (config.provider === "geoapify") return "© Geoapify © OpenStreetMap contributors";
  return "© Google Maps";
>>>>>>> 00c6be6 (Updated project features)
}

/** Opens the device's own maps app for turn-by-turn directions to a point. */
export function externalDirectionsUrl(
  destination: { latitude: number; longitude: number },
  origin?: { latitude: number; longitude: number } | null,
  mode: TravelMode = "driving",
) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: mode,
  });
  if (origin) params.set("origin", `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Travel modes both providers support for directions previews. */
export type TravelMode = "driving" | "walking" | "cycling" | "transit";

export const TRAVEL_MODES: { id: TravelMode; label: string }[] = [
  { id: "driving", label: "Ambulance / car" },
  { id: "walking", label: "On foot" },
  { id: "cycling", label: "Two-wheeler / cycle" },
  { id: "transit", label: "Public transport" },
];
