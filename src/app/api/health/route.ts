import { connection, NextResponse } from "next/server";

import { emailDeliveryAvailable } from "@/lib/actions/email-delivery";
import { isAiConfigured } from "@/lib/ai/config";
import { getPrisma } from "@/lib/db/prisma";
import {
  getEmergencyDispatchConfig,
  getInsurerIntegrationConfig,
  getLabIntegrationConfig,
  getMapsServerConfig,
  getPaymentProviderConfig,
  getReportExchangeConfig,
  getSmsProviderConfig,
  getVideoProviderConfig,
} from "@/lib/env";

/**
 * Liveness and readiness for uptime monitors and release verification.
 *
 * Liveness is implicit: a monitor receiving any response at all knows the
 * process is serving. Readiness is the database round-trip below. An instance
 * that cannot reach Postgres must be taken out of rotation, so this answers 503
 * rather than a reassuring 200 — a health check that always returns 200 is worse
 * than no health check, because it trains the operator to ignore it.
 *
 * The payload reports integration *capability*, never configuration. Every value
 * is a boolean or a mode name; no key, token, secret or connection string is
 * echoed, which is what makes this endpoint safe to leave unauthenticated. Do not
 * add anything here that is not already public.
 *
 * This route must answer per request. A database round-trip is not something the
 * framework can recognise as runtime data the way it recognises `cookies()`, so
 * without `connection()` below the build would happily prerender a health
 * response and then serve that frozen snapshot — reporting the database state
 * from build time forever. `connection()` is the documented way to say "this
 * cannot be decided until a request arrives" (see `dist/docs/…/connection.md`).
 * Note that with Cache Components enabled the `dynamic` route segment config no
 * longer exists and must not be re-added.
 */

/** Kept below a typical monitor timeout so the caller sees a 503, not a hang. */
const DATABASE_PROBE_TIMEOUT_MS = 3000;

/** Sentinels for the two failures this probe can raise itself. */
const PROBE_TIMEOUT = "database probe timed out";
const PROBE_NO_ROWS = "database probe returned no rows";

/** The public failure vocabulary. Anything not raised above is `unreachable`. */
type ProbeFailure = "timeout" | "unreachable" | "invalid-response";

type IntegrationState = "configured" | "sandbox" | "not-configured";

function state(configured: boolean): IntegrationState {
  return configured ? "configured" : "not-configured";
}

async function probeDatabase() {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const prisma = getPrisma();
    // Tagged template — Prisma parameterises this, so it is not string-built SQL.
    const query = prisma.$queryRaw`SELECT 1`;
    const result = await Promise.race([
      query,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(PROBE_TIMEOUT)), DATABASE_PROBE_TIMEOUT_MS);
      }),
    ]);

    // The lazy client falls back to a no-op proxy when the generated client is
    // missing, and that proxy resolves queries to `null`. A real `SELECT 1`
    // returns rows, so requiring an array stops that case reporting "up".
    if (!Array.isArray(result)) throw new Error(PROBE_NO_ROWS);

    return { status: "up" as const, latencyMs: Date.now() - startedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    /**
     * Operators get the real message in the server log; the public payload gets a
     * coarse class only. Prisma's connectivity errors name the database host and
     * port — verified against the actual message, which reads
     * `Can't reach database server at \`host:5432\`` and carries no credentials —
     * and internal host names do not belong on an unauthenticated endpoint.
     */
    console.error("[health] database probe failed:", message);

    // Only our own two strings are matched, so this cannot misread a driver error.
    const failure: ProbeFailure =
      message === PROBE_TIMEOUT
        ? "timeout"
        : message === PROBE_NO_ROWS
          ? "invalid-response"
          : "unreachable";

    return { status: "down" as const, latencyMs: Date.now() - startedAt, failure };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  // Prerendering stops here, so the probe below always runs against live state.
  await connection();

  const database = await probeDatabase();

  const payments = getPaymentProviderConfig();
  const video = getVideoProviderConfig();

  const body = {
    status: database.status === "up" ? "ok" : "unavailable",
    checkedAt: new Date().toISOString(),
    /** Set by the hosting platform on deploy; `null` outside a CI deployment. */
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null,
    database,
    integrations: {
      email: state(emailDeliveryAvailable()),
      sms: state(Boolean(getSmsProviderConfig())),
      maps: state(Boolean(getMapsServerConfig())),
      // Matches the subsystem that actually serves AI requests: `AI_PROVIDER`
      // plus that provider's key. Reading only `OPENAI_API_KEY` here both
      // under-reported a working BluesMinds deployment and over-reported a
      // deployment holding a key the resolver would never use.
      ai: state(isAiConfigured()),
      payments: payments.mode === "razorpay" ? ("configured" as const) : ("sandbox" as const),
      video: video.mode === "daily" ? ("configured" as const) : ("sandbox" as const),
      insurer: state(Boolean(getInsurerIntegrationConfig())),
      lab: state(Boolean(getLabIntegrationConfig())),
      reportExchange: state(Boolean(getReportExchangeConfig())),
      emergencyDispatch: state(Boolean(getEmergencyDispatchConfig())),
    },
  };

  return NextResponse.json(body, {
    status: database.status === "up" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
