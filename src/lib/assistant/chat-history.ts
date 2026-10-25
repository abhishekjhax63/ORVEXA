/**
 * Conversation history for the Sakha assistant.
 *
 * Sakha is a multi-turn assistant, so a follow-up like "and if it lasts a week?"
 * is only answerable if the previous turns travel with it. Both assistant
 * routes accept this shape, and both read it through this one function so that
 * a change to the limits cannot apply to one of them and not the other.
 *
 * The client is not trusted with the shape. Anything malformed is dropped
 * rather than rejected: a stale or partly-broken transcript should cost the
 * user the context, not the message. What is *not* tolerated is a role the
 * provider would treat as privileged — only `user` and `assistant` survive, so
 * a crafted history cannot inject a synthetic `system` turn.
 */

export const MAX_CHAT_HISTORY_TURNS = 10;
export const MAX_CHAT_TURN_CHARS = 2000;
export const MAX_CHAT_HISTORY_CHARS = 12_000;

export type ChatHistoryTurn = { role: "user" | "assistant"; content: string };

export function parseChatHistory(value: unknown): ChatHistoryTurn[] {
  if (!Array.isArray(value)) return [];

  const parsed: ChatHistoryTurn[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    parsed.push({ role, content: trimmed.slice(0, MAX_CHAT_TURN_CHARS) });
  }

  // Walk backwards from the newest turn so the most recent context is what
  // survives, then restore chronological order. Dropping the oldest turn is the
  // right failure: it is the one a follow-up is least likely to depend on.
  const kept: ChatHistoryTurn[] = [];
  let budget = MAX_CHAT_HISTORY_CHARS;
  for (let index = parsed.length - 1; index >= 0 && kept.length < MAX_CHAT_HISTORY_TURNS; index -= 1) {
    const turn = parsed[index];
    if (turn.content.length > budget) break;
    budget -= turn.content.length;
    kept.push(turn);
  }

  return kept.reverse();
}
