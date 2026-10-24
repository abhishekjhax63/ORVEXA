import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { createCareServiceListing, searchCareServices } from "@/lib/care/directory";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { careServiceListingCreateSchema } from "@/lib/validation/care";

/**
 * The listings a provider manages.
 *
 * A listing carries no owner column — it records the service somebody says they
 * offer — so the service layer exposes reading the live directory rather than a
 * per-account list, and every row keeps its `verificationStatus` and `isDemo`
 * flag.
 */
export async function GET(_request: NextRequest) {
  const session = await requireRoutePermission("care.service_listing_manage");
  if (!session.ok) return session.response;

  const listings = await searchCareServices({});
  return jsonOk({ listings });
}

/**
 * Create a care service listing.
 *
 * `verificationStatus` is not accepted from the caller and is not echoed back:
 * the service forces `UNVERIFIED`, because a listing is not a provider ORVEXA
 * has vetted. Verification is a separate workflow this endpoint cannot reach.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.service_listing_manage");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("providerWrite", `user:${session.user.id}`, RATE_LIMITS.providerWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = careServiceListingCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That listing is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await createCareServiceListing({ user: session.user, data: parsed.data });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ listingId: result.data.listingId }, { status: 201 });
}
