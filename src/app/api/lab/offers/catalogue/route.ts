import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { listPriceableTests } from "@/lib/diagnostics/lab";

/**
 * The catalogue this laboratory may price.
 *
 * Only tests the platform has made listable appear here, each carrying the
 * partner's own offer when one already exists — so the pricing page can show
 * "priced" and "not yet priced" without a second call.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("lab.offer_manage");
  if (!session.ok) return session.response;

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile before setting prices.");

  const query = request.nextUrl.searchParams.get("query")?.trim() || undefined;
  const tests = await listPriceableTests({ labProfileId: lab.id, query });
  return jsonOk({ tests });
}
