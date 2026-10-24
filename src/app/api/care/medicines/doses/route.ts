import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { listDoseLogs, logDose } from "@/lib/care/medications";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { medicationDoseLogSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/** Parses an optional ISO date from a query string, ignoring anything unreadable. */
function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * The dose log for one schedule.
 *
 * The schedule is named by `?scheduleId=` because the dose body is only about a
 * single dose; which schedule it belongs to is part of the request's address,
 * not of the dose itself.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.medications_manage_own");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const scheduleId = params.get("scheduleId")?.trim();
  if (!scheduleId) {
    return jsonError(422, "That request is not valid.", { fieldErrors: { scheduleId: "Choose a medicine schedule." } });
  }

  const result = await listDoseLogs({
    user: session.user,
    scheduleId,
    from: parseDateParam(params.get("from")) ?? null,
    to: parseDateParam(params.get("to")) ?? null,
  });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ doseLogs: result.data });
}

/**
 * Records what happened to one dose.
 *
 * Only the three things a person can truthfully report about their own dose —
 * taken, taken late or skipped — are accepted; the service refuses the
 * platform's own view of an untouched dose. Logging is idempotent per schedule
 * and scheduled time, so a double tap updates the same row.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.medications_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const scheduleId = request.nextUrl.searchParams.get("scheduleId")?.trim();
  if (!scheduleId) {
    return jsonError(422, "That request is not valid.", { fieldErrors: { scheduleId: "Choose a medicine schedule." } });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = medicationDoseLogSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That dose log is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await logDose({ user: session.user, scheduleId, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ doseLogId: result.data.doseLogId, status: result.data.status });
}
