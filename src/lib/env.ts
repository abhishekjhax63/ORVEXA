import "server-only";

/**
 * Server-side environment access. Values are read lazily so a missing variable
 * fails at the call site with an actionable message instead of crashing the
 * build or silently falling back to an insecure default.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `${name} is not configured. Copy .env.example to .env.local and set ${name} before running the app.`,
    );
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

/** Signing key for session-token and OTP-code hashing. */
export function getAuthSecret() {
  return requireEnv("AUTH_SECRET");
}

export function getDatabaseUrl() {
  return requireEnv("DATABASE_URL");
}

/** Shared secret that guards internal maintenance endpoints. */
export function getCronSecret() {
  return requireEnv("CRON_SECRET");
}

/**
 * Transactional email is only wired up when a provider key exists. Until then the
 * platform must not claim that verification or reset emails were delivered.
 */
export function getEmailProviderConfig() {
  const apiKey = optionalEnv("EMAIL_PROVIDER_API_KEY");
  const from = optionalEnv("EMAIL_PROVIDER_FROM");
  if (!apiKey || !from) return undefined;
  return { apiKey, from };
}

export function getSmsProviderConfig() {
  const apiKey = optionalEnv("SMS_PROVIDER_API_KEY");
  const senderId = optionalEnv("SMS_PROVIDER_SENDER_ID");
  if (!apiKey || !senderId) return undefined;
  return { apiKey, senderId };
}

/**
 * Server-side map credentials.
 *
 * Separate from the client config in `src/lib/maps/config.ts`: geocoding and
 * directions are proxied through our own route handlers so the secret token is
 * never shipped to the browser. Returns `undefined` when the provider is not
 * configured, and callers must surface that as "not configured" rather than
 * inventing a result.
 */
export function getMapsServerConfig() {
  const provider = optionalEnv("MAPS_PROVIDER")?.toLowerCase();
  if (provider !== "mapbox" && provider !== "google") return undefined;
  const secretToken = optionalEnv("MAPS_SERVER_TOKEN");
  if (!secretToken) return undefined;
  return { provider, secretToken } as const;
}

/**
 * Outbound emergency dispatch integration.
 *
 * A dispatch request is only ever *sent* when a webhook is configured. Without
 * one, the platform records the incident, shows the responders it found and
 * hands the user the dial actions — it never claims a request was delivered.
 */
export function getEmergencyDispatchConfig() {
  const webhookUrl = optionalEnv("EMERGENCY_DISPATCH_WEBHOOK_URL");
  const webhookSecret = optionalEnv("EMERGENCY_DISPATCH_WEBHOOK_SECRET");
  if (!webhookUrl || !webhookSecret) return undefined;
  return { webhookUrl, webhookSecret } as const;
}

/**
 * Inbound callback secret for provider-side acknowledgements. Providers post
 * accept/decline decisions to our respond endpoint; without this secret the
 * endpoint refuses every call rather than trusting an anonymous payload.
 */
export function getEmergencyResponderSecret() {
  return optionalEnv("EMERGENCY_RESPONDER_WEBHOOK_SECRET");
}

