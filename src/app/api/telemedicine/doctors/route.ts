import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { searchTeleconsultDoctors } from "@/lib/telemedicine/availability";

/**
 * Clinicians a patient may book virtually.
 *
 * Only verified clinicians who have switched telemedicine on and are accepting
 * patients come back. `hasPublishedClinic` is carried through so the page can
 * say that a clinician has published no times yet, instead of showing an empty
 * result that looks broken.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit(
    "telemedicineAvailability",
    `user:${session.user.id}`,
    RATE_LIMITS.telemedicineAvailability,
  );
  if (!limit.allowed) {
    return jsonError(429, "Too many searches. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? undefined;
  const doctors = await searchTeleconsultDoctors({ query: query || undefined });
  return jsonOk({ doctors });
}
