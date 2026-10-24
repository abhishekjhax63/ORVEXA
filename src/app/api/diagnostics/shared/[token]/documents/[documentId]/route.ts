import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { createSharedReportDocumentLink } from "@/lib/diagnostics/reports";
import { clientIpFromHeaders } from "@/lib/security/request";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * A file link for a share-link viewer.
 *
 * The share itself decides whether the file may be downloaded: a view-only link
 * is refused here rather than hidden in the page. The token is re-validated on
 * every call, so revoking a share closes its downloads immediately.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string; documentId: string }> }) {
  const ip = clientIpFromHeaders(request.headers) ?? "unknown";
  const limit = await consumeRateLimit("diagnosticShareView", `ip:${ip}`, RATE_LIMITS.diagnosticShareView);
  if (!limit.allowed) {
    return jsonError(429, "Too many requests from this network. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { token, documentId } = await params;
  const result = await createSharedReportDocumentLink({
    token: decodeURIComponent(token),
    documentId: decodeURIComponent(documentId),
  });
  if (!result.ok) {
    const status =
      result.code === "not_found" ? 404 : result.code === "share_expired" ? 410 : result.code === "document_rejected" ? 409 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ url: result.url, expiresAt: result.expiresAt, fileName: result.fileName, mimeType: result.mimeType });
}
