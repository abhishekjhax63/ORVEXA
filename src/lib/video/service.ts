import "server-only";

import { getVideoProviderConfig, isProduction } from "@/lib/env";

import { createDailyVideoProvider } from "./daily";
import { createSandboxVideoProvider } from "./sandbox";
import type { VideoProvider } from "./provider";

/**
 * Video provider selection.
 *
 * Which provider is in use is decided entirely by configuration and is never
 * guessed. The consequence worth stating plainly: a production deployment with
 * no video provider configured reports video as *unavailable*. It does not fall
 * back to the sandbox, because a fallback that hands a patient a "room" that
 * cannot carry a call is worse than telling them the truth.
 */

let cached: { key: string; provider: VideoProvider } | null = null;

export function getVideoProvider(): VideoProvider {
  const config = getVideoProviderConfig();

  if (config.mode === "daily") {
    const key = `daily:${config.baseUrl}:${config.apiKey.slice(0, 6)}`;
    if (!cached || cached.key !== key) cached = { key, provider: createDailyVideoProvider(config) };
    return cached.provider;
  }

  const key = `sandbox:${isProduction() ? "production" : "development"}`;
  if (!cached || cached.key !== key) cached = { key, provider: createSandboxVideoProvider() };
  return cached.provider;
}

export type VideoAvailability = {
  /** True only when a real consultation room can be opened right now. */
  available: boolean;
  provider: "DAILY" | "SANDBOX";
  label: string;
  /** True only when the provider can carry a real consultation. */
  isLive: boolean;
  /** True when a session opened now is a rehearsal and must be labelled as one. */
  isSandbox: boolean;
  /** True when a callback from this provider can be authenticated. */
  webhooksVerifiable: boolean;
  /** Shown verbatim on the waiting-room and console pages. Never overstates. */
  notice: string;
};

const SANDBOX_NOTICE =
  "Sandbox consultation room. No video provider is configured, so no call can be placed — this session exercises the booking, waiting-room and follow-up workflow only, and no consultation happens.";

export function videoAvailability(): VideoAvailability {
  const config = getVideoProviderConfig();

  if (config.mode === "daily") {
    return {
      available: true,
      provider: "DAILY",
      label: "Daily.co",
      isLive: true,
      isSandbox: false,
      webhooksVerifiable: Boolean(config.webhookSecret),
      notice:
        "Consultations are held on Daily.co. Join links are short-lived and are issued separately to the patient and the clinician.",
    };
  }

  if (isProduction()) {
    return {
      available: false,
      provider: "SANDBOX",
      label: "Not configured",
      isLive: false,
      isSandbox: true,
      webhooksVerifiable: false,
      notice:
        "No video provider is configured on this deployment, so an online consultation cannot be held here. The appointment can still be booked and handled by other means.",
    };
  }

  return {
    available: false,
    provider: "SANDBOX",
    label: "Sandbox (rehearsal only)",
    isLive: false,
    isSandbox: true,
    webhooksVerifiable: false,
    notice: SANDBOX_NOTICE,
  };
}
