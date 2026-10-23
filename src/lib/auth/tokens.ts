import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { getAuthSecret } from "@/lib/env";

/**
 * Token helpers. Every credential the platform hands out (session tokens, OTP
 * codes, verification links) is stored as an HMAC-SHA256 digest keyed with
 * AUTH_SECRET, so a leaked database snapshot cannot be used to forge a session
 * or brute-force a six-digit code offline.
 */
export function hmacDigest(value: string, purpose: string): string {
  return createHmac("sha256", getAuthSecret()).update(`${purpose}:${value}`).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Six-digit numeric code, uniformly distributed and zero padded. */
export function createNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}

/** Long opaque token used inside verification and reset links. */
export function createLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Booking reference shown to patients, e.g. ORV-7QK4M2. */
export function createAppointmentReference(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `ORV-${code}`;
}

/**
 * Emergency incident reference, e.g. ORV-EM-7K2M4Q.
 *
 * Deliberately a different prefix from a booking reference: a dispatcher reading
 * one out loud, or a user searching support, must never confuse an active
 * emergency with an appointment.
 */
export function createEmergencyReference(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `ORV-EM-${code}`;
}

/** Length-safe constant-time comparison for two hex digests. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Mask an email or phone number for audit records and provider views. */
export function maskIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex > 0) {
    const local = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex);
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}${domain}`;
  }
  if (trimmed.length <= 4) return "*".repeat(trimmed.length);
  return `${"*".repeat(trimmed.length - 4)}${trimmed.slice(-4)}`;
}
