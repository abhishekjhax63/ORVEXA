"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Ambulance,
  Building2,
  CircleAlert,
  Clock,
  Crosshair,
  FlaskConical,
  Info,
  MapPin,
  Navigation,
  PhoneCall,
  Pill,
  Search,
  Siren,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { geoAccuracyBand, useGeolocation } from "@/components/emergency/geolocation";
import type { MapMarker } from "@/components/emergency/map-view";
import {
  externalDirectionsUrl,
  isMapConfigured,
  mapAttribution,
  mapConfig,
  mapProviderLabel,
  TRAVEL_MODES,
  type TravelMode,
} from "@/lib/maps/config";
import { formatDistance, formatDuration, type Coordinates } from "@/lib/maps/geo";
import type { RouteResult } from "@/lib/maps/provider";
import type { AvailabilitySummary, NearbyFacility, NearbyResult } from "@/lib/emergency/nearby";
import { NEARBY_KINDS, type NearbyKind } from "@/lib/validation/emergency";
import { cn } from "@/lib/utils";

/**
 * Nearby emergency care.
 *
 * The list is the product; the map is an enhancement. Every facility shown comes
 * out of ORVEXA's own database, and every fact the database does not hold is
 * printed as missing rather than omitted — a hospital is never shown with a bed
 * count we do not have, and an operator is never shown as available without a
 * fresh, sourced report.
 *
 * Location is only ever requested from a button press, and it is only sent to
 * this deployment's own server. When the map is displayed the tile provider does
 * receive the viewport, which is stated where the map is rendered.
 */

const MapView = dynamic(() => import("@/components/emergency/map-view"), {
  ssr: false,
  loading: () => (
    <div aria-hidden className="h-[22rem] w-full animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />
  ),
});

type GeocodedPlaceView = {
  id: string;
  label: string;
  primary: string;
  secondary: string | null;
  coordinates: Coordinates;
};

type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string; kind?: string; retryAfterSeconds?: number };

type Origin = {
  kind: "device" | "place" | "city";
  coordinates: Coordinates | null;
  label: string;
  accuracyMetres?: number | null;
};

type NearbyPayload = Pick<NearbyResult, "facilities" | "mode" | "excluded">;

const KIND_META: Record<NearbyKind, { label: string; short: string; icon: typeof Building2 }> = {
  HOSPITAL_EMERGENCY: { label: "Hospital emergency department", short: "Hospital", icon: Building2 },
  AMBULANCE_PARTNER: { label: "Registered ambulance operator", short: "Ambulance", icon: Ambulance },
  PHARMACY: { label: "Pharmacy", short: "Pharmacy", icon: Pill },
  LABORATORY: { label: "Laboratory", short: "Lab", icon: FlaskConical },
};

const RADIUS_OPTIONS = [
  { value: 2_000, label: "Within 2 km" },
  { value: 5_000, label: "Within 5 km" },
  { value: 10_000, label: "Within 10 km" },
  { value: 25_000, label: "Within 25 km" },
  { value: 50_000, label: "Within 50 km" },
];

/** Mapbox GL v3 needs WebGL2. Checked on the client, never during render. */
function detectWebgl2() {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

type ApiFailure = { message: string; kind?: string; retryAfterSeconds?: number };

async function fetchJson<T>(url: string, signal: AbortSignal) {
  try {
    const response = await fetch(url, { signal, headers: { accept: "application/json" }, cache: "no-store" });
    const body = (await response.json().catch(() => null)) as (Record<string, unknown> & { error?: string }) | null;

    if (!response.ok) {
      return {
        ok: false as const,
        failure: {
          message: body?.error ?? "The request could not be completed. Try again.",
          kind: typeof body?.kind === "string" ? body.kind : undefined,
          retryAfterSeconds:
            typeof body?.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined,
        },
      };
    }
    return { ok: true as const, data: body as T };
  } catch (error) {
    // An abort is a superseded request, not a failure the user needs to read.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      ok: false as const,
      failure: { message: "The connection dropped before the search finished.", kind: "network_error" },
    };
  }
}

function availabilityTone(availability: AvailabilitySummary) {
  return availability.state === "reported" ? ("success" as const) : ("neutral" as const);
}

