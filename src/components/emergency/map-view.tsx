"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { mapConfig, type TravelMode } from "@/lib/maps/config";
import type { Coordinates } from "@/lib/maps/geo";
import type { NearbyKind } from "@/lib/validation/emergency";

/**
 * Mapbox GL rendering for the nearby-care screen.
 *
 * Loaded only through `next/dynamic({ ssr: false })` from the explorer, because
 * Mapbox GL touches `window` at import time.
 *
 * Three rules:
 *
 *  1. The 2D view is the default and the fallback. `threeD` is only ever passed
 *     as true after the caller has confirmed the provider supports terrain *and*
 *     the device reported a WebGL2 context.
 *  2. Markers are real buttons. A map that can only be used with a mouse is not
 *     usable in an emergency, so each marker is a focusable element with an
 *     accessible name and a keyboard handler.
 *  3. Attribution is rendered by the map's own attribution control, which Mapbox's
 *     terms require and which cannot be turned off from here.
 */

export type MapMarkerKind = NearbyKind | "YOU" | "INCIDENT";

export type MapMarker = {
  id: string;
  label: string;
  detail?: string;
  coordinates: Coordinates;
  kind: MapMarkerKind;
  selected?: boolean;
};

export type MapRouteLine = {
  geometry: [number, number][];
  mode: TravelMode;
};

type MapViewProps = {
  center: Coordinates;
  zoom?: number;
  markers: MapMarker[];
  route?: MapRouteLine | null;
  threeD: boolean;
  onSelectMarker?: (id: string) => void;
  className?: string;
};

const ROUTE_SOURCE_ID = "orvexa-route";
const ROUTE_LAYER_ID = "orvexa-route-line";
const TERRAIN_SOURCE_ID = "orvexa-terrain";

const MARKER_COLOR: Record<MapMarkerKind, string> = {
  HOSPITAL_EMERGENCY: "#dc2626",
  AMBULANCE_PARTNER: "#ea580c",
  PHARMACY: "#0891b2",
  LABORATORY: "#7c3aed",
  YOU: "#0f766e",
  INCIDENT: "#111827",
};

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function markerElement(marker: MapMarker, onSelect?: (id: string) => void) {
  const element = document.createElement("button");
  element.type = "button";
  element.dataset.orvexaMarker = marker.id;
  element.setAttribute("aria-label", marker.detail ? `${marker.label}. ${marker.detail}` : marker.label);
  element.style.cssText = [
    "display:block",
    "width:22px",
    "height:22px",
    "border-radius:9999px",
    `background:${MARKER_COLOR[marker.kind]}`,
    "border:3px solid #ffffff",
    "box-shadow:0 1px 6px rgba(15,23,42,0.45)",
    "cursor:pointer",
    "padding:0",
    marker.selected ? "outline:3px solid rgba(15,23,42,0.35)" : "",
  ]
    .filter(Boolean)
    .join(";");

  if (onSelect) element.addEventListener("click", () => onSelect(marker.id));
  return element;
}

function routeFeature(route: MapRouteLine) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: route.geometry },
  };
}

export default function MapView({
  center,
  zoom = 12,
  markers,
  route = null,
  threeD,
  onSelectMarker,
  className,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const onSelectRef = useRef(onSelectMarker);
  const centerRef = useRef(center);

  // Keep the latest props reachable from the map's own callbacks without
  // recreating the map when they change.
  useEffect(() => {
    onSelectRef.current = onSelectMarker;
    centerRef.current = center;
  }, [onSelectMarker, center]);

  // Create the map once. `style` comes from config so a deployment can point at
  // a light or dark Mapbox style without a code change.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mapConfig.accessToken) return;

    mapboxgl.accessToken = mapConfig.accessToken;

    const map = new mapboxgl.Map({
      container,
      style: mapConfig.style ?? "mapbox://styles/mapbox/streets-v12",
      center: [centerRef.current.longitude, centerRef.current.latitude],
      zoom,
      // Start flat: the 2D view is what must always work.
      pitch: 0,
      attributionControl: false,
      logoPosition: "bottom-left",
    });
    mapRef.current = map;

    // Attribution: Geoapify & OSM attribution as required
    map.addControl(
      new mapboxgl.AttributionControl({
        customAttribution:
          mapConfig.provider === "geoapify"
            ? 'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> | <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>'
            : undefined,
      }),
      "bottom-right",
    );

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("error", (e) => {
      // Don't crash UI on tile load error
      if (e?.error) {
        console.warn("[map] Map tile warning:", e.error?.message || e.error);
      }
    });

    // Keep map resized cleanly on responsive layout changes
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [zoom]);

  // Keep the viewport following the chosen origin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = { center: [center.longitude, center.latitude] as [number, number], zoom };
    if (prefersReducedMotion()) map.jumpTo(target);
    else map.easeTo({ ...target, duration: 600 });
  }, [center.latitude, center.longitude, zoom]);

  // Markers. Rebuilt on change: the list is small (≤50) and diffing would add
  // state for no user-visible benefit.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();

    for (const marker of markers) {
      const element = markerElement(marker, (id) => onSelectRef.current?.(id));
      const instance = new mapboxgl.Marker({ element })
        .setLngLat([marker.coordinates.longitude, marker.coordinates.latitude])
        .addTo(map);
      markersRef.current.set(marker.id, instance);
    }
  }, [markers]);

  // Route line, drawn from the provider's own geometry.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const existing = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;

      if (!route || route.geometry.length === 0) {
        if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
        if (existing) map.removeSource(ROUTE_SOURCE_ID);
        return;
      }

      const data = routeFeature(route);
      if (existing) {
        existing.setData(data);
      } else {
        map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data });
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0e7490", "line-width": 4, "line-opacity": 0.85 },
        });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    return () => {
      // A style reload (for example when 3D is toggled) drops the source with it,
      // so the guards in `apply` handle the next run.
    };
  }, [route]);

  // Optional 3D. Terrain is added and removed with the toggle so the flat view
  // never depends on the DEM source loading.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const enabled = threeD && mapConfig.supports3d;

      if (enabled) {
        if (!map.getSource(TERRAIN_SOURCE_ID)) {
          map.addSource(TERRAIN_SOURCE_ID, {
            type: "raster-dem",
            url: "mapbox://mapbox.mapbox-terrain-dem-v1",
            tileSize: 512,
            maxzoom: 14,
          });
        }
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.2 });
        map.setFog({
          color: "rgb(240, 249, 255)",
          "high-color": "rgb(186, 230, 253)",
          "horizon-blend": 0.15,
        });
        map.easeTo({ pitch: 58, bearing: -18, duration: prefersReducedMotion() ? 0 : 900 });
      } else {
        map.setTerrain(null);
        if (map.getSource(TERRAIN_SOURCE_ID)) map.removeSource(TERRAIN_SOURCE_ID);
        map.easeTo({ pitch: 0, bearing: 0, duration: prefersReducedMotion() ? 0 : 500 });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [threeD]);

  return (
    <div
      ref={containerRef}
      // The surrounding panel labels this region, so the map itself is presented
      // as an application the keyboard can move around in.
      role="application"
      aria-label="Map of nearby emergency care. The same facilities are listed below."
      className={className}
    />
  );
}
