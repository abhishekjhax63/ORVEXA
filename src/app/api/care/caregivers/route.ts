import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { inviteCaregiver, listIssuedGrants, listReceivedGrants } from "@/lib/care/family";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { caregiverInviteSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * Caregiver grants, in both directions.
 *
 * `issued` is what this account has offered to other people; `received` is what
 * other people have given it. Both are returned so a screen can show the same
 * person what they have handed out and what they hold.
 */
export async function GET() {
  const session = await requireRoutePermission("care.caregiver_manage_own");
  if (!session.ok) return session.response;

  const [issued, received] = await Promise.all([
    listIssuedGrants(session.user.id),
    listReceivedGrants(session.user.id),
  ]);
  return jsonOk({ issued, received });
}

/**
 * Invites somebody to help with parts of this account's record.
 *
 * An invitation grants nothing until the other person accepts, and the scopes
 * it carries are named explicitly — a relationship never implies a scope.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.caregiver_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = caregiverInviteSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That invitation is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await inviteCaregiver({ user: session.user, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ accessId: result.data.accessId, status: result.data.status });
}