export function NearbyExplorer({ className }: { className?: string }) {
  const geolocation = useGeolocation();

  const [origin, setOrigin] = useState<Origin | null>(null);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<LoadState<GeocodedPlaceView[]>>({ status: "idle" });
  const [kinds, setKinds] = useState<NearbyKind[]>([...NEARBY_KINDS]);
  const [radiusMetres, setRadiusMetres] = useState(10_000);
  const [nearby, setNearby] = useState<LoadState<NearbyPayload>>({ status: "idle" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeMode, setRouteMode] = useState<TravelMode>("driving");
  const [route, setRoute] = useState<LoadState<RouteResult>>({ status: "idle" });
  const [threeD, setThreeD] = useState(false);
  const [webgl2, setWebgl2] = useState(false);

  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    setWebgl2(detectWebgl2());
  }, []);

  // A fix is only adopted as the origin when the user pressed the button — the
  // hook never prompts on its own, so a `fix` appearing here is always consented.
  useEffect(() => {
    if (!geolocation.fix) return;
    const fix = geolocation.fix;
    setOrigin({
      kind: "device",
      coordinates: { latitude: fix.latitude, longitude: fix.longitude },
      label: "Your current location",
      accuracyMetres: fix.accuracyMetres,
    });

    // Naming the fix is a nicety: if the provider is unconfigured or slow, the
    // origin simply keeps its generic label.
    const controller = new AbortController();
    void (async () => {
      const params = new URLSearchParams({
        reverse: "1",
        latitude: String(fix.latitude),
        longitude: String(fix.longitude),
      });
      const result = await fetchJson<{ places: { label: string; primary: string }[] }>(
        `/api/geo/search?${params.toString()}`,
        controller.signal,
      ).catch(() => null);
      if (!result?.ok) return;
      const place = result.data.places[0];
      if (!place) return;
      setOrigin((current) => (current?.kind === "device" ? { ...current, label: place.label } : current));
    })();

    return () => controller.abort();
  }, [geolocation.fix]);

  // The nearby query re-runs whenever the origin or the filters change.
  useEffect(() => {
    if (!origin) {
      setNearby({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      radiusMetres: String(radiusMetres),
      kinds: kinds.join(","),
      limit: "20",
    });
    if (origin.coordinates) {
      params.set("latitude", String(origin.coordinates.latitude));
      params.set("longitude", String(origin.coordinates.longitude));
    } else {
      params.set("city", origin.label);
    }

    setNearby({ status: "loading" });
    void (async () => {
      try {
        const result = await fetchJson<{ facilities: NearbyFacility[]; mode: "point" | "city"; excluded: NearbyResult["excluded"] }>(
          `/api/geo/nearby?${params.toString()}`,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setNearby(
          result.ok
            ? { status: "ready", data: { facilities: result.data.facilities, mode: result.data.mode, excluded: result.data.excluded } }
            : { status: "error", ...result.failure },
        );
      } catch {
        // Aborted: a newer query owns the state.
      }
    })();

    return () => controller.abort();
  }, [origin, radiusMetres, kinds]);

  // A new origin invalidates the selected facility and its route.
  useEffect(() => {
    setSelectedId(null);
    setRoute({ status: "idle" });
  }, [origin]);

  const facilities = nearby.status === "ready" ? nearby.data.facilities : [];
  const selected = useMemo(() => facilities.find((facility) => facility.id === selectedId) ?? null, [facilities, selectedId]);

  const mapCenter = useMemo<Coordinates>(() => {
    if (selected?.latitude != null && selected.longitude != null) {
      return { latitude: selected.latitude, longitude: selected.longitude };
    }
    return origin?.coordinates ?? mapConfig.defaultCenter;
  }, [selected, origin]);

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (origin?.coordinates) {
      list.push({
        id: "origin",
        label: origin.label,
        detail: "Where this search is centred",
        coordinates: origin.coordinates,
        kind: "YOU",
      });
    }
    for (const facility of facilities) {
      if (facility.latitude === null || facility.longitude === null) continue;
      list.push({
        id: facility.id,
        label: facility.name,
        detail: `${KIND_META[facility.kind].short} · ${facility.distanceLabel}`,
        coordinates: { latitude: facility.latitude, longitude: facility.longitude },
        kind: facility.kind,
        selected: facility.id === selectedId,
      });
    }
    return list;
  }, [facilities, origin, selectedId]);

  const routeLine = useMemo(() => {
    if (route.status !== "ready" || route.data.geometry.length === 0) return null;
    return { geometry: route.data.geometry, mode: route.data.mode };
  }, [route]);

  const searchPlaces = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = query.trim();
      if (trimmed.length < 3) {
        setPlaces({ status: "error", message: "Enter at least three characters, or a locality name." });
        return;
      }

      const controller = new AbortController();
      setPlaces({ status: "loading" });
      try {
        const params = new URLSearchParams({ q: trimmed, limit: "5" });
        if (geolocation.fix) {
          params.set("latitude", String(geolocation.fix.latitude));
          params.set("longitude", String(geolocation.fix.longitude));
        }
        const result = await fetchJson<{ places: GeocodedPlaceView[] }>(
          `/api/geo/search?${params.toString()}`,
          controller.signal,
        );
        setPlaces(result.ok ? { status: "ready", data: result.data.places } : { status: "error", ...result.failure });
      } catch {
        // Superseded by another submit.
      }
    },
    [query, geolocation.fix],
  );

  const previewRoute = useCallback(async () => {
    if (!origin?.coordinates) {
      setRoute({
        status: "error",
        message:
          "A route needs a starting point. Share your location, or pick your address from the suggestions, and try again.",
      });
      return;
    }
    if (!selected || selected.latitude === null || selected.longitude === null) {
      setRoute({
        status: "error",
        message: "This provider has no published coordinates, so no road route can be drawn to it.",
      });
      return;
    }

    const controller = new AbortController();
    setRoute({ status: "loading" });
    const params = new URLSearchParams({
      originLatitude: String(origin.coordinates.latitude),
      originLongitude: String(origin.coordinates.longitude),
      destinationLatitude: String(selected.latitude),
      destinationLongitude: String(selected.longitude),
      mode: routeMode,
    });

    try {
      const result = await fetchJson<{ route: RouteResult }>(`/api/geo/route?${params.toString()}`, controller.signal);
      setRoute(result.ok ? { status: "ready", data: result.data.route } : { status: "error", ...result.failure });
    } catch {
      // Superseded.
    }
  }, [origin, selected, routeMode]);

  const selectFacility = useCallback((id: string) => {
    setSelectedId(id);
    setRoute({ status: "idle" });
    const target = document.getElementById(`facility-${id}`);
    target?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  }, []);

  const toggleKind = useCallback((kind: NearbyKind) => {
    setKinds((current) => {
      const next = current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind];
      // An empty filter would return everything, which reads as a bug rather than
      // a choice — so the last remaining category cannot be switched off.
      return next.length === 0 ? current : next;
    });
  }, []);

  const mapReady = isMapConfigured();
  const canOffer3d = mapReady && mapConfig.supports3d && webgl2;

  return (
    <div className={cn("grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start", className)}>
      <div className="space-y-6">
        <LocationPanel
          origin={origin}
          geolocation={geolocation}
          query={query}
          setQuery={setQuery}
          places={places}
          onSubmit={searchPlaces}
          onSelectPlace={(place) => {
            setOrigin({ kind: "place", coordinates: place.coordinates, label: place.label });
            setPlaces({ status: "idle" });
            setQuery(place.label);
          }}
          onResetOrigin={() => {
            geolocation.clear();
            setOrigin(null);
          }}
          onCityFallback={() => setOrigin({ kind: "city", coordinates: null, label: query.trim() })}
        />

        <FiltersPanel
          kinds={kinds}
          onToggleKind={toggleKind}
          radiusMetres={radiusMetres}
          onRadiusChange={setRadiusMetres}
        />

        <MapPanel
          mapReady={mapReady}
          canOffer3d={canOffer3d}
          threeD={threeD}
          onToggleThreeD={setThreeD}
          center={mapCenter}
          markers={markers}
          route={routeLine}
          onSelectMarker={selectFacility}
          hasOrigin={Boolean(origin)}
          facilityCount={facilities.length}
        />
      </div>

      <div className="space-y-6">
        <ResultsPanel
          origin={origin}
          nearby={nearby}
          selectedId={selectedId}
          listRef={listRef}
          onSelect={selectFacility}
          onWidenRadius={() =>
            setRadiusMetres((current) => {
              const index = RADIUS_OPTIONS.findIndex((option) => option.value === current);
              return RADIUS_OPTIONS[Math.min(index + 1, RADIUS_OPTIONS.length - 1)].value;
            })
          }
        />

        {selected ? (
          <RoutePanel
            facility={selected}
            route={route}
            routeMode={routeMode}
            onModeChange={setRouteMode}
            onPreview={previewRoute}
            origin={origin}
          />
        ) : null}

        <EmergencyFallbackPanel />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

function LocationPanel({
  origin,
  geolocation,
  query,
  setQuery,
  places,
  onSubmit,
  onSelectPlace,
  onResetOrigin,
  onCityFallback,
}: {
  origin: Origin | null;
  geolocation: ReturnType<typeof useGeolocation>;
  query: string;
  setQuery: (value: string) => void;
  places: LoadState<GeocodedPlaceView[]>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onSelectPlace: (place: { label: string; coordinates: Coordinates }) => void;
  onResetOrigin: () => void;
  onCityFallback: () => void;
}) {
  const accuracy = geolocation.fix ? geoAccuracyBand(geolocation.fix.accuracyMetres) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crosshair aria-hidden className="size-4 text-primary" />
          Where are you searching from?
        </CardTitle>
        <CardDescription>
          Your location is only requested when you press the button, and it is sent to ORVEXA — never published on a
          page. If you would rather not share it, search by address or locality instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {origin ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4">
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <MapPin aria-hidden className="size-4 text-primary" />
                {origin.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {origin.kind === "device"
                  ? accuracy && accuracy.warning
                    ? accuracy.label
                    : "Taken from this device's GPS."
                  : origin.kind === "place"
                    ? "Resolved from the address you chose."
                    : "Matched against the place name stored on each provider record."}
                {origin.coordinates ? "" : " No coordinates, so distances are unavailable for this search."}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={onResetOrigin}>
              Change
            </Button>
          </div>
        ) : (
          <p
            role="status"
            className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-3 text-sm leading-relaxed text-muted-foreground"
          >
            Nothing is shared yet. Press the button below, or search by address.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="default"
            onClick={() => void geolocation.request()}
            disabled={geolocation.status === "requesting" || !geolocation.canRequest}
          >
            <Crosshair aria-hidden />
            {geolocation.status === "requesting"
              ? "Waiting for a fix…"
              : origin?.kind === "device"
                ? "Refresh my location"
                : "Use my current location"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/emergency">
              <Siren aria-hidden />
              Start an SOS instead
            </Link>
          </Button>
        </div>

        {geolocation.status !== "idle" && geolocation.status !== "granted" ? (
          <p
            role="status"
            className={cn(
              "flex items-start gap-2 rounded-xl border px-4 py-3 text-xs leading-relaxed",
              geolocation.status === "denied"
                ? "border-emergency/40 bg-emergency-soft text-emergency"
                : "border-border bg-muted/50 text-muted-foreground",
            )}
          >
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {geolocation.message}
          </p>
        ) : null}

        <form className="space-y-3" onSubmit={onSubmit}>
          <Field
            id="place-search"
            label="Search by address, locality or landmark"
            description="Used when you cannot or would rather not share your location."
          >
            <div className="flex gap-2">
              <Input
                id="place-search"
                name="q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. Koramangala, Bengaluru"
                autoComplete="street-address"
                aria-describedby="place-search-description"
              />
              <Button type="submit" variant="outline" disabled={places.status === "loading"}>
                <Search aria-hidden />
                Search
              </Button>
            </div>
          </Field>
        </form>

        {places.status === "loading" ? (
          <p role="status" className="text-xs text-muted-foreground">
            Looking that place up…
          </p>
        ) : null}

        {places.status === "error" ? (
          <div className="space-y-3 rounded-xl border border-warning/40 bg-warning-soft p-4">
            <p className="text-xs leading-relaxed text-warning">
              {places.kind === "not_configured"
                ? "Place lookup is not configured on this deployment, so addresses cannot be resolved to coordinates."
                : places.message}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onCityFallback} disabled={query.trim().length < 2}>
              Search registered providers around “{query.trim() || "this place"}” instead
            </Button>
          </div>
        ) : null}

        {places.status === "ready" ? (
          places.data.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No place matched that search. Try a nearby landmark, a pin code, or a different spelling.
            </p>
          ) : (
            <ul className="space-y-2">
              {places.data.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPlace(place)}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/45 hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="block text-sm font-medium">{place.primary}</span>
                    {place.secondary ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{place.secondary}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function FiltersPanel({
  kinds,
  onToggleKind,
  radiusMetres,
  onRadiusChange,
}: {
  kinds: NearbyKind[];
  onToggleKind: (kind: NearbyKind) => void;
  radiusMetres: number;
  onRadiusChange: (value: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What are you looking for?</CardTitle>
        <CardDescription>At least one category stays selected.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="flex flex-wrap gap-2">
          {NEARBY_KINDS.map((kind) => {
            const active = kinds.includes(kind);
            const Icon = KIND_META[kind].icon;
            return (
              <li key={kind}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggleKind(kind)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    active
                      ? "border-primary/45 bg-primary-soft text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/35",
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                  {KIND_META[kind].short}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="sm:max-w-xs">
          <Field id="nearby-radius" label="Search radius">
            <Select
              id="nearby-radius"
              value={radiusMetres}
              onChange={(event) => onRadiusChange(Number(event.target.value))}
            >
              {RADIUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

function MapPanel({
  mapReady,
  canOffer3d,
  threeD,
  onToggleThreeD,
  center,
  markers,
  route,
  onSelectMarker,
  hasOrigin,
  facilityCount,
}: {
  mapReady: boolean;
  canOffer3d: boolean;
  threeD: boolean;
  onToggleThreeD: (value: boolean) => void;
  center: Coordinates;
  markers: MapMarker[];
  route: { geometry: [number, number][]; mode: TravelMode } | null;
  onSelectMarker: (id: string) => void;
  hasOrigin: boolean;
  facilityCount: number;
}) {
  const attribution = mapAttribution();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin aria-hidden className="size-4 text-primary" />
              Map
            </CardTitle>
            <CardDescription>
              {mapReady
                ? `Tiles from ${mapProviderLabel()}. Showing the map sends your viewport to the provider.`
                : "No mapping provider is configured on this deployment. The list below is unaffected — it comes from ORVEXA's own records."}
            </CardDescription>
          </div>
          {canOffer3d ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onToggleThreeD(!threeD)} aria-pressed={threeD}>
              {threeD ? "Switch to 2D" : "Try 3D view"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!mapReady ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm leading-relaxed text-muted-foreground">
            No map provider is configured, so there is nothing to draw here. Every provider that ORVEXA has on record
            for this area is still listed on the right, with its address, phone number and whatever availability it has
            reported. Call the emergency department directly rather than waiting for a map.
          </p>
        ) : !hasOrigin ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm leading-relaxed text-muted-foreground">
            Share your location or search for an address to place providers on the map.
          </p>
        ) : (
          <MapView
            center={center}
            zoom={facilityCount > 0 ? 12 : 11}
            markers={markers}
            route={route}
            threeD={threeD && canOffer3d}
            onSelectMarker={onSelectMarker}
            className="h-[22rem] w-full overflow-hidden rounded-2xl border border-border"
          />
        )}

        {mapReady ? (
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Navigation aria-hidden className="size-3.5" />
              {markers.length - (hasOrigin ? 1 : 0)} of the listed providers have coordinates.
            </span>
            {attribution ? <span>{attribution}</span> : null}
          </p>
        ) : null}

        {mapReady && !canOffer3d ? (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {mapConfig.supports3d
              ? "This device did not report WebGL2 support, so the 3D view is unavailable. The flat map works normally."
              : `The configured provider (${mapProviderLabel()}) does not support the 3D terrain view. The flat map is always used.`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function ResultsPanel({
  origin,
  nearby,
  selectedId,
  listRef,
  onSelect,
  onWidenRadius,
}: {
  origin: Origin | null;
  nearby: LoadState<NearbyPayload>;
  selectedId: string | null;
  listRef: React.RefObject<HTMLUListElement | null>;
  onSelect: (id: string) => void;
  onWidenRadius: () => void;
}) {
  return (
    <section aria-labelledby="nearby-heading" className="space-y-4">
      <div>
        <h2 id="nearby-heading" className="text-lg font-semibold">
          Nearby care
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Registered providers from ORVEXA&apos;s directory, ordered by straight-line distance. This is not a live
          availability feed: capacity, stock and free vehicles are only ever shown when the provider has reported them.
        </p>
      </div>

      {!origin ? (
        <EmptyState
          icon={MapPin}
          size="compact"
          title="Set a starting point"
          description="Share your location or search for an address, locality or pin code to see what is nearby."
        />
      ) : nearby.status === "loading" || nearby.status === "idle" ? (
        <div aria-busy="true" className="space-y-3">
          <p role="status" className="sr-only">
            Searching for nearby providers.
          </p>
          {[0, 1, 2].map((key) => (
            <div key={key} aria-hidden className="h-28 animate-pulse rounded-2xl border border-border bg-muted/50 motion-reduce:animate-none" />
          ))}
        </div>
      ) : nearby.status === "error" ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-base">The search did not complete</CardTitle>
            <CardDescription>
              {nearby.retryAfterSeconds
                ? `${nearby.message} Try again in about ${nearby.retryAfterSeconds} seconds.`
                : nearby.message}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/emergency">Use the emergency numbers instead</Link>
            </Button>
          </CardContent>
        </Card>
      ) : nearby.data.facilities.length === 0 ? (
        <EmptyState
          icon={Search}
          size="compact"
          title="Nothing registered in this area yet"
          description={
            nearby.data.mode === "city"
              ? "No registered provider matched that place name. Try the city or district name, or widen the radius."
              : `No registered provider was found within this radius.${nearby.data.excluded.outsideRadius > 0 ? ` ${nearby.data.excluded.outsideRadius} provider(s) sit just outside it.` : ""}`
          }
          action={
            <Button type="button" variant="outline" onClick={onWidenRadius}>
              Widen the search
            </Button>
          }
          secondaryAction={
            <Button asChild variant="ghost">
              <Link href="/emergency">Emergency numbers</Link>
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {nearby.data.facilities.length} provider{nearby.data.facilities.length === 1 ? "" : "s"} found
            {nearby.data.mode === "city" ? " by place name (distances unavailable)" : ""}.
            {nearby.data.excluded.noLocation > 0
              ? ` ${nearby.data.excluded.noLocation} more had no published coordinates and could not be placed.`
              : ""}
          </p>
          <ul ref={listRef} className="space-y-3">
            {nearby.data.facilities.map((facility) => (
              <li key={facility.id}>
                <FacilityCard facility={facility} selected={facility.id === selectedId} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function FacilityCard({
  facility,
  selected,
  onSelect,
}: {
  facility: NearbyFacility;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const Icon = KIND_META[facility.kind].icon;
  const callable = facility.phone?.replace(/[^\d+]/g, "");

  return (
    <article
      id={`facility-${facility.id}`}
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] transition-colors",
        selected ? "border-primary/60 ring-2 ring-primary/25" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">
              <Icon aria-hidden />
              {KIND_META[facility.kind].short}
            </Badge>
            {facility.isVerified ? (
              <Badge variant="success">Verified registration</Badge>
            ) : (
              <Badge variant="warning">Not verified yet</Badge>
            )}
            {facility.dispatchEligible ? <Badge variant="default">Can receive emergency requests</Badge> : null}
          </div>
          <h3 className="text-base font-semibold">{facility.name}</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {facility.address}
            {facility.city ? `, ${facility.city}` : ""}
            {facility.state ? `, ${facility.state}` : ""}
          </p>
          <p className="text-xs font-medium">{facility.distanceLabel}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Button type="button" variant={selected ? "default" : "outline"} size="sm" onClick={() => onSelect(facility.id)}>
            <MapPin aria-hidden />
            {selected ? "Selected" : "Show on map"}
          </Button>
          {callable ? (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${callable}`}>
                <PhoneCall aria-hidden />
                Call
              </a>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">No published number</span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <p className="flex items-start gap-2 text-xs leading-relaxed">
          <Badge variant={availabilityTone(facility.availability)} className="mt-0.5">
            <Clock aria-hidden />
            {facility.availability.label}
          </Badge>
          <span className="text-muted-foreground">
            {facility.availability.detail}
            {facility.availability.source ? ` Source: ${facility.availability.source}.` : ""}
          </span>
        </p>

        {facility.attributes.length > 0 ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {facility.attributes.map((attribute) => (
              <div key={attribute.label} className="rounded-xl bg-muted/50 px-3 py-2">
                <dt className="text-[0.7rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  {attribute.label}
                </dt>
                <dd className="mt-0.5 text-xs">{attribute.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {facility.unknown.length > 0 ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-2.5">
            <p className="text-[0.7rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Not known to ORVEXA
            </p>
            <ul className="mt-1 space-y-1">
              {facility.unknown.map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <CircleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {facility.href ? (
          <Link
            href={facility.href}
            className="inline-flex text-xs font-semibold text-primary underline-offset-4 hover:underline"
          >
            View the full profile
          </Link>
        ) : null}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

function RoutePanel({
  facility,
  route,
  routeMode,
  onModeChange,
  onPreview,
  origin,
}: {
  facility: NearbyFacility;
  route: LoadState<RouteResult>;
  routeMode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  onPreview: () => void;
  origin: Origin | null;
}) {
  const hasCoordinates = facility.latitude !== null && facility.longitude !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation aria-hidden className="size-4 text-primary" />
          Route to {facility.name}
        </CardTitle>
        <CardDescription>
          Distances and times come from the mapping provider&apos;s own road data. A route preview is not a booking and
          does not contact the provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasCoordinates ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            This provider has not published coordinates, so ORVEXA cannot draw a route or estimate a travel time. The
            distance shown above is the straight-line figure only.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full max-w-[14rem]">
                <Field id="route-mode" label="Travel mode">
                  <Select
                    id="route-mode"
                    value={routeMode}
                    onChange={(event) => onModeChange(event.target.value as TravelMode)}
                  >
                    {TRAVEL_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button type="button" variant="outline" onClick={onPreview} disabled={route.status === "loading"}>
                <Navigation aria-hidden />
                {route.status === "loading" ? "Calculating…" : "Preview route"}
              </Button>
            </div>

            {route.status === "error" ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-xs leading-relaxed text-warning"
              >
                <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {route.kind === "unsupported_mode"
                  ? "The configured mapping provider has no route profile for this travel mode. Try another mode."
                  : route.message}
              </p>
            ) : null}

            {route.status === "ready" ? (
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                    <dt className="text-[0.7rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                      Road distance
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold">{formatDistance(route.data.distanceMetres)}</dd>
                  </div>
                  <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                    <dt className="text-[0.7rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                      Typical travel time
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold">{formatDuration(route.data.durationSeconds)}</dd>
                  </div>
                </dl>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Reported by {mapProviderLabel()} for {route.data.mode}
                  {route.data.mode === "driving" ? " traffic" : ""}. It is not a promise about an ambulance, which
                  travels on the operator&apos;s terms.
                </p>
                {route.data.steps.length > 0 ? (
                  <details className="rounded-xl border border-border px-4 py-3">
                    <summary className="cursor-pointer text-xs font-semibold">
                      Turn-by-turn directions ({route.data.steps.length} steps)
                    </summary>
                    <ol className="mt-3 space-y-2">
                      {route.data.steps.slice(0, 40).map((step, index) => (
                        <li key={`${index}-${step.instruction}`} className="flex gap-3 text-xs">
                          <span aria-hidden className="font-mono text-muted-foreground">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="flex-1 leading-relaxed">{step.instruction}</span>
                          <span className="text-muted-foreground">{formatDistance(step.distanceMetres)}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a
                  href={externalDirectionsUrl(
                    { latitude: facility.latitude as number, longitude: facility.longitude as number },
                    origin?.coordinates ?? null,
                    routeMode,
                  )}
                >
                  <MapPin aria-hidden />
                  Open in my maps app
                </a>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Always-available fallback
// ---------------------------------------------------------------------------

function EmergencyFallbackPanel() {
  return (
    <Card className="border-emergency/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TriangleAlert aria-hidden className="size-4 text-emergency" />
          If someone is seriously unwell
        </CardTitle>
        <CardDescription>
          Finding a hospital on this page does not alert anyone. Call the emergency number, then call the hospital
          yourself to confirm they can take the patient.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="emergency">
          <Link href="/emergency">Open emergency SOS</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
