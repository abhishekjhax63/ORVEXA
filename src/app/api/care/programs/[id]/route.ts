import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { updateCareProgram } from "@/lib/care/preventive";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { careProgramUpdateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * Edits the descriptive fields of a care programme.
 *
 * Status moves go through `POST .../status`, which owns `endedOn` and the
 * timeline event an ending produces.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    return jsonError(422, "That programme change is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await updateCareProgram({ user: session.user, programId: id, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ programId: result.data.programId });
}
