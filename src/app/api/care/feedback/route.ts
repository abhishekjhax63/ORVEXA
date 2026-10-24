import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { listMyFeedback, submitFeedback } from "@/lib/care/support";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { feedbackSubmitSchema } from "@/lib/validation/care";

/** The caller's own feedback, newest first. */
export async function GET(_request: NextRequest) {
  const session = await requireRoutePermission("care.feedback_own");
  if (!session.ok) return session.response;

  const feedback = await listMyFeedback({ user: session.user });
  return jsonOk({ feedback });
}

/**
 * Leave a rating, a comment, or both.
 *
 * Feedback is a note for the platform, not a case: nothing here promises a
 * reply, and a person who wants an answer raises a support ticket instead.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.feedback_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = feedbackSubmitSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That feedback is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await submitFeedback({ user: session.user, data: parsed.data });
  if (!result.ok) {
    const status = result.code === "consent_required" ? 403 : result.code === "not_found" || result.code.endsWith("_not_found") ? 404 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ feedbackId: result.data.feedbackId });
}
