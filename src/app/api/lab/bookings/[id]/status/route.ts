import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { recordLabBookingStatus } from "@/lib/diagnostics/lab";
import { diagnosticBookingStatusSchema } from "@/lib/validation/diagnostics";

/**
 * Records a collection-side status on one of this laboratory's bookings.
 *
 * Only `CONFIRMED`, `SAMPLE_COLLECTED`, `PROCESSING` and `NO_SHOW` are accepted:
 * `REPORT_READY` follows a published report and `COMPLETED` follows that, so a
 * partner cannot type a status that implies a result exists.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("lab.booking_manage");
  if (!session.ok) return session.response;

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile to manage bookings.");

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = diagnosticBookingStatusSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That status update is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }
  if (parsed.data.bookingId !== decodeURIComponent(id)) {
    return jsonError(400, "The booking id in the request did not match the booking being updated.");
  }

  const result = await recordLabBookingStatus({
    user: session.user,
    labProfileId: lab.id,
    bookingId: parsed.data.bookingId,
    status: parsed.data.status,
    note: parsed.data.note ?? null,
  });
  if (!result.ok) return jsonError(result.code === "not_found" ? 404 : 409, result.message, { code: result.code });

  return jsonOk({ bookingId: result.bookingId, reference: result.reference, status: result.status });
}
