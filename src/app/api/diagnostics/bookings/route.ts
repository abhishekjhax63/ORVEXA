import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { createDiagnosticBooking, listPatientDiagnosticBookings } from "@/lib/diagnostics/bookings";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { diagnosticBookingSchema } from "@/lib/validation/diagnostics";

/**
 * Create a diagnostic booking.
 *
 * The request names tests, a mode and a time. It does not carry a price: the
 * total is computed inside the booking transaction from each laboratory's own
 * published offer. `idempotencyKey` makes a retried submit land on the same
 * booking, and a replayed key from another account is refused rather than
 * adopted.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("diagnostics.book_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("diagnosticBookingWrite", `user:${session.user.id}`, RATE_LIMITS.diagnosticBookingWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many booking attempts. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = diagnosticBookingSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That booking request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await createDiagnosticBooking({ user: session.user, data: parsed.data });
  if (!result.ok) {
    const status = result.code === "conflict" ? 409 : result.code === "consent_required" ? 409 : 422;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk(
    {
      booking: result.booking,
      reused: result.reused,
      labSubmission: result.labSubmission,
    },
    { status: result.reused ? 200 : 201 },
  );
}

/** The signed-in patient's own bookings, newest first. */
export async function GET() {
  const session = await requireRoutePermission("diagnostics.read_own");
  if (!session.ok) return session.response;

  const bookings = await listPatientDiagnosticBookings(session.user.id);
  return jsonOk({ bookings });
}
