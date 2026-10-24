import type { NextRequest } from "next/server";

import { jsonError, jsonOk, zodFieldErrors } from "@/lib/auth/route-session";
import { listDiagnosticCategories, searchDiagnostics } from "@/lib/diagnostics/catalogue";
import { clientIpFromHeaders } from "@/lib/security/request";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { diagnosticSearchSchema } from "@/lib/validation/diagnostics";

/**
 * Discovery: verified laboratories and the tests they publish.
 *
 * Open to anyone — a person comparing the price of a lipid profile should not
 * have to hand over an account first. It is rate-limited by IP, and it can only
 * ever return laboratories a reviewer has verified and tests the platform has
 * made listable.
 */
export async function GET(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers) ?? "unknown";
  const limit = await consumeRateLimit("diagnosticsSearch", `ip:${ip}`, RATE_LIMITS.diagnosticsSearch);
  if (!limit.allowed) {
    return jsonError(429, "Too many searches from this network. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsed = diagnosticSearchSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return jsonError(422, "That search is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const [result, categories] = await Promise.all([
    searchDiagnostics(parsed.data),
    listDiagnosticCategories(),
  ]);

  return jsonOk({ ...result, categories });
}
