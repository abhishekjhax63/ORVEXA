import type { NextRequest } from "next/server";

import { decideClinicalReview } from "@/lib/ai/conversations";
import { aiReviewDecisionSchema } from "@/lib/ai/validation";
import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * Record a reviewer's decision on an assessment.
 *
 * The reviewer's own words are stored, not a summarised verdict: the notes are
 * what the user reads, and a decision without them would be a label with no
 * reasoning behind it. The reviewer is named from their session, never from the
 * request body, so a decision cannot be attributed to somebody else.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("ai.clinical_review");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("aiReviewWrite", `user:${session.user.id}`, RATE_LIMITS.aiReviewWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = aiReviewDecisionSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  if (parsed.data.reviewId !== id) {
    return jsonError(400, "The review id in the request did not match the one being decided.");
  }

  const result = await decideClinicalReview({
    reviewerUserId: session.user.id,
    reviewId: id,
    decision: parsed.data.decision,
    reviewNotes: parsed.data.reviewNotes,
    reviewerLabel: session.user.fullName || session.user.email,
  });
  if (!result.ok) return jsonError(result.status, result.message);

  return jsonOk({ reviewId: result.data.reviewId, decision: parsed.data.decision });
}
