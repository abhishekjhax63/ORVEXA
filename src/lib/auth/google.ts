import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getPublicBaseUrl, optionalEnv } from "@/lib/env";

/**
 * Google OAuth 2.0 (Authorization Code + PKCE) for the existing ORVEXA auth.
 *
 * This adds a second *way in* to the custom `orvexa_session` system — it does
 * not add a second authentication system. A successful exchange ends in exactly
 * the same `createSession` row and the same httpOnly cookie that password
 * sign-in produces, so everything downstream (roles, hospital tenancy, audit)
 * is unchanged and unaware of how the session was opened.
 *
 * Two details are deliberate:
 *
 *  - PKCE is used even though this is a confidential client with a secret. The
 *    verifier lives in an httpOnly cookie and never reaches the page, so an
 *    intercepted authorization code is useless on its own.
 *  - Nothing here logs a code, a token or a profile. A failure returns a short
 *    reason string and the caller decides what the user is told.
 */

export const GOOGLE_STATE_COOKIE = "orvexa_oauth_state";

const GOOGLE_AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

/** How long the browser has to complete the round-trip before the state expires. */
export const GOOGLE_STATE_TTL_SECONDS = 600;

const REQUEST_TIMEOUT_MS = 10_000;

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Returns the configuration only when *both* halves of the credential are
 * present. A half-configured Google client is worse than none: the button would
 * open a consent screen that always fails at the token exchange.
 */
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = optionalEnv("GOOGLE_CLIENT_ID");
  const clientSecret = optionalEnv("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    // Must match a redirect URI registered on the OAuth client, character for
    // character. `getPublicBaseUrl()` is `NEXT_PUBLIC_SITE_URL`, so a deployment
    // that sets it gets the right callback URL without a second variable.
    redirectUri:
      optionalEnv("GOOGLE_OAUTH_REDIRECT_URI") ?? `${getPublicBaseUrl()}/api/auth/google/callback`,
  };
}

export function googleOAuthAvailable(): boolean {
  return googleOAuthConfig() !== null;
}

function base64Url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh state + PKCE pair for one sign-in attempt. */
export function createGoogleAuthorization() {
  const codeVerifier = base64Url(randomBytes(32));
  return {
    state: base64Url(randomBytes(16)),
    codeVerifier,
    codeChallenge: base64Url(createHash("sha256").update(codeVerifier).digest()),
  };
}

export function googleAuthorizeUrl(
  config: GoogleOAuthConfig,
  authorization: { state: string; codeChallenge: string },
) {
  const url = new URL(GOOGLE_AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", authorization.state);
  url.searchParams.set("code_challenge", authorization.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Nothing is refreshed offline; a session is opened here or not at all.
  url.searchParams.set("access_type", "online");
  // Always show the account chooser, so a shared device cannot silently reuse
  // the previous person's Google session.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export type GoogleIdentity = {
  /** The Google subject id — stable for the account, unlike the email. */
  subject: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
};

export type GoogleExchangeResult =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; reason: "exchange_failed" | "profile_failed" | "email_unavailable" };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Trades the authorization code for tokens and then for the verified profile.
 *
 * The profile is only accepted when Google marks the address as verified. An
 * unverified Google address is not proof of ownership, and accepting one would
 * let somebody claim an ORVEXA account they do not own.
 */
export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  input: { code: string; codeVerifier: string },
): Promise<GoogleExchangeResult> {
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        code: input.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: input.codeVerifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }

  if (!tokenResponse.ok) return { ok: false, reason: "exchange_failed" };

  const tokens = asRecord(await tokenResponse.json().catch(() => null));
  const accessToken = tokens?.access_token;
  if (typeof accessToken !== "string" || !accessToken) return { ok: false, reason: "exchange_failed" };

  let profileResponse: Response;
  try {
    profileResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "profile_failed" };
  }

  if (!profileResponse.ok) return { ok: false, reason: "profile_failed" };

  const profile = asRecord(await profileResponse.json().catch(() => null));
  if (!profile) return { ok: false, reason: "profile_failed" };

  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  if (!email || profile.email_verified !== true) return { ok: false, reason: "email_unavailable" };

  const subject = typeof profile.sub === "string" ? profile.sub : "";
  if (!subject) return { ok: false, reason: "profile_failed" };

  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim().slice(0, 120) : email;
  const picture = typeof profile.picture === "string" && profile.picture.startsWith("https://") ? profile.picture : null;

  return { ok: true, identity: { subject, email, fullName: name, avatarUrl: picture } };
}

/** A password that nobody knows and nobody can guess. */
export function unguessablePassword() {
  return base64Url(randomBytes(32));
}
