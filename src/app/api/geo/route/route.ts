import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { TRAVEL_MODES } from "@/lib/maps/config";
import { fetchRoute, type MapErrorKind } from "@/lib/maps/provider";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { routeQuerySchema } from "@/lib/validation/emergency";

/**
 * Route preview between the incident and a facility.
 *
 * The distance and duration returned here are the provider's road figures, not
 * the straight-line distance we compute from coordinates. Where a mode is not
 * supported by the configured provider — Mapbox has no public-transit profile —
 * that is reported as `unsupported_mode` rather than silently answered with a
 * driving route.
 */
const STATUS_BY_ERROR: Record<MapErrorKind, number> = {
  not_configured: 503,
  no_results: 404,
  timeout: 504,
  network_error: 502,
  rate_limited: 429,
  unsupported_mode: 400,
  provider_error: 502,
};

export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("emergency.raise");
  if (!session.ok) return session.response;

  const url = new URL(request.url);
  const raw = Object.fromEntries([...url.searchParams.entries()].filter(([, value]) => value.trim() !== ""));

  const parsed = routeQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, "Check the route details and try again.", {
      fieldErrors: zodFieldErrors(parsed.error),
      travelModes: TRAVEL_MODES,
    });
  }
  const query = parsed.data;

  const limit = await consumeRateLimit("geoLookup", `user:${session.user.id}`, RATE_LIMITS.geoLookup);
  if (!limit.allowed) {
    return jsonError(429, "Too many route requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const result = await fetchRoute(
    { latitude: query.originLatitude, longitude: query.originLongitude },
    { latitude: query.destinationLatitude, longitude: query.destinationLongitude },
    query.mode,
  );

  if (!result.ok) {
    return jsonError(STATUS_BY_ERROR[result.error.kind], result.error.message, { kind: result.error.kind });
  }

  return jsonOk({ route: result.data });
}
