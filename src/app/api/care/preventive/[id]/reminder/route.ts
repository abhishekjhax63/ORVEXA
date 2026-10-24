import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission } from "@/lib/auth/route-session";
import { planReminderForPreventivePlan } from "@/lib/care/preventive";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/** Reads the optional lead time out of the request body without trusting it. */
function readLeadMinutes(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>).leadMinutes;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Turns a preventive plan into a reminder and links the two.
 *
 * The reminder is created through the ordinary reminder path, so it obeys the
 * same scheduling and quiet hours as any other. Running this twice cannot
 * produce a second reminder: the plan's id is the reminder's dedupe key, and the
 * service re-links to the existing reminder on a repeat.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.reminders_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const leadMinutes = readLeadMinutes(parsedBody.body);
  const result = await planReminderForPreventivePlan({
    user: session.user,
    planId: id,
    ...(leadMinutes === undefined ? {} : { leadMinutes }),
  });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ planId: result.data.planId, reminderId: result.data.reminderId });
}
