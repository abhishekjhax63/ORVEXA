import "server-only";

import { randomBytes } from "node:crypto";

/**
 * Shared result vocabulary for the patient care and wellness workspace.
 *
 * Same shape as the hospital workspace, for the same reason: a caller should be
 * able to render "that reminder already exists" or "a clinician's schedule is
 * not yours to edit" without knowing which module produced it.
 *
 * Nothing here throws for an expected condition. A duplicate reminder, a
 * caregiver without a scope and an import that found nothing new are ordinary
 * outcomes the screen has to explain. The two things that do throw live
 * elsewhere and are deliberate: a caregiver acting outside their granted scopes
 * (`assertCaregiverScope`) and a missing consent (`ConsentRequiredFailure`),
 * because in both cases the request was illegitimate before it reached the
 * service.
 */

export type CareErrorCode =
  // Identity and lookup
  | "not_found"
  | "duplicate"
  | "validation"
  // Consent and family access
  | "consent_required"
  | "caregiver_access_not_found"
  | "caregiver_access_not_active"
  | "caregiver_scope_missing"
  | "caregiver_access_revoked"
  | "cannot_target_self"
  | "family_member_not_found"
  // Provenance and safety
  | "clinician_source_locked"
  | "provenance_mismatch"
  | "not_clinician_verifiable"
  | "clinical_advice_out_of_scope"
  // Reminders
  | "reminder_not_found"
  | "reminder_not_active"
  | "invalid_schedule"
  | "invalid_timezone"
  | "quiet_hours_suppressed"
  | "duplicate_occurrence"
  // Devices
  | "device_not_configured"
  | "device_connection_not_found"
  | "device_import_empty"
  // Services and support
  | "listing_not_found"
  | "listing_not_available"
  | "request_not_found"
  | "support_ticket_not_found"
  | "support_ticket_closed";

export class CareFailure extends Error {
  readonly code: CareErrorCode;

  constructor(code: CareErrorCode, message: string) {
    super(message);
    this.name = "CareFailure";
    this.code = code;
  }
}

export type CareResult<T> = { ok: true; data: T } | { ok: false; code: CareErrorCode; message: string };

export function careOk<T>(data: T): CareResult<T> {
  return { ok: true, data };
}

export function careFail<T = never>(code: CareErrorCode, message: string): CareResult<T> {
  return { ok: false, code, message };
}

/**
 * Thrown when a caregiver reaches for something outside the scopes they were
 * granted.
 *
 * This is not an ordinary outcome, so it is not a `CareResult`. Every caller
 * that catches it writes a `care.caregiver_scope_denied` audit row first, which
 * is why the throwing style is kept: a denied read is exactly the event the
 * person whose record it is should be able to find later.
 */
export class CaregiverScopeError extends Error {
  readonly scope: string;
  readonly accessId: string;

  constructor(scope: string, accessId: string, message: string) {
    super(message);
    this.name = "CaregiverScopeError";
    this.scope = scope;
    this.accessId = accessId;
  }
}

/** Thrown when an operation requires a consent that is absent or withdrawn. */
export class ConsentRequiredFailure extends Error {
  readonly consentType: string;

  constructor(consentType: string, message: string) {
    super(message);
    this.name = "ConsentRequiredFailure";
    this.consentType = consentType;
  }
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomReferenceBody(length = 6): string {
  const bytes = randomBytes(length);
  let body = "";
  for (const byte of bytes) body += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return body;
}

/**
 * The reference prefix for the record a person quotes on a phone call.
 *
 * Only one record type carries a reference. A support ticket is read out loud to
 * somebody in a support queue, so it needs one; a reminder, an allergy, a
 * wellness entry and a care service request are all things the person can point
 * at inside the app, and inventing a reference for them would be an identifier
 * nobody ever reads.
 */
export const CARE_REFERENCE_PREFIX = {
  supportTicket: "ORX-SUP",
} as const;

export type CareReferenceKind = keyof typeof CARE_REFERENCE_PREFIX;

/** e.g. `ORX-SUP-4M9K2P`. Six base32 characters, like the other references. */
export function generateCareReference(kind: CareReferenceKind): string {
  return `${CARE_REFERENCE_PREFIX[kind]}-${randomReferenceBody()}`;
}

/**
 * Allocates a reference that is unique across the platform.
 *
 * Unlike a hospital MRN, a patient-facing support reference is global: the
 * person quotes it out loud, so two of them colliding across organisations would
 * be a real problem rather than a cosmetic one.
 */
export async function reserveCareReference(
  kind: CareReferenceKind,
  exists: (candidate: string) => Promise<{ id: string } | null>,
): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateCareReference(kind);
    if (!(await exists(candidate))) return candidate;
  }
  throw new CareFailure("duplicate", "A reference could not be allocated. Please try again.");
}
