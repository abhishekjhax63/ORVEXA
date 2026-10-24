"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Compass,
  Loader2,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";

export type StoredUserLocation = {
  latitude: number;
  longitude: number;
  label: string;
  city?: string;
  state?: string;
  source: "gps" | "manual";
  timestamp: number;
};

const LOCATION_STORAGE_KEY = "orvexa_user_location";
const LOCATION_DENIED_KEY = "orvexa_loc_denied";
const LOCATION_DISMISSED_KEY = "orvexa_loc_dismissed";

export function LocationPermissionPrompt() {
  const [status, setStatus] = useState<
    "prompt" | "requesting" | "resolved" | "denied" | "dismissed" | "manual"
  >("prompt");
  const [resolvedLocation, setResolvedLocation] = useState<StoredUserLocation | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualSearching, setManualSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check if location is already resolved in this session
    try {
      const stored = localStorage.getItem(LOCATION_STORAGE_KEY) || sessionStorage.getItem(LOCATION_STORAGE_KEY);
      if (stored) {
        const parsed: StoredUserLocation = JSON.parse(stored);
        queueMicrotask(() => {
          setResolvedLocation(parsed);
          setStatus("resolved");
        });
        return;
      }

      // Check if user previously denied permission or dismissed prompt
      const wasDenied = localStorage.getItem(LOCATION_DENIED_KEY) === "true";
      const wasDismissed = sessionStorage.getItem(LOCATION_DISMISSED_KEY) === "true";

      queueMicrotask(() => {
        if (wasDenied) {
          setStatus("denied");
        } else if (wasDismissed) {
          setStatus("dismissed");
        }
      });
    } catch {
      // keep default prompt state
    }
  }, []);

  const saveLocation = (location: StoredUserLocation) => {
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
      sessionStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
      // Notify other components on this window
      window.dispatchEvent(
        new CustomEvent("orvexa:location-updated", { detail: location }),
      );
    } catch (e) {
      console.warn("Could not persist location", e);
    }
    setResolvedLocation(location);
    setStatus("resolved");
    setErrorMessage(null);
  };

  const handleRequestLocation = () => {
    if (!navigator.geolocation) {
      setErrorMessage("Geolocation is not supported by your browser. Please search by city or pincode.");
      setStatus("manual");
      return;
    }

    setStatus("requesting");
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Call our server reverse-geocoding proxy (keeps Geoapify keys secure on server)
          const res = await fetch(
            `/api/geo/search?reverse=true&latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`,
          );

          if (res.ok) {
            const body = await res.json();
            const place = body.data;
            const label = place?.label || place?.address || `Near ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
            const city = place?.city || place?.state || "Nearby";

            saveLocation({
              latitude,
              longitude,
              label,
              city,
              state: place?.state,
              source: "gps",
              timestamp: Date.now(),
            });
          } else {
            // Reverse geocode proxy failed or was unconfigured; still save coordinates
            saveLocation({
              latitude,
              longitude,
              label: `Location (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`,
              source: "gps",
              timestamp: Date.now(),
            });
          }
        } catch {
          saveLocation({
            latitude,
            longitude,
            label: `Location (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`,
            source: "gps",
            timestamp: Date.now(),
          });
        }
      },
      (error) => {
        // User denied or device timed out
        console.warn("Geolocation permission or retrieval error:", error.message);
        if (error.code === error.PERMISSION_DENIED) {
          try {
            localStorage.setItem(LOCATION_DENIED_KEY, "true");
          } catch {}
          setStatus("denied");
        } else {
          setErrorMessage("Unable to retrieve device GPS. You can enter your city or pincode manually.");
          setStatus("manual");
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = manualQuery.trim();
    if (query.length < 2) return;

    setManualSearching(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/geo/search?q=${encodeURIComponent(query)}&limit=1`);
      if (res.ok) {
        const body = await res.json();
        const results = body.data;
        if (Array.isArray(results) && results.length > 0) {
          const place = results[0];
          saveLocation({
            latitude: place.coordinates.latitude,
            longitude: place.coordinates.longitude,
            label: place.label || place.address || query,
            city: place.city,
            state: place.state,
            source: "manual",
            timestamp: Date.now(),
          });
          setManualSearching(false);
          return;
        }
      }
      // If server lookup found nothing, inform user
      setErrorMessage(`No matching location found for "${query}". Please check spelling or enter a major city name.`);
    } catch {
      setErrorMessage("Could not reach location search service. Please try again.");
    } finally {
      setManualSearching(false);
    }
  };

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(LOCATION_DISMISSED_KEY, "true");
    } catch {}
    setStatus("dismissed");
  };

  const handleChangeLocation = () => {
    setStatus("manual");
  };

  if (status === "dismissed") {
    return (
      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card-elevated/70 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <MapPin className="size-3.5 text-primary" />
          Location skipped. Searching nationwide.
        </span>
        <button
          type="button"
          onClick={() => setStatus("prompt")}
          className="font-medium text-primary hover:underline"
        >
          Enable Location
        </button>
      </div>
    );
  }

  if (status === "resolved" && resolvedLocation) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-xs transition-all">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-foreground">
                Location set for nearby healthcare
              </p>
              <p className="mt-0.5 text-muted-foreground line-clamp-1">
                {resolvedLocation.label}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleChangeLocation}
            className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-primary/20 bg-card-elevated p-4 sm:p-5 shadow-xs transition-all">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Skip location access"
        className="absolute right-3.5 top-3.5 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3.5 pr-6">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Compass className="size-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            Allow location access to find nearby verified hospitals and doctors
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            We use your approximate location to calculate travel distance, rank verified emergency centers,
            and recommend doctors within your vicinity. Your exact GPS coordinates are processed securely on the
            server and never shared with advertising networks.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {status === "denied" && (
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
          <p className="font-medium text-foreground">
            Browser location access was denied or unavailable.
          </p>
          <p className="mt-0.5 text-muted-foreground">
            You can search manually by typing your city, locality, or 6-digit postal pincode below:
          </p>
        </div>
      )}

      {status !== "manual" && status !== "denied" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleRequestLocation}
            disabled={status === "requesting"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50"
          >
            {status === "requesting" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Detecting location...
              </>
            ) : (
              <>
                <Navigation className="size-3.5" />
                Enable Location
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStatus("manual")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Search className="size-3.5 text-muted-foreground" />
            Enter city or pincode manually
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs text-muted-foreground hover:text-foreground ml-auto"
          >
            Skip for now
          </button>
        </div>
      ) : (
        <form onSubmit={handleManualSearch} className="mt-4 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="e.g. Indiranagar, Bengaluru or 560038"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={manualSearching || manualQuery.trim().length < 2}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {manualSearching ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Searching...
              </>
            ) : (
              "Set Location"
            )}
          </button>
          <button
            type="button"
            onClick={() => setStatus("prompt")}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
