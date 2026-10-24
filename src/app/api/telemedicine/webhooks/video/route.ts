import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { clientIpFromHeaders } from "@/lib/security/request";
import { ingestVideoWebhook } from "@/lib/telemedicine/sessions";

/**
 * The video provider's callback endpoint.
 *
 * There is no session here: the provider is not signed in, and the body is the
 * only evidence. The raw bytes are read with `request.text()` and passed
 * unchanged to the service, which verifies the provider's signature over
 * exactly those bytes. A callback that cannot be attributed is stored with
 * `signatureValid: false` and never moves a session, but it is still
 * acknowledged so the provider stops retrying.
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers) ?? "unknown";
  const limit = await consumeRateLimit("videoWebhook", `ip:${ip}`, RATE_LIMITS.videoWebhook);
  if (!limit.allowed) {
    return Response.json(
      { ok: false, error: "Too many callbacks. Retry shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get("x-webhook-signature") ?? request.headers.get("x-daily-signature");

  const result = await ingestVideoWebhook({ rawBody, signatureHeader });
  return jsonOk({ ...result });
}
