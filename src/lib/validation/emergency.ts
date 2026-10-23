import { z } from "zod";

import type {
  AmbulanceUnitStatus,
  EmergencyIncidentType,
  EmergencyResponderKind,
  EmergencyRequestChannel,
  EmergencyRequestStatus,
  EmergencyIncidentStatus,
} from "@prisma/client";

/**
 * Validation for everything that reaches the emergency domain.
 *
 * The enum value lists are declared here as literal tuples and checked against
 * the Prisma enums with `satisfies`, so the compiler fails if the database and
 * the API drift apart — while the `import type` keeps Prisma out of the client
 * bundle that also loads these schemas for inline validation.
 */

export const EMERGENCY_INCIDENT_TYPES = [
  "ROAD_ACCIDENT",
  "CARDIAC",
  "STROKE",
  "BREATHING_DIFFICULTY",
  "TRAUMA_FALL",
  "BURNS",
  "PREGNANCY",
  "POISONING",
  "SEVERE_ALLERGIC_REACTION",
  "MENTAL_HEALTH_CRISIS",
  "OTHER",
] as const satisfies readonly EmergencyIncidentType[];

export const EMERGENCY_INCIDENT_STATUSES = [
  "SEEKING_RESPONDERS",
  "ACKNOWLEDGED",
  "RESPONDER_ACCEPTED",
  "EN_ROUTE",
  "ON_SCENE",
  "TRANSPORTING",
  "RESOLVED",
  "CANCELLED",
  "EXPIRED",
  "UNANSWERED",
] as const satisfies readonly EmergencyIncidentStatus[];

export const EMERGENCY_RESPONDER_KINDS = [
  "HOSPITAL_EMERGENCY",
  "AMBULANCE_PARTNER",
  "PARTNER_FACILITY",
] as const satisfies readonly EmergencyResponderKind[];

export const EMERGENCY_REQUEST_STATUSES = [
  "PENDING",
  "DELIVERED",
  "ACKNOWLEDGED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "FAILED",
] as const satisfies readonly EmergencyRequestStatus[];

export const EMERGENCY_REQUEST_CHANNELS = [
  "EMAIL",
  "SMS",
  "WEBHOOK",
  "MANUAL_CALL",
] as const satisfies readonly EmergencyRequestChannel[];

export const AMBULANCE_UNIT_STATUSES = [
  "UNKNOWN",
  "AVAILABLE",
  "ON_DUTY",
  "OFFLINE",
  "OUT_OF_SERVICE",
] as const satisfies readonly AmbulanceUnitStatus[];

export const EMERGENCY_INCIDENT_TYPE_LABELS: Record<EmergencyIncidentType, string> = {
  ROAD_ACCIDENT: "Road accident",
  CARDIAC: "Chest pain or suspected heart attack",
  STROKE: "Stroke symptoms",
  BREATHING_DIFFICULTY: "Difficulty breathing",
  TRAUMA_FALL: "Fall, fracture or head injury",
  BURNS: "Burns",
  PREGNANCY: "Pregnancy or childbirth emergency",
  POISONING: "Poisoning or overdose",
  SEVERE_ALLERGIC_REACTION: "Severe allergic reaction",
  MENTAL_HEALTH_CRISIS: "Mental health crisis",
  OTHER: "Something else",
};

/** Checkbox values arrive from FormData as strings; "off" must not read as true. */
const checkboxBoolean = z.preprocess(
  (value) => value === true || value === "true" || value === "on" || value === "1",
  z.boolean(),
);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

/**
 * Accepts the shapes Indian users actually type: +91XXXXXXXXXX, 0XXXXXXXXXX or a
 * bare ten-digit mobile. Anything else is rejected rather than stored, because a
 * callback number that cannot be dialled is worse than none.
 */
export const indianPhoneSchema = z
  .string()
  .trim()
  .min(10)
  .max(20)
  .refine((value) => {
    const digits = value.replace(/[\s-()]/g, "");
    return /^(?:\+91|0091|91|0)?[6-9]\d{9}$/.test(digits);
  }, "Enter a valid Indian mobile number, for example +91 98450 12093.");

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Reported by the browser; `undefined` when the device did not say. */
  accuracyMetres: z.number().min(0).max(1_000_000).optional(),
});

export const incidentLocationSchema = z
  .object({
    /** Present only when the user granted geolocation permission for this incident. */
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracyMetres: z.number().min(0).max(1_000_000).optional(),
    /** Free-text fallback: typed address or landmark when GPS is unavailable. */
    addressText: optionalText(300),
    locality: optionalText(120),
    city: optionalText(120),
    /** Explicit, per-incident confirmation that coordinates may be used. */
    locationConsent: checkboxBoolean.optional().default(false),
  })
  .refine((value) => !(value.latitude !== undefined && value.longitude === undefined), {
    message: "Both latitude and longitude are required when sharing a GPS fix.",
    path: ["longitude"],
  })
  .refine((value) => value.latitude === undefined || value.locationConsent === true, {
    message: "Location may only be recorded when you consent to sharing it for this incident.",
    path: ["locationConsent"],
  });

export type IncidentLocationInput = z.infer<typeof incidentLocationSchema>;

