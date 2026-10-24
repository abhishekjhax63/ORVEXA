import type { NextRequest } from "next/server";

import { getRouteUser, jsonError, jsonOk, zodFieldErrors } from "@/lib/auth/route-session";
import { geocodeAddress, reverseGeocode, type MapErrorKind } from "@/lib/maps/provider";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { clientIpFromHeaders } from "@/lib/security/request";
import { geocodeQuerySchema } from "@/lib/validation/emergency";

/**
 * Place lookup & reverse geocoding.
 *
 * Proxied rather than called from the browser so the provider token stays on the
 * server. Accessible during pre-login location detection via client IP rate-limiting,
 * and authenticated user rate-limiting when logged in.
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
  const user = await getRouteUser();
  const identity = user ? `user:${user.id}` : `ip:${clientIpFromHeaders(request.headers) ?? "unknown"}`;

  const url = new URL(request.url);
  const raw = Object.fromEntries([...url.searchParams.entries()].filter(([, value]) => value.trim() !== ""));

  const parsed = geocodeQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, "Check the search details and try again.", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }
  const query = parsed.data;

  const limit = await consumeRateLimit("geoLookup", identity, RATE_LIMITS.geoLookup);
  if (!limit.allowed) {
    return jsonError(429, "Too many location searches. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const result =
    query.reverse && query.latitude !== undefined && query.longitude !== undefined
      ? await reverseGeocode({ latitude: query.latitude, longitude: query.longitude })
      : await geocodeAddress(query.q as string, {
          limit: query.limit,
          proximity:
            query.latitude !== undefined && query.longitude !== undefined
              ? { latitude: query.latitude, longitude: query.longitude }
              : null,
        });

  if (!result.ok) {
    return jsonError(STATUS_BY_ERROR[result.error.kind], result.error.message, { kind: result.error.kind });
  }

  const places = Array.isArray(result.data) ? result.data : [result.data];
  if (places.length === 0) {
    return jsonError(STATUS_BY_ERROR.no_results, "No matching place was found.", { kind: "no_results" });
  }

  return jsonOk({ places });
}
