import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { updateCareServiceListing } from "@/lib/care/directory";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { careServiceListingUpdateSchema } from "@/lib/validation/care";

/**
 * Edit a care service listing.
 *
 * This is a general edit: switching a listing on or off is a separate act with
 * its own endpoint, and verification status is not editable here. The service
 * applies neither of those fields even if the body carries them.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.service_listing_manage");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("providerWrite", `user:${session.user.id}`, RATE_LIMITS.providerWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = careServiceListingUpdateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That listing is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await updateCareServiceListing({ user: session.user, listingId: id, data: parsed.data });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ listingId: result.data.listingId });
}
