import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { rescheduleDiagnosticBooking } from "@/lib/diagnostics/bookings";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { diagnosticBookingRescheduleSchema } from "@/lib/validation/diagnostics";

/**
 * Move a booking to a new time.
 *
 * Only a booking that has not yet had its sample taken can be moved, and the new
 * time is validated here rather than trusted from the page.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const session = await requireRoutePermission("diagnostics.book_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("diagnosticBookingManage", `user:${session.user.id}`, RATE_LIMITS.diagnosticBookingManage);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { reference } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = diagnosticBookingRescheduleSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That reschedule request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await rescheduleDiagnosticBooking({
    user: session.user,
    bookingId: parsed.data.bookingId,
    scheduledAt: parsed.data.scheduledAt,
    reason: parsed.data.reason ?? null,
  });
  if (!result.ok) return jsonError(result.code === "not_found" ? 404 : 409, result.message, { code: result.code });
  if (result.reference !== decodeURIComponent(reference)) {
    return jsonError(400, "That booking reference did not match the booking being moved.");
  }

  return jsonOk({ bookingId: result.bookingId, reference: result.reference, status: result.status });
}
