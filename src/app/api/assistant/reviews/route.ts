import type { NextRequest } from "next/server";

import { getAssessment, listClinicalReviewQueue, requestClinicalReview } from "@/lib/ai/conversations";
import { aiReviewRequestSchema } from "@/lib/ai/validation";
import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * The clinical review queue.
 *
 * Gated on `ai.clinical_review`, which is held only by roles with a clinical
 * duty. Items are deliberately pseudonymous — a reviewer judges the assessment,
 * not the person — and carry the urgency and red-flag codes so the worst cases
 * can be triaged first without opening every thread.
 */
export async function GET() {
  const session = await requireRoutePermission("ai.clinical_review");
  if (!session.ok) return session.response;

  const queue = await listClinicalReviewQueue();
  return jsonOk({ queue });
}

/**
 * Ask for a clinician to review one of the user's own assessments.
 *
 * Ownership is checked before the review is created so a guessed assessment id
 * cannot be pushed into a reviewer's queue. The service is idempotent against
 * an already-open review, so a double submit does not open two.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("ai.assess");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("aiReviewWrite", `user:${session.user.id}`, RATE_LIMITS.aiReviewWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = aiReviewRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const assessment = await getAssessment({ ownerUserId: session.user.id, assessmentId: parsed.data.assessmentId });
  if (!assessment) return jsonError(404, "That assessment was not found on your account.");

  const result = await requestClinicalReview({
    requestedById: session.user.id,
    assessmentId: parsed.data.assessmentId,
    requestNotes: parsed.data.requestNotes || null,
    specialty: parsed.data.specialty || null,
  });
  if (!result.ok) return jsonError(result.status, result.message);

  return jsonOk({ reviewId: result.data.reviewId }, { status: 201 });
}
