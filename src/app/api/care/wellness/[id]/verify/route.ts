import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { verifyWellnessEntry } from "@/lib/care/wellness";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * A clinician confirming that a reading says what it says.
 *
 * This is the only path that can mark a reading verified, and it sets the who
 * and the when together so a row can never claim verification without naming
 * its verifier. Whether the caller actually holds a clinician role is enforced
 * inside the service; when they do not, its `not_clinician_verifiable` failure
 * is passed straight through as a 409 with the service's own message.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.wellness_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const result = await verifyWellnessEntry({ user: session.user, entryId: id });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ entryId: result.data.entryId, verifiedAt: result.data.verifiedAt });
}
