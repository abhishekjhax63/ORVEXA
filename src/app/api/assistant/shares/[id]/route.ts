import type { NextRequest } from "next/server";

import { revokeShare } from "@/lib/ai/conversations";
import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * Revoke a share link.
 *
 * Withdrawing consent has to be as easy as giving it, so a link can be killed
 * without deleting the assessment behind it. The row is kept and marked
 * revoked, which is what makes an already-opened link stop working.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("ai.export");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("aiShare", `user:${session.user.id}`, RATE_LIMITS.aiShare);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const result = await revokeShare({ ownerUserId: session.user.id, shareId: id });
  if (!result.ok) return jsonError(result.status, result.message);

  return jsonOk({ revoked: result.data.revoked });
}
