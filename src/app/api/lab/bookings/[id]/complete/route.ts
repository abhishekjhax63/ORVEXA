import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { completeDiagnosticBooking } from "@/lib/diagnostics/lab";

/**
 * Closes a booking.
 *
 * Reachable only when the booking is `REPORT_READY` and a published report
 * exists — which is itself only ever written by a successful publish, so a
 * booking cannot be closed without an authenticated report behind it.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("lab.booking_manage");
  if (!session.ok) return session.response;

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile to manage bookings.");

  const { id } = await params;
  const result = await completeDiagnosticBooking({
    user: session.user,
    labProfileId: lab.id,
    bookingId: decodeURIComponent(id),
  });
  if (!result.ok) return jsonError(result.code === "not_found" ? 404 : 409, result.message, { code: result.code });

  return jsonOk({ bookingId: result.bookingId, reference: result.reference, status: result.status });
}