/** Absolute origin used to build the time-limited location links sent to contacts. */
export function getPublicBaseUrl() {
  return optionalEnv("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";
}

/**
 * Payment provider selection.
 *
 * Two modes, and the mode is never guessed:
 *
 *  - `sandbox` — the built-in provider. It needs no keys, moves no money and
 *    stamps every row it writes `isSandbox`, so the whole ordering flow can be
 *    exercised before a merchant account exists.
 *  - `razorpay` — the live provider. It is selected only when a key id *and* a
 *    key secret are both present, because a half-configured gateway is worse than
 *    none: the order would be created and then never captured.
 *
 * `webhookSecret` is deliberately separate from `keySecret`. Razorpay signs
 * callbacks with a secret configured in its dashboard, and that signature is the
 * only thing that proves a "payment captured" call really came from Razorpay.
 * Without it the webhook endpoint refuses every call rather than trusting an
 * anonymous payload.
 */
export type PaymentProviderConfig =
  | { mode: "sandbox"; currency: string; isLive: false }
  | {
      mode: "razorpay";
      keyId: string;
      keySecret: string;
      webhookSecret?: string;
      currency: string;
      isLive: boolean;
    };

export function getPaymentProviderConfig(): PaymentProviderConfig {
  const keyId = optionalEnv("RAZORPAY_KEY_ID");
  const keySecret = optionalEnv("RAZORPAY_KEY_SECRET");
  const currency = optionalEnv("PAYMENTS_CURRENCY") ?? "INR";

  if (keyId && keySecret) {
    return {
      mode: "razorpay",
      keyId,
      keySecret,
      webhookSecret: optionalEnv("RAZORPAY_WEBHOOK_SECRET"),
      currency,
      // Test keys are prefixed `rzp_test_`; anything else is treated as live so a
      // missing prefix can never make a live charge look like a rehearsal.
      isLive: !keyId.startsWith("rzp_test_"),
    };
  }

  return { mode: "sandbox", currency, isLive: false };
}

/**
 * Outbound insurer integration.
 *
 * ORVEXA never invents an eligibility result or a claim approval. An insurer is
 * either reachable through a configured API, worked through its partner portal,
 * or handled entirely offline — and `Insurer.integrationMode` on the record says
 * which. This getter only answers "can we call an insurer at all?"; when it
 * returns `undefined`, the claim flow must fall back to the transparent manual
 * workflow with a reference number instead of a fabricated decision.
 */
export function getInsurerIntegrationConfig() {
  const baseUrl = optionalEnv("INSURER_INTEGRATION_BASE_URL");
  const apiKey = optionalEnv("INSURER_INTEGRATION_API_KEY");
  if (!baseUrl || !apiKey) return undefined;
  return {
    baseUrl,
    apiKey,
    webhookSecret: optionalEnv("INSURER_INTEGRATION_WEBHOOK_SECRET"),
  } as const;
}

/**
 * Video provider selection for telemedicine.
 *
 * Two modes, and the mode is never guessed:
 *
 *  - `sandbox` — the built-in provider. It creates no external room, moves no
 *    media and stamps every session `isSandbox`. It exists so the booking,
 *    waiting-room and follow-up workflow can be exercised before a video account
 *    exists. It never reports a call connected.
 *  - `daily` — Daily.co. Selected only when `DAILY_API_KEY` is present, because
 *    a half-configured provider is worse than none: the session would be created
 *    and then fail at join, in front of a patient who is already waiting.
 *
 * `webhookSecret` is separate from `apiKey`. Daily signs its callbacks with a
 * secret configured in its dashboard, and that signature is the only thing that
 * proves a "participant joined" call really came from Daily. Without it the
 * webhook route stores the event but refuses to let it move a session.
 */
export type VideoProviderConfig =
  | { mode: "sandbox"; isLive: false }
  | { mode: "daily"; apiKey: string; baseUrl: string; webhookSecret?: string; isLive: true };

export function getVideoProviderConfig(): VideoProviderConfig {
  const apiKey = optionalEnv("DAILY_API_KEY");
  const requested = optionalEnv("VIDEO_PROVIDER")?.toLowerCase();

  // An explicit request for the sandbox provider wins, so a deployment can hold
  // a live Daily key and still rehearse.
  if (apiKey && requested !== "sandbox") {
    return {
      mode: "daily",
      apiKey,
      baseUrl: optionalEnv("DAILY_API_BASE_URL") ?? "https://api.daily.co/v1",
      webhookSecret: optionalEnv("DAILY_WEBHOOK_SECRET"),
      isLive: true,
    };
  }

  return { mode: "sandbox", isLive: false };
}

/**
 * Outbound laboratory-system integration.
 *
 * A booking is only ever *pushed* to a partner's LIS when their API is
 * configured. Without it, the platform stores the booking and the laboratory
 * works it from its own console — it never claims an order was accepted by a
 * system it cannot reach.
 */
export function getLabIntegrationConfig() {
  const baseUrl = optionalEnv("LAB_INTEGRATION_BASE_URL");
  const apiKey = optionalEnv("LAB_INTEGRATION_API_KEY");
  if (!baseUrl || !apiKey) return undefined;
  return {
    baseUrl,
    apiKey,
    webhookSecret: optionalEnv("LAB_INTEGRATION_WEBHOOK_SECRET"),
  } as const;
}

/**
 * Outbound report-exchange integration — handing an authenticated report to
 * another system (a hospital's record system, a referring clinician's inbox).
 *
 * Like the emergency dispatch webhook, the strongest claim this can produce is
 * transport acceptance. Without credentials, the report is exchanged by the
 * patient through a signed link instead, and nothing claims it was delivered.
 */
export function getReportExchangeConfig() {
  const baseUrl = optionalEnv("REPORT_EXCHANGE_BASE_URL");
  const apiKey = optionalEnv("REPORT_EXCHANGE_API_KEY");
  if (!baseUrl || !apiKey) return undefined;
  return {
    baseUrl,
    apiKey,
    webhookSecret: optionalEnv("REPORT_EXCHANGE_WEBHOOK_SECRET"),
  } as const;
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}
