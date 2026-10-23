import type { NextRequest } from "next/server";

import { shareAssessment } from "@/lib/ai/conversations";
import { aiShareRequestSchema } from "@/lib/ai/validation";
import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * Create a clinician share link for a saved assessment.
 *
 * Sharing is an export, so it carries the export permission and requires the
 * explicit `consentToShare` flag. The link is a bearer token, which is why it
 * expires, why only its HMAC is stored, and why the assessment must already be
 * saved — a share should point at something the user chose to keep.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("ai.export");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("aiShare", `user:${session.user.id}`, RATE_LIMITS.aiShare);
  if (!limit.allowed) {
    return jsonError(429, "Too many share links created. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = aiShareRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  if (parsed.data.assessmentId !== id) {
    return jsonError(400, "The assessment id in the request did not match the one being shared.");
  }

  if (!parsed.data.consentToShare) {
    return jsonError(409, "Sharing sends this report outside your account, which needs your explicit agreement.");
  }

  const result = await shareAssessment({
    ownerUserId: session.user.id,
    assessmentId: id,
    recipientLabel: parsed.data.recipientLabel,
    recipientEmail: parsed.data.recipientEmail || null,
    policyVersion: undefined,
    origin: request.nextUrl.origin,
  });
  if (!result.ok) return jsonError(result.status, result.message);

  return jsonOk({ share: result.data }, { status: 201 });
}
