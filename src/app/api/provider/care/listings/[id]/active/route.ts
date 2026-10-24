import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { setCareServiceListingActive } from "@/lib/care/directory";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { careServiceListingUpdateSchema } from "@/lib/validation/care";

/**
 * Take a listing out of discovery, or put it back.
 *
 * `isActive` is required: this endpoint exists to change exactly that flag, and
 * a call that does not say which way would be ambiguous.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    return jsonError(422, "That request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }
  if (parsed.data.isActive === undefined) {
    return jsonError(422, "Say whether this listing should be active.", {
      fieldErrors: { isActive: "Say whether this listing should be active." },
    });
  }

  const result = await setCareServiceListingActive({
    user: session.user,
    listingId: id,
    isActive: parsed.data.isActive,
  });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ listingId: result.data.listingId, isActive: result.data.isActive });
}
