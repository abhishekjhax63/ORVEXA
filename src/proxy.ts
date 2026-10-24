import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { SECURITY_HEADERS, SENSITIVE_AREA_HEADERS } from "@/lib/security/headers";

/**
 * Runs before every matched request to:
 *  1. refuse cross-site state changes to the administrative API,
 *  2. refresh the Supabase session cookie so Server Components see a live token,
 *  3. do an *optimistic* redirect for the patient area, and
 *  4. stamp the security headers onto any response this file produces itself.
 *
 * This is not the security boundary. Every protected page re-verifies the
 * session through the data access layer, and every administrative Route Handler
 * and Server Function re-derives the operator's permissions server-side through
 * `src/lib/platform/console.ts`. A proxy matcher can be changed by an unrelated
 * refactor and silently stop covering a path, so nothing here is allowed to be
 * the only thing standing between a request and a privileged action.
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

export async function proxy(request: NextRequest) {
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

  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return harden(response, { sensitive: isAdminApi(pathname) });
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be `getUser()` and not `getSession()`: it revalidates the token with
  // Supabase instead of trusting the cookie contents.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPatientArea = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isPatientArea && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return harden(NextResponse.redirect(url), { sensitive: true });
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return harden(NextResponse.redirect(url));
  }

  return harden(response, { sensitive: isAdminApi(pathname) });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
