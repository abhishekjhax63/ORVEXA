import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getReminderPreference, updateReminderPreference } from "@/lib/care/reminders";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { reminderPreferenceUpdateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * How reminders are delivered for this account.
 *
 * The preference carries the person's own time zone and quiet hours. Reading a
 * preference that was never set returns the documented defaults rather than
 * creating a row.
 */
export async function GET() {
  const session = await requireRoutePermission("care.reminders_manage_own");
  if (!session.ok) return session.response;

  const preference = await getReminderPreference(session.user.id);
  return jsonOk({ preference });
}

/**
 * Changes the reminder preference.
 *
 * The time zone is validated by `reminderPreferenceUpdateSchema` before it is
 * stored — an unrecognised name would otherwise throw deep inside the
 * scheduler instead of failing at the boundary. A `null` quiet-hours end means
 * "no quiet window", which is distinct from leaving the field out.
 */
export async function PATCH(request: NextRequest) {
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

  const parsed = reminderPreferenceUpdateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "Those reminder preferences are not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await updateReminderPreference({ user: session.user, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ preference: result.data });
}
