import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { createReminder, listReminders } from "@/lib/care/reminders";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { reminderCreateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * The signed-in person's reminders, active first.
 *
 * `includeInactive=true` widens the list to paused, completed and cancelled
 * reminders so a screen can show what has been switched off.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.reminders_manage_own");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const result = await listReminders({
    user: session.user,
    ownerUserId: params.get("ownerUserId")?.trim() || undefined,
    familyMemberId: params.get("familyMemberId")?.trim() || undefined,
    includeInactive: params.get("includeInactive") === "true",
  });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ reminders: result.data });
}

/**
 * Creates a reminder.
 *
 * The schedule shape is validated by `reminderCreateSchema`; whether the chosen
 * schedule is coherent (a weekly reminder with no days, an interval with no
 * duration) is enforced by the service, which owns the scheduling rules.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.reminders_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = reminderCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That reminder is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await createReminder({ user: session.user, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ reminderId: result.data.reminderId });
}
