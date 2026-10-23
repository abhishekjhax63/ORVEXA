import type { NextRequest } from "next/server";

import { runTurn } from "@/lib/ai/turn";
import { aiTurnRequestSchema } from "@/lib/ai/validation";
import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * One assistant turn: the user's words, their files, and the assessment that
 * comes back.
 *
 * Every rule about what may be said and what may be stored lives in `runTurn`;
 * this handler only resolves the session, applies the limit and maps the typed
 * outcome onto a response. In particular a `unavailable` turn is returned as a
 * 503 carrying the honesty panel, never as an empty assessment — with no
 * provider there is no assistant, and the response says so.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("ai.assess");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("aiTurn", `user:${session.user.id}`, RATE_LIMITS.aiTurn);
  if (!limit.allowed) {
    return jsonError(429, "The assistant is handling a lot of requests from your account. Try again shortly.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = aiTurnRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await runTurn({ ownerUserId: session.user.id, request: parsed.data });

  if (result.ok) {
    return jsonOk({
      assessment: result.response.assessment,
      conversationId: result.response.conversationId,
      ephemeral: result.response.ephemeral,
    });
  }

  if (result.kind === "rejected") return jsonError(result.status, result.message);

  return jsonError(503, result.error.message, {
    errorKind: result.error.kind,
    conversationId: result.conversationId,
    unavailable: result.unavailable,
  });
}
