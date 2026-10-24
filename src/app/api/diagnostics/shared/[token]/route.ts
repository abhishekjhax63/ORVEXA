import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { resolveLabReportShare, REPORT_RESULT_DISCIPLINE_NOTICE } from "@/lib/diagnostics/reports";
import { clientIpFromHeaders, getRequestContext } from "@/lib/security/request";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * Resolves a report share link.
 *
 * There is no session here: the token is the credential, which is exactly why it
 * expires, why only its HMAC is stored, and why a revoked or expired token is
 * reported as such rather than falling back to anything. Every resolution is
 * counted on the share and written to the report's access history.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIpFromHeaders(request.headers) ?? "unknown";
  const limit = await consumeRateLimit("diagnosticShareView", `ip:${ip}`, RATE_LIMITS.diagnosticShareView);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests from this network. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { token } = await params;
  const context = await getRequestContext();

  const result = await resolveLabReportShare({
    token: decodeURIComponent(token),
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });
  if (!result.ok) {
    const status = result.code === "share_not_found" ? 404 : result.code === "share_expired" ? 410 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ view: result.view, disciplineNotice: REPORT_RESULT_DISCIPLINE_NOTICE });
}
