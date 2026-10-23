"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser geolocation with an explicit, revocable request.
 *
 * Three deliberate choices:
 *
 *  1. The browser prompt is only ever opened from a user gesture. Nothing calls
 *     `getCurrentPosition` on mount, because a prompt the user did not ask for
 *     is the most common reason people block location forever.
 *  2. Every failure mode has its own status. "Blocked" and "no fix yet" need
 *     different copy and different fallbacks — a denied permission must offer
 *     the address search, a timeout must offer a retry.
 *  3. The fix carries its accuracy and the moment it was taken, so the UI can
 *     warn when a stale or very coarse position is the only thing available.
 */

export type GeolocationStatus =
  | "idle"
  | "unsupported"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable"
  | "timeout";

export type GeoFix = {
  latitude: number;
  longitude: number;
  /** Metres of uncertainty reported by the device. */
  accuracyMetres: number;
  /** `Date.now()` at capture, so staleness is visible rather than implied. */
  capturedAt: number;
};

export type GeolocationState = {
  status: GeolocationStatus;
  fix: GeoFix | null;
  message: string;
};

const COPY: Record<GeolocationStatus, string> = {
  idle: "Your location is not being shared. Press the button to allow it for this incident only.",
  unsupported: "This browser does not support location sharing. Enter the address or the nearest landmark instead.",
  requesting: "Waiting for your device to report a position. Approve the browser prompt if it appears.",
  granted: "Location captured from your device.",
  denied:
    "Location access is blocked for this site. Nothing was shared. Enter an address or the nearest landmark so a responder can still be routed to you.",
  unavailable:
    "Your device could not determine a position right now. Move near a window or outdoors and try again, or enter the address instead.",
  timeout: "The device did not report a position in time. Try again, or enter the address instead.",
};

/** 12 seconds: long enough for a cold GPS fix outdoors, short enough to stay usable in an emergency. */
const POSITION_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 };

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ status: "idle", fix: null, message: COPY.idle });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // If the user revokes (or grants) permission in the browser's own UI, the
  // panel must not keep claiming the previous status.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return;
    let cancelled = false;
    let status: PermissionStatus | null = null;

    const onChange = () => {
      if (cancelled) return;
      const next = status?.state;
      if (next === "denied") {
        setState((current) => (current.status === "denied" ? current : { status: "denied", fix: null, message: COPY.denied }));
      }
    };

    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((result) => {
        if (cancelled) return;
        status = result;
        result.addEventListener("change", onChange);
        // A permission that is already granted means a later request will not
        // prompt, so the button can say what will happen.
        if (result.state === "denied") onChange();
      })
      .catch(() => {
        // Safari and some embedded browsers do not implement query() for
        // geolocation. The request itself still reports the real outcome.
      });

    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
  }, []);

  const request = useCallback(async (): Promise<GeoFix | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unsupported", fix: null, message: COPY.unsupported });
      return null;
    }

    setState({ status: "requesting", fix: null, message: COPY.requesting });

    return new Promise<GeoFix | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const fix: GeoFix = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMetres: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : Number.NaN,
            capturedAt: position.timestamp || Date.now(),
          };
          if (mounted.current) setState({ status: "granted", fix, message: COPY.granted });
          resolve(fix);
        },
        (error) => {
          const status: GeolocationStatus =
            error.code === error.PERMISSION_DENIED
              ? "denied"
              : error.code === error.TIMEOUT
                ? "timeout"
                : "unavailable";
          if (mounted.current) setState({ status, fix: null, message: COPY[status] });
          resolve(null);
        },
        POSITION_OPTIONS,
      );
    });
  }, []);

  /** Used when the user edits the address by hand, so the stale fix is dropped. */
  const clear = useCallback(() => {
    setState({ status: "idle", fix: null, message: COPY.idle });
  }, []);

  return { ...state, request, clear, canRequest: state.status !== "unsupported" };
}

/**
 * Coarse accuracy band, matching `accuracyBand` in `src/lib/maps/geo.ts` so the
 * server and the client describe the same fix the same way. Duplicated rather
 * than imported because that module is server-side and this hook must not pull
 * it into the browser bundle.
 */
export function geoAccuracyBand(accuracyMetres: number | null | undefined) {
  if (accuracyMetres === null || accuracyMetres === undefined || !Number.isFinite(accuracyMetres)) {
    return { band: "unknown" as const, label: "Accuracy not reported", warning: true };
  }
  if (accuracyMetres <= 50) return { band: "precise" as const, label: `Accurate to about ${Math.round(accuracyMetres)} m`, warning: false };
  if (accuracyMetres <= 500)
    return { band: "approximate" as const, label: `Approximate — within about ${Math.round(accuracyMetres)} m`, warning: true };
  return {
    band: "coarse" as const,
    label: `Very approximate — within about ${(accuracyMetres / 1000).toFixed(1)} km`,
    warning: true,
  };
}
