import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { changeCareProgramStatus } from "@/lib/care/preventive";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { careProgramUpdateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * Moves a care programme's status.
 *
 * Its own endpoint because `changeCareProgramStatus` owns `endedOn` — set for
 * `COMPLETED` and `WITHDRAWN`, cleared otherwise — and appends the timeline
 * event an ending produces, which a plain field update would bypass.
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

  const parsed = careProgramUpdateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That status change is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const { status } = parsed.data;
  if (!status) {
    return jsonError(422, "That status change is not valid.", { fieldErrors: { status: "Choose a status." } });
  }

  const result = await changeCareProgramStatus({ user: session.user, programId: id, status });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ programId: result.data.programId, status: result.data.status });
}
