/**
 * Emergency configuration.
 *
 * This module is intentionally free of `server-only` imports so the SOS button,
 * the dial links and the map can render on the client. Only `NEXT_PUBLIC_*`
 * values are read here, and every one of them is a value that is safe to ship to
 * a browser: a dial string, a region code and a public map token.
 *
 * Two rules shape the shape of this config:
 *
 *  1. A phone number is always shown. Hiding a working emergency number because
 *     an env var is missing would be the single most dangerous failure mode on
 *     this page, so the defaults below are the published national numbers for
 *     the region and the UI labels their verification state instead of hiding
 *     them.
 *  2. "Dispatch is configured" is never an env var on its own. The domain layer
 *     re-derives real capability from the integrations that actually exist
 *     (`src/lib/emergency/delivery.ts`) so the UI can never promise a
 *     dispatcher that is not wired up.
 */

export type EmergencyRegion = "IN";

/**
 * `disabled` — no outbound request may be created at all.
 * `manual_call` — the platform records the incident and shows dial + nearby
 *   facility details, but every request still has to be placed by a human.
 * `live` — the platform may attempt automated fan-out; whether it actually can
 *   is still decided per-channel by the delivery layer.
 */
export type EmergencyDispatchMode = "disabled" | "manual_call" | "live";

export type EmergencyNumberSet = {
  /** Unified emergency number, e.g. 112 in India. */
  national: string;
  ambulance: string;
  police: string;
  fire: string;
  /** Additional regional helplines surfaced verbatim from configuration. */
  extra: { id: string; label: string; number: string; detail?: string }[];
};

export type EmergencyRegionConfig = {
  region: EmergencyRegion;
  label: string;
  /** Timezone used when the UI must show a wall-clock time to a dispatcher. */
  timeZone: string;
  numbers: EmergencyNumberSet;
  /**
   * Whether the numbers above have been confirmed for this deployment. Until a
   * release owner sets `NEXT_PUBLIC_EMERGENCY_NUMBER_VERIFIED=true` the UI must
   * say the configured number needs local confirmation.
   */
  numbersVerified: boolean;
  dispatchMode: EmergencyDispatchMode;
};

const REGIONS: Record<EmergencyRegion, Omit<EmergencyRegionConfig, "numbersVerified" | "dispatchMode">> = {
  IN: {
    region: "IN",
    label: "India",
    timeZone: "Asia/Kolkata",
    numbers: {
      national: "112",
      ambulance: "108",
      police: "100",
      fire: "101",
      extra: [
        { id: "womens", label: "Women's helpline", number: "181", detail: "Distress and safety support" },
        { id: "disaster", label: "Disaster helpline", number: "1078", detail: "Natural disaster response" },
      ],
    },
  },
};

function readRegion(): EmergencyRegion {
  const configured = process.env.NEXT_PUBLIC_EMERGENCY_REGION?.trim().toUpperCase();
  if (configured && configured in REGIONS) return configured as EmergencyRegion;
  return "IN";
}

function readDispatchMode(): EmergencyDispatchMode {
  const configured = process.env.NEXT_PUBLIC_EMERGENCY_DISPATCH_MODE?.trim().toLowerCase();
  if (configured === "disabled" || configured === "manual_call" || configured === "live") return configured;
  return "manual_call";
}

function readVerifiedFlag() {
  return process.env.NEXT_PUBLIC_EMERGENCY_NUMBER_VERIFIED?.trim().toLowerCase() === "true";
}

function readNumber(variable: string, fallback: string) {
  const configured = process.env[variable]?.trim();
  return configured && configured !== "" ? configured : fallback;
}

/**
 * Resolved once at module load. `process.env.NEXT_PUBLIC_*` is inlined at build
 * time, so reading it inside render would give the same answer every time while
 * making the value look unstable to Cache Components.
 */
export const emergencyConfig: EmergencyRegionConfig = (() => {
  const base = REGIONS[readRegion()];
  return {
    ...base,
    numbers: {
      ...base.numbers,
      national: readNumber("NEXT_PUBLIC_EMERGENCY_NUMBER", base.numbers.national),
      ambulance: readNumber("NEXT_PUBLIC_EMERGENCY_AMBULANCE_NUMBER", base.numbers.ambulance),
      police: readNumber("NEXT_PUBLIC_EMERGENCY_POLICE_NUMBER", base.numbers.police),
      fire: readNumber("NEXT_PUBLIC_EMERGENCY_FIRE_NUMBER", base.numbers.fire),
    },
    numbersVerified: readVerifiedFlag(),
    dispatchMode: readDispatchMode(),
  };
})();

/** `tel:` href for a dial string, stripping the spacing used for readability. */
export function dialHref(number: string) {
  const cleaned = number.replace(/[^\d+*#]/g, "");
  return `tel:${cleaned}`;
}

export type EmergencyContactChannel = "AMBULANCE" | "NATIONAL" | "POLICE" | "FIRE";

export type EmergencyDialTarget = {
  channel: EmergencyContactChannel;
  label: string;
  number: string;
  detail: string;
};

/**
 * Every dial target the UI may offer, derived from the region config. Ordered by
 * how fast a bystander should reach for them in a medical emergency.
 */
export function emergencyDialTargets(config: EmergencyRegionConfig = emergencyConfig): EmergencyDialTarget[] {
  return [
    {
      channel: "AMBULANCE",
      label: "Ambulance",
      number: config.numbers.ambulance,
      detail: `Government ambulance dispatch in ${config.label}`,
    },
    {
      channel: "NATIONAL",
      label: "All emergencies",
      number: config.numbers.national,
      detail: "Unified emergency response number",
    },
    {
      channel: "POLICE",
      label: "Police",
      number: config.numbers.police,
      detail: "Accident, traffic and law enforcement",
    },
    {
      channel: "FIRE",
      label: "Fire and rescue",
      number: config.numbers.fire,
      detail: "Fire, collapse and extrication",
    },
  ];
}

/** True when the platform has been configured to attempt any outbound request. */
export function isDispatchAttempted(config: EmergencyRegionConfig = emergencyConfig) {
  return config.dispatchMode !== "disabled";
}
