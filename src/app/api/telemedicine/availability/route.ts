import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { listTeleconsultAvailability } from "@/lib/telemedicine/availability";
import { teleconsultAvailabilitySchema } from "@/lib/validation/telemedicine";

/**
 * The open virtual-consultation slots for one clinician.
 *
 * Availability is the clinician's own published telemedicine schedule minus the
 * times already taken, so a slot shown here is one the booking transaction will
 * also accept. It is read-only: nothing is held by looking.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit(
    "telemedicineAvailability",
    `user:${session.user.id}`,
    RATE_LIMITS.telemedicineAvailability,
  );
  if (!limit.allowed) {
    return jsonError(429, "Too many availability lookups. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = teleconsultAvailabilitySchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That availability request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await listTeleconsultAvailability({
    doctorProfileId: parsed.data.doctorProfileId,
    fromDate: parsed.data.fromDate,
    days: parsed.data.days,
  });
  if (!result.ok) {
    return jsonError(result.code === "doctor_not_found" ? 404 : 409, result.message, { code: result.code });
  }

  return jsonOk({
    doctor: result.doctor,
    slots: result.slots,
    windowStart: result.windowStart,
    windowDays: result.windowDays,
  });
}
