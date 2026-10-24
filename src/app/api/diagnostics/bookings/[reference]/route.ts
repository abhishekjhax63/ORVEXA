import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { getPatientDiagnosticBookingByReference } from "@/lib/diagnostics/bookings";
import { diagnosticReferenceSchema } from "@/lib/validation/diagnostics";

/**
 * One booking, by reference.
 *
 * The lookup is scoped to the signed-in account, so another patient's reference
 * resolves to a 404 rather than to their booking.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const session = await requireRoutePermission("diagnostics.read_own");
  if (!session.ok) return session.response;

  const { reference } = await params;
  const parsed = diagnosticReferenceSchema.safeParse(decodeURIComponent(reference));
  if (!parsed.success) return jsonError(400, "That is not a valid diagnostic booking reference.");

  const booking = await getPatientDiagnosticBookingByReference({ userId: session.user.id, reference: parsed.data });
  if (!booking) return jsonError(404, "That booking was not found on your account.");

  return jsonOk({ booking });
}
