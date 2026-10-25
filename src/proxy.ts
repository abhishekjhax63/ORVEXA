import { NextResponse, type NextRequest } from "next/server";

import { SECURITY_HEADERS, SENSITIVE_AREA_HEADERS } from "@/lib/security/headers";

/**
 * Refuses cross-site state changes to the administrative API and stamps
 * security headers onto responses produced here.
 *
 * Authentication in this app uses the database-backed `orvexa_session`
 * cookie. Protected pages and handlers must use the server-side auth guards;
 * this proxy deliberately does not trust a separate Supabase session as an
 * authentication boundary.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * A browser sends `Origin` on every cross-site state-changing request, so a
 * mismatch here is a form or script on another site driving our admin API with
 * the victim's cookies. A *missing* Origin is not that: same-origin posts and
 * server-to-server callers (payment and telephony webhooks) omit it, and
 * blocking those would break settlement.
 */
function comesFromOwnOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isAdminApi(pathname: string) {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

/**
 * `headers()` in `next.config.ts` does not cover responses the proxy returns
 * itself (a redirect is produced after that stage), so those are stamped here.
 */
function harden(response: NextResponse, options: { sensitive?: boolean } = {}) {
  for (const { key, value } of SECURITY_HEADERS) response.headers.set(key, value);
  if (options.sensitive) {
    for (const { key, value } of SENSITIVE_AREA_HEADERS) response.headers.set(key, value);
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cheapest check first, and it runs before anything touches the session.
  if (isAdminApi(pathname) && MUTATING_METHODS.has(request.method) && !comesFromOwnOrigin(request)) {
    return harden(
      NextResponse.json(
        { error: "cross_origin_request_blocked" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
      { sensitive: true },
    );
  }

  return harden(NextResponse.next({ request }), { sensitive: isAdminApi(pathname) });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
