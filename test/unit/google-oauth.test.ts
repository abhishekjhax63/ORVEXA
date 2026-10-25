import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GOOGLE_STATE_COOKIE,
  createGoogleAuthorization,
  exchangeGoogleCode,
  googleAuthorizeUrl,
  googleOAuthConfig,
  googleOAuthAvailable,
  unguessablePassword,
} from "@/lib/auth/google";
import { safeNextPath } from "@/lib/auth/redirect";

/**
 * Google OAuth contract tests.
 *
 * Two things are worth pinning here. First, the PKCE verifier must never leave
 * the server other than inside the httpOnly state cookie — the URL only carries
 * its SHA-256 challenge, so a leaked authorize URL is not enough to complete
 * the exchange. Second, an address Google has not verified must not be accepted
 * as proof of ownership, because accepting one would let somebody claim an
 * ORVEXA account they do not own.
 */

const ENV_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI", "NEXT_PUBLIC_SITE_URL"] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

describe("safeNextPath", () => {
  it("accepts same-origin absolute paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/appointments?tab=upcoming")).toBe("/appointments?tab=upcoming");
  });

  it("refuses anything that could redirect off this origin", () => {
    expect(safeNextPath("//evil.example")).toBeUndefined();
    expect(safeNextPath("https://evil.example")).toBeUndefined();
    expect(safeNextPath("http://evil.example/x")).toBeUndefined();
    expect(safeNextPath("javascript:alert(1)")).toBeUndefined();
    expect(safeNextPath("/\\evil.example")).toBeUndefined();
    expect(safeNextPath("dashboard")).toBeUndefined();
    expect(safeNextPath("")).toBeUndefined();
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath(null)).toBeUndefined();
  });
});

describe("googleOAuthConfig", () => {
  it("reports Google as unavailable until both halves of the credential exist", () => {
    expect(googleOAuthConfig()).toBeNull();
    expect(googleOAuthAvailable()).toBe(false);

    process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
    expect(googleOAuthConfig()).toBeNull();

    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "shhh";
    expect(googleOAuthConfig()).toBeNull();
  });

  it("derives the callback from the public site URL", () => {
    process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "shhh";
    process.env.NEXT_PUBLIC_SITE_URL = "https://orvexa.example";

    expect(googleOAuthConfig()?.redirectUri).toBe("https://orvexa.example/api/auth/google/callback");
    expect(googleOAuthAvailable()).toBe(true);
  });

  it("lets an explicit redirect URI override the derived one", () => {
    process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "shhh";
    process.env.NEXT_PUBLIC_SITE_URL = "https://orvexa.example";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://auth.orvexa.example/api/auth/google/callback";

    expect(googleOAuthConfig()?.redirectUri).toBe("https://auth.orvexa.example/api/auth/google/callback");
  });
});

describe("googleAuthorizeUrl", () => {
  const config = {
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "super-secret-value",
    redirectUri: "https://orvexa.example/api/auth/google/callback",
  };

  it("sends only the PKCE challenge, never the verifier or the client secret", () => {
    const authorization = createGoogleAuthorization();
    const url = new URL(googleAuthorizeUrl(config, authorization));

    expect(url.searchParams.get("code_challenge")).toBe(authorization.codeChallenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(authorization.state);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("scope")).toBe("openid email profile");

    expect(url.search).not.toContain(authorization.codeVerifier);
    expect(url.search).not.toContain(config.clientSecret);
    expect(googleAuthorizeUrl(config, authorization)).not.toContain(config.clientSecret);
  });

  it("derives the challenge as SHA-256 of the verifier", () => {
    const authorization = createGoogleAuthorization();
    // Recomputed independently, so a change to the digest would fail here.
    const expected = createHash("sha256")
      .update(authorization.codeVerifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(authorization.codeChallenge).toBe(expected);
  });

  it("issues a distinct state and verifier per attempt", () => {
    const first = createGoogleAuthorization();
    const second = createGoogleAuthorization();

    expect(first.state).not.toBe(second.state);
    expect(first.codeVerifier).not.toBe(second.codeVerifier);
  });
});

describe("exchangeGoogleCode", () => {
  const config = {
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "super-secret-value",
    redirectUri: "https://orvexa.example/api/auth/google/callback",
  };

  function stubFetch(token: () => Response, profile: () => Response) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com")) return token();
      if (url.includes("openidconnect.googleapis.com")) return profile();
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  it("accepts a verified Google address", async () => {
    stubFetch(
      () => json({ access_token: "ya29.token" }),
      () => json({ sub: "1234567890", email: "Person@Example.com", email_verified: true, name: "A Person", picture: "https://lh3.googleusercontent.com/a/photo" }),
    );

    const result = await exchangeGoogleCode(config, { code: "auth-code", codeVerifier: "verifier" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity).toEqual({
      subject: "1234567890",
      email: "person@example.com",
      fullName: "A Person",
      avatarUrl: "https://lh3.googleusercontent.com/a/photo",
    });
  });

  it("refuses an address Google has not verified", async () => {
    stubFetch(
      () => json({ access_token: "ya29.token" }),
      () => json({ sub: "1234567890", email: "person@example.com", email_verified: false, name: "A Person" }),
    );

    const result = await exchangeGoogleCode(config, { code: "auth-code", codeVerifier: "verifier" });

    expect(result).toEqual({ ok: false, reason: "email_unavailable" });
  });

  it("refuses a profile with no email at all", async () => {
    stubFetch(
      () => json({ access_token: "ya29.token" }),
      () => json({ sub: "1234567890", email_verified: true, name: "A Person" }),
    );

    expect(await exchangeGoogleCode(config, { code: "c", codeVerifier: "v" })).toEqual({
      ok: false,
      reason: "email_unavailable",
    });
  });

  it("does not reach the profile endpoint when the token exchange is rejected", async () => {
    const fetchMock = stubFetch(() => json({ error: "invalid_grant" }, 400), () => json({}));

    const result = await exchangeGoogleCode(config, { code: "stale-code", codeVerifier: "verifier" });

    expect(result).toEqual({ ok: false, reason: "exchange_failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a transport failure as a failed exchange rather than a success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    );

    expect(await exchangeGoogleCode(config, { code: "c", codeVerifier: "v" })).toEqual({
      ok: false,
      reason: "exchange_failed",
    });
  });

  it("never puts the client secret in a returned failure reason", async () => {
    stubFetch(() => json({ error: "invalid_client", error_description: config.clientSecret }, 401), () => json({}));

    const result = await exchangeGoogleCode(config, { code: "c", codeVerifier: "v" });

    expect(JSON.stringify(result)).not.toContain(config.clientSecret);
  });

  it("only accepts an https profile picture", async () => {
    stubFetch(
      () => json({ access_token: "ya29.token" }),
      () => json({ sub: "1", email: "a@b.com", email_verified: true, name: "A", picture: "http://insecure.example/p.png" }),
    );

    const result = await exchangeGoogleCode(config, { code: "c", codeVerifier: "v" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.avatarUrl).toBeNull();
  });
});

describe("unguessablePassword", () => {
  it("produces a distinct, high-entropy string each time", () => {
    const first = unguessablePassword();
    const second = unguessablePassword();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
  });
});

describe("GOOGLE_STATE_COOKIE", () => {
  it("is a name, not a value, and carries no prefix that would leak the provider", () => {
    expect(GOOGLE_STATE_COOKIE).toBe("orvexa_oauth_state");
  });
});
