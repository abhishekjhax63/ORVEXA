import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { listLabOffers, saveLabOffer } from "@/lib/diagnostics/lab";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { labOfferSchema } from "@/lib/validation/diagnostics";

/**
 * This laboratory's own price list.
 *
 * A partner prices the platform's catalogue; it does not add to it. Every price
 * here is the partner's own published figure and is converted once from paise to
 * whole rupees at the boundary.
 */
export async function GET() {
  const session = await requireRoutePermission("lab.offer_manage");
  if (!session.ok) return session.response;

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile before setting prices.");

  const offers = await listLabOffers(lab.id);
  return jsonOk({ offers });
}

export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("lab.offer_manage");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("labOfferWrite", `user:${session.user.id}`, RATE_LIMITS.labOfferWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many price changes. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile before setting prices.");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = labOfferSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That price is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await saveLabOffer({ user: session.user, labProfileId: lab.id, data: parsed.data });
  if (!result.ok) {
    return jsonError(result.code === "test_not_found" ? 404 : 422, result.message, { code: result.code });
  }

  return jsonOk({ offerId: result.offerId }, { status: parsed.data.offerId ? 200 : 201 });
}
