import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getLabProfileForOwner, listLabBookings } from "@/lib/diagnostics/bookings";
import { DIAGNOSTIC_BOOKING_STATUSES } from "@/lib/validation/diagnostics";

const statusFilterSchema = z.object({ status: z.enum(DIAGNOSTIC_BOOKING_STATUSES).optional() });

/**
 * The bookings this laboratory has been sent.
 *
 * Scoped to the signed-in account's own laboratory profile, so a partner can
 * never read another laboratory's work.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("lab.booking_manage");
  if (!session.ok) return session.response;

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile to see bookings.");

  const parsed = statusFilterSchema.safeParse({
    status: request.nextUrl.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(422, "That status filter is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const bookings = await listLabBookings({ labProfileId: lab.id, status: parsed.data.status });
  return jsonOk({ bookings });
}
