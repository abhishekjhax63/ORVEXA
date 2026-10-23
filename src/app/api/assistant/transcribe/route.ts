import type { NextRequest } from "next/server";

import { UPLOAD_LIMITS } from "@/lib/ai/capabilities";
import { aiCapabilityReport } from "@/lib/ai/config";
import { transcribeAudio } from "@/lib/ai/turn";
import { formatBytes, aiTranscribeFieldsSchema } from "@/lib/ai/validation";
import { jsonError, jsonOk, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * Transcribe a voice note so the user can read it back before it is used.
 *
 * A transcript is a convenience, not an assessment: when it cannot be produced
 * the honest answer is that it could not, and the user types instead. There is
 * deliberately no placeholder text that looks like their words — a fabricated
 * transcript of a symptom description would be the worst possible output.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("ai.assess");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("aiTranscribe", `user:${session.user.id}`, RATE_LIMITS.aiTranscribe);
  if (!limit.allowed) {
    return jsonError(429, "Too many voice notes. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const report = aiCapabilityReport();
  if (!report.available.includes("AUDIO_TRANSCRIPTION")) {
    return jsonError(
      503,
      "Voice notes are not available on this deployment, so nothing was transcribed. Type what you wanted to say instead.",
      { capability: "AUDIO_TRANSCRIPTION", providerLabel: report.providerLabel },
    );
  }

  const audioLimit = Math.min(UPLOAD_LIMITS.maxPerKindBytes.AUDIO, UPLOAD_LIMITS.maxFileBytes);
  const bodyCeiling = audioLimit + 512 * 1024;
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > bodyCeiling) {
    return jsonError(413, `That recording is larger than the ${formatBytes(audioLimit)} limit. Nothing was stored.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Send this recording as multipart form data.");
  }

  const conversationId = form.get("conversationId");
  const parsedFields = aiTranscribeFieldsSchema.safeParse({
    conversationId: typeof conversationId === "string" && conversationId.trim() ? conversationId : undefined,
    language: form.get("language") ?? undefined,
  });
  if (!parsedFields.success) {
    return jsonError(422, "That request is not valid.", { fieldErrors: zodFieldErrors(parsedFields.error) });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size <= 0) {
    return jsonError(400, "This request did not include a recording.");
  }
  if (audio.size > audioLimit) {
    return jsonError(413, `That recording is ${formatBytes(audio.size)}. The limit is ${formatBytes(audioLimit)}.`);
  }

  const bytes = new Uint8Array(await audio.arrayBuffer());
  const result = await transcribeAudio({
    ownerUserId: session.user.id,
    conversationId: parsedFields.data.conversationId ?? null,
    bytes,
    mimeType: audio.type || "audio/webm",
    language: parsedFields.data.language ?? null,
  });

  if (!result) {
    return jsonOk({
      transcript: null,
      notice: "A transcript could not be produced, so nothing was transcribed and nothing was saved. Type what you said instead.",
    });
  }

  return jsonOk({ transcript: result.transcript });
}
