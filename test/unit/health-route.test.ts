import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

/**
 * Contract tests for the health endpoint.
 *
 * These stub the Prisma client and the `next/server` connection marker, so what
 * they prove is the handler's *decisions*: which status code each probe outcome
 * maps to, and that no configured value ever reaches the payload. They are not a
 * database integration test — the real `SELECT 1` round-trip against a live
 * Postgres is still outstanding, because no PostgreSQL instance is reachable
 * from this environment (recorded in RELEASE-READINESS.md).
 */

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("next/server", () => ({
  /** No-op: outside a Next render pass there is no prerender to interrupt. */
  connection: async () => {},
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string>) },
      }),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({ $queryRaw: queryRaw }) }));

/** Fails loudly rather than hanging, so a regression is not a stuck test run. */
const UNRESOLVED = new Promise<never>(() => {});

describe("GET /api/health", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    queryRaw.mockReset();
  });

  it("answers 200 and ok when the database returns rows", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database.status).toBe("up");
    expect(typeof body.database.latencyMs).toBe("number");
  });

  it("answers 503 and unavailable when the database is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(new Error("Can't reach database server at `db.internal:5432`"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("unavailable");
    expect(body.database.status).toBe("down");
    expect(body.database.failure).toBe("unreachable");
  });

  it("answers 503 when the probe times out instead of hanging", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    queryRaw.mockReturnValue(UNRESOLVED);

    const pending = GET();
    await vi.advanceTimersByTimeAsync(3000);
    const response = await pending;
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.database.failure).toBe("timeout");
  });

  it("treats a non-array result as down, so the no-op client cannot fake health", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The lazy Prisma client falls back to a proxy that resolves queries to null.
    queryRaw.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.database.failure).toBe("invalid-response");
  });

  it("publishes capability only — no key, secret or internal host reaches the payload", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sentinels = {
      RAZORPAY_KEY_ID: "rzp_test_sentinel_key_id",
      RAZORPAY_KEY_SECRET: "sentinel_key_secret",
      OPENAI_API_KEY: "sentinel_openai_key",
      AUTH_SECRET: "sentinel_auth_secret",
      SMS_PROVIDER_API_KEY: "sentinel_sms_key",
      SMS_PROVIDER_SENDER_ID: "ORVEXA",
    };
    const previous = Object.fromEntries(Object.keys(sentinels).map((key) => [key, process.env[key]]));
    Object.assign(process.env, sentinels);

    try {
      // The failure path is the one that could carry a host name, so probe it.
      queryRaw.mockRejectedValue(new Error("Can't reach database server at `db.internal:5432`"));
      const body = await (await GET()).json();
      const serialised = JSON.stringify(body);

      expect(body.integrations.payments).toBe("configured");
      expect(body.integrations.sms).toBe("configured");
      for (const secret of Object.values(sentinels)) {
        // The sender id is publishable; the rest must not appear at all.
        if (secret === sentinels.SMS_PROVIDER_SENDER_ID) continue;
        expect(serialised).not.toContain(secret);
      }
      expect(serialised).not.toContain("db.internal");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
