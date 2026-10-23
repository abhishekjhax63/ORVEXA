import type { NextRequest } from "next/server";

import { createConversation, listConversations } from "@/lib/ai/conversations";
import { aiConversationCreateSchema } from "@/lib/ai/validation";
import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * The user's AI conversations.
 *
 * Every row is filtered by the session's own user id, so a guessed conversation
 * id in a later request cannot reach somebody else's symptoms. The session is
 * resolved on the server; nothing in the request body can name an owner.
 */
export async function GET() {
  const session = await requireRoutePermission("ai.assess");
  if (!session.ok) return session.response;

  const conversations = await listConversations(session.user.id);
  return jsonOk({ conversations });
}

/**
 * Open a stored conversation.
 *
 * `consentToStore` is required rather than defaulted. Storage is the point of
 * this endpoint — an ephemeral turn needs no conversation at all — and a
 * conversation created without consent would be a row the user never agreed to.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("ai.assess");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("aiWrite", `user:${session.user.id}`, RATE_LIMITS.aiWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = aiConversationCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  if (!parsed.data.consentToStore) {
    return jsonError(
      409,
      "A stored conversation needs your agreement to store it. Without that, an assessment is answered without being kept.",
    );
  }

  const conversation = await createConversation({
    ownerUserId: session.user.id,
    language: parsed.data.language,
    title: parsed.data.title || null,
    policyVersion: parsed.data.consentPolicyVersion,
    familyMemberId: parsed.data.familyMemberId ?? null,
  });

  return jsonOk(
    {
      conversation: {
        id: conversation.id,
        language: conversation.language,
        familyMemberId: conversation.familyMemberId,
        consentedAt: conversation.consentedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
