import type { NextRequest } from "next/server";

import { saveAssessment } from "@/lib/ai/conversations";
import { aiSaveAssessmentSchema } from "@/lib/ai/validation";
import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * Save an assessment.
 *
 * A conversation the user agreed to store already wrote the row; saving is the
 * second, explicit decision that extends retention and is what sharing later
 * requires. Consent is checked here as well as at conversation creation so a
 * request that flips the flag cannot save something that was taken without
 * agreement.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = aiSaveAssessmentSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  if (parsed.data.assessmentId !== id) {
    return jsonError(400, "The assessment id in the request did not match the one being saved.");
  }

  if (!parsed.data.consentToStore) {
    return jsonError(409, "Saving keeps this assessment on your account, which needs your agreement to store it.");
  }

  const result = await saveAssessment({
    ownerUserId: session.user.id,
    assessmentId: id,
    policyVersion: parsed.data.consentPolicyVersion,
  });
  if (!result.ok) return jsonError(result.status, result.message);

  return jsonOk({ assessment: result.data });
}
