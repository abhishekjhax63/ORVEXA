import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { searchCareServices } from "@/lib/care/directory";
import { careServiceSearchSchema } from "@/lib/validation/care";

/**
 * Discovery: the care services a person can ask for.
 *
 * Readable by any signed-in account. Every row comes back with its
 * `verificationStatus` and `isDemo` flag, and neither is stripped here — the
 * screen has to be able to say that a result is a listing rather than a provider
 * ORVEXA has vetted.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.workspace_access");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const parsed = careServiceSearchSchema.safeParse({
    category: params.get("category") || undefined,
    deliveryMode: params.get("deliveryMode") || undefined,
    city: params.get("city") || undefined,
    language: params.get("language") || undefined,
    query: params.get("query") || undefined,
  });
  if (!parsed.success) {
    return jsonError(422, "That search is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const listings = await searchCareServices(parsed.data);
  return jsonOk({ listings });
}
