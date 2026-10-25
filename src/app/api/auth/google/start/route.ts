import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_TTL_SECONDS,
  createGoogleAuthorization,
  googleAuthorizeUrl,
  googleOAuthConfig,
} from "@/lib/auth/google";
import { getCurrentUser } from "@/lib/auth/guards";
import { safeNextPath } from "@/lib/auth/redirect";
import { landingPathForRoles } from "@/lib/auth/roles";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request";

/**
 * Begins a Google sign-in.
 *
 * The state and PKCE verifier are written to a short-lived httpOnly cookie and
 * only the challenge is put in the URL, so the redirect the browser follows
 * carries nothing secret and nothing the page can read. `?next=` is validated
 * here and again on the way back.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const existing = await getCurrentUser();
  if (existing) {
    return NextResponse.redirect(new URL(landingPathForRoles(existing.roles), request.url));
  }

  const failWith = (reason: string) =>
    NextResponse.redirect(new URL(`/login?oauth=${encodeURIComponent(reason)}`, request.url));

  const config = googleOAuthConfig();
  if (!config) return failWith("unconfigured");

  const context = await getRequestContext();
  const limit = await consumeRateLimit(
    "loginByIp",
    context.ipAddress ? `ip:${context.ipAddress}` : "ip:unknown",
    RATE_LIMITS.loginByIp,
  );
  if (!limit.allowed) return failWith("rate_limited");

  const authorization = createGoogleAuthorization();
  const next = safeNextPath(url.searchParams.get("next"));

  const cookieStore = await cookies();
  cookieStore.set({
    name: GOOGLE_STATE_COOKIE,
    value: JSON.stringify({
      state: authorization.state,
      codeVerifier: authorization.codeVerifier,
      next: next ?? null,
    }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GOOGLE_STATE_TTL_SECONDS,
  });

  return NextResponse.redirect(googleAuthorizeUrl(config, authorization));
}
