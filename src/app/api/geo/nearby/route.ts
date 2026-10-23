import type { NextRequest } from "next/server";

import { getRouteUser, jsonError, jsonOk, zodFieldErrors } from "@/lib/auth/route-session";
import { findNearbyFacilities } from "@/lib/emergency/nearby";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { clientIpFromHeaders } from "@/lib/security/request";
import { NEARBY_KINDS, nearbyQuerySchema } from "@/lib/validation/emergency";

/**
 * Nearby emergency care.
 *
 * Deliberately available without an account: this reads only our own database,
 * and somebody who is not signed in still needs to find the nearest emergency
 * department. It never invents a facility and never reports capacity — every
 * figure comes from a provider row, and a missing figure is stated as missing.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // Empty query values are dropped rather than coerced: `Number("")` is 0, which
  // would silently become a search around latitude 0, longitude 0.
  const raw = Object.fromEntries(
    [...url.searchParams.entries()].filter(([, value]) => value.trim() !== ""),
  );

  const parsed = nearbyQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, "Check the search details and try again.", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }
  const query = parsed.data;

  const user = await getRouteUser();
  const identity = user ? `user:${user.id}` : `ip:${clientIpFromHeaders(request.headers) ?? "unknown"}`;
  const limit = await consumeRateLimit("geoLookup", identity, RATE_LIMITS.geoLookup);
  if (!limit.allowed) {
    return jsonError(429, "Too many location searches. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const hasPoint = query.latitude !== undefined && query.longitude !== undefined;

  const result = await findNearbyFacilities({
    point: hasPoint ? { latitude: query.latitude as number, longitude: query.longitude as number } : null,
    city: query.city ?? null,
    radiusMetres: query.radiusMetres,
    kinds: query.kinds ?? [...NEARBY_KINDS],
    limit: query.limit,
  });

  return jsonOk({
    ...result,
    // The UI states plainly that these are registered providers, not a live
    // availability feed, whenever a facility list is rendered.
    searchedBy: hasPoint ? "coordinates" : "place name",
  });
}