export const createIncidentSchema = z.object({
  incidentType: z.enum(EMERGENCY_INCIDENT_TYPES),
  injuryDescription: optionalText(500),
  /** Raise the incident for a family member already on the patient's account. */
  familyMemberId: optionalText(64),
  location: incidentLocationSchema,
  /**
   * Whether nominated contacts may be sent a time-limited location link. Off by
   * default: the user opts in per incident.
   */
  contactShareConsent: checkboxBoolean.optional().default(false),
  /**
   * Client-generated key so a double tap, a retry after a timeout, or a replayed
   * submission resolves to the same incident instead of raising a second one.
   */
  idempotencyKey: z.string().trim().min(8).max(128),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const cancelIncidentSchema = z.object({
  incidentId: z.string().trim().min(1).max(64),
  reason: optionalText(300),
});

export const retryIncidentSchema = z.object({
  incidentId: z.string().trim().min(1).max(64),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const RESPONDER_DECISIONS = ["ACKNOWLEDGE", "ACCEPT", "DECLINE", "EN_ROUTE", "ON_SCENE", "TRANSPORTING", "RESOLVE"] as const;

/**
 * Provider-side decision. The payload identifies the target request, not the
 * incident, so one provider cannot advance another provider's request or the
 * incident as a whole.
 */
export const responderDecisionSchema = z.object({
  requestId: z.string().trim().min(1).max(64),
  decision: z.enum(RESPONDER_DECISIONS),
  reason: optionalText(300),
  etaMinutes: z.number().int().min(0).max(600).optional(),
  distanceMetres: z.number().int().min(0).max(500_000).optional(),
  /** Free-form unit identifier, e.g. an ambulance call sign. */
  responderReference: optionalText(64),
});

export type ResponderDecisionInput = z.infer<typeof responderDecisionSchema>;

export const NEARBY_KINDS = ["HOSPITAL_EMERGENCY", "PHARMACY", "LABORATORY", "AMBULANCE_PARTNER"] as const;
export type NearbyKind = (typeof NEARBY_KINDS)[number];

export const nearbyQuerySchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    /** Falls back to a typed city or postcode when location access is denied. */
    city: optionalText(120),
    radiusMetres: z.coerce.number().int().min(500).max(50_000).optional().default(10_000),
    kinds: z
      .preprocess(
        (value) => (typeof value === "string" ? value.split(",").filter(Boolean) : value),
        z.array(z.enum(NEARBY_KINDS)).min(1),
      )
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .refine((value) => (value.latitude !== undefined) === (value.longitude !== undefined), {
    message: "Provide both latitude and longitude, or neither.",
    path: ["latitude"],
  })
  .refine((value) => value.latitude !== undefined || (value.city && value.city.length > 1), {
    message: "Share a location or enter a city to search around.",
    path: ["city"],
  });

export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;

/**
 * Place lookup for the map search box.
 *
 * `reverse` asks the provider what is at a point (used to name the user's own
 * position); otherwise `q` is resolved to candidate places. The `reverse` flag is
 * preprocessed rather than coerced, because `z.coerce.boolean()` reads the string
 * "false" as true.
 */
export const geocodeQuerySchema = z
  .object({
    q: optionalText(200),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    limit: z.coerce.number().int().min(1).max(10).optional().default(5),
    reverse: z
      .preprocess((value) => value === true || value === "1" || value === "true" || value === "on", z.boolean())
      .optional()
      .default(false),
  })
  .refine((value) => value.reverse || (value.q !== undefined && value.q.length >= 3), {
    message: "Enter at least three characters to search for.",
    path: ["q"],
  })
  .refine((value) => !value.reverse || (value.latitude !== undefined && value.longitude !== undefined), {
    message: "Looking up a point needs both a latitude and a longitude.",
    path: ["latitude"],
  });

export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;

export const routeQuerySchema = z.object({
  originLatitude: z.coerce.number().min(-90).max(90),
  originLongitude: z.coerce.number().min(-180).max(180),
  destinationLatitude: z.coerce.number().min(-90).max(90),
  destinationLongitude: z.coerce.number().min(-180).max(180),
  mode: z.enum(["driving", "walking", "cycling", "transit"]).optional().default("driving"),
});

export const emergencyContactSchema = z.object({
  id: optionalText(64),
  fullName: z.string().trim().min(2).max(120),
  relationship: optionalText(60),
  phone: indianPhoneSchema,
  email: z.union([z.email(), z.literal("")]).optional(),
  canReceiveLocation: checkboxBoolean.optional().default(false),
  isPrimary: checkboxBoolean.optional().default(false),
});

export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;

export const locationShareRequestSchema = z.object({
  incidentId: z.string().trim().min(1).max(64),
  /** Empty means "every contact who has consented to location links". */
  contactIds: z.array(z.string().trim().min(1).max(64)).max(10).optional().default([]),
  ttlMinutes: z.coerce.number().int().min(5).max(720).optional().default(120),
  idempotencyKey: z.string().trim().min(8).max(128),
});

/** Six-character base32 body of an incident reference, e.g. ORV-EM-7K2M4Q. */
export const incidentReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^ORV-EM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, "That is not a valid incident reference.");

export const locationShareTokenSchema = z.string().trim().min(20).max(200);
