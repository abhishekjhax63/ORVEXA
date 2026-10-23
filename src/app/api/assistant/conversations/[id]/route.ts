import type { NextRequest } from "next/server";

import { deleteConversation, getConversationThread } from "@/lib/ai/conversations";
import { aiDeleteRequestSchema } from "@/lib/ai/validation";
import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * One conversation, with its messages, uploads and assessments.
 *
 * A conversation that is not on the session's account returns 404 rather than
 * 403, so conversation ids cannot be probed for existence.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("ai.assess");
  if (!session.ok) return session.response;

  const { id } = await params;
  const thread = await getConversationThread({ ownerUserId: session.user.id, conversationId: id });
  if (!thread) return jsonError(404, "That conversation was not found on your account.");

  return jsonOk({ conversation: thread.conversation, messages: thread.messages });
}

/**
 * Delete a conversation and everything derived from it.
 *
 * The typed confirmation in the body is the point of using DELETE here: the
 * action removes the stored bytes, the messages, the assessments and any live
 * share links, and there is no undo. Confirming that the id in the body matches
 * the id in the path stops a mistyped paste from deleting the wrong thread.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("ai.assess");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("aiWrite", `user:${session.user.id}`, RATE_LIMITS.aiWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = aiDeleteRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "Type the word delete to confirm removing this conversation.", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }

  if (parsed.data.conversationId !== id) {
    return jsonError(400, "The conversation id in the request did not match the one being deleted.");
  }

  const result = await deleteConversation({ ownerUserId: session.user.id, conversationId: id });
  if (!result.ok) return jsonError(result.status, result.message);

  return jsonOk({
    deleted: true,
    removedObjects: result.data.removedObjects,
    // Surfaced rather than swallowed: a file that could not be removed from
    // storage is a deletion that did not fully complete, and the user is told.
    storageUnavailable: result.data.storageUnavailable,
  });
}
