import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { listBookingsAwaitingReport } from "@/lib/diagnostics/reports";

/**
 * Bookings whose sample is in the laboratory's hands but that have no report
 * open yet — the partner's work list for the report desk.
 */
export async function GET() {
  const session = await requireRoutePermission("lab.booking_manage");
  if (!session.ok) return session.response;

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile to see the report desk.");

  const bookings = await listBookingsAwaitingReport(lab.id);
  return jsonOk({ bookings });
}
