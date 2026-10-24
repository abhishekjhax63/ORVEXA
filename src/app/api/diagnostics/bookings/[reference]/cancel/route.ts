import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { cancelDiagnosticBooking } from "@/lib/diagnostics/bookings";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { diagnosticBookingCancelSchema } from "@/lib/validation/diagnostics";

/**
 * Cancel a booking. A reason is required, because a cancellation a patient
 * cannot explain is not actionable for the laboratory.
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

  const parsed = diagnosticBookingCancelSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That cancellation request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await cancelDiagnosticBooking({
    user: session.user,
    bookingId: parsed.data.bookingId,
    reason: parsed.data.reason,
  });
  if (!result.ok) return jsonError(result.code === "not_found" ? 404 : 409, result.message, { code: result.code });
  if (result.reference !== decodeURIComponent(reference)) {
    return jsonError(400, "That booking reference did not match the booking being cancelled.");
  }

  return jsonOk({ bookingId: result.bookingId, reference: result.reference, status: result.status });
}
