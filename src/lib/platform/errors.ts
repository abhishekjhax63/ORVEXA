import "server-only";

import { randomBytes } from "node:crypto";

/**
 * Result vocabulary for the platform operations console.
 *
 * Same shape as the hospital and care workspaces, for the same reason: a screen
 * should be able to render "that request was already decided" or "that
 * laboratory is not in your queue" without knowing which module produced it.
 *
 * Nothing here throws for an expected condition. A decision on an already-decided
 * request, an export that has expired and an alert somebody else acknowledged
 * first are ordinary outcomes the console has to explain. The things that *do*
 * throw live in `src/lib/platform/console.ts` — a missing session, a caller who
 * holds no console role, or a caller missing the permission the action needs —
 * because in those cases the request was illegitimate before it reached a
 * service.
 */

export type PlatformErrorCode =
  // Lookup and shape
  | "not_found"
  | "validation"
  | "duplicate"
  | "invalid_state"
  | "already_decided"
  // Authorization surfaced from a service (the route guard is the primary one)
  | "not_permitted"
  // Requests
  | "request_not_pending"
  | "request_unknown"
  // Partners
  | "partner_not_found"
  | "partner_already_suspended"
  | "partner_not_suspended"
  | "suspension_needs_verification_first"
  // Support and trust
  | "ticket_not_found"
  | "ticket_closed"
  | "ticket_needs_resolution_first"
  | "complaint_not_found"
  | "abuse_report_not_found"
  | "abuse_report_already_closed"
  // Money
  | "refund_not_found"
  | "refund_not_settleable"
  | "refund_status_not_operator_settable"
  // Configuration
  | "setting_not_found"
  | "setting_value_invalid"
  | "setting_key_immutable"
  | "flag_not_found"
  | "flag_key_immutable"
  | "flag_key_exists"
  // Analytics and exports
  | "range_invalid"
  | "report_unknown"
  | "export_not_found"
  | "export_not_ready"
  | "export_expired"
  | "export_scope_denied"
  // Retention and deletion
  | "retention_policy_not_found"
  | "retention_window_too_short"
  | "purge_scope_denied"
  | "deletion_request_not_found"
  | "deletion_already_resolved"
  // Staff
  | "staff_member_not_found"
  | "staff_already_granted"
  | "staff_role_not_permitted"
  | "staff_cannot_grant_to_self"
  | "staff_account_not_found"
  // Emergency operations
  | "incident_not_found";

export class PlatformServiceError extends Error {
  readonly code: PlatformErrorCode;

  constructor(code: PlatformErrorCode, message: string) {
    super(message);
    this.name = "PlatformServiceError";
    this.code = code;
  }
}

export type PlatformResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: PlatformErrorCode; message: string };

export function platformOk<T>(data: T): PlatformResult<T> {
  return { ok: true, data };
}

export function platformFail<T = never>(code: PlatformErrorCode, message: string): PlatformResult<T> {
  return { ok: false, code, message };
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
 * The reference prefixes the console mints.
 *
 * An abuse report carries one because it is an allegation a person may quote on
 * a call and an operator may have to find a month later; a platform staff grant,
 * a feature flag and a retention policy are all things addressed inside the
 * console by name, and inventing a reference for them would be an identifier
 * nobody ever reads.
 */
export const PLATFORM_REFERENCE_PREFIX = {
  abuseReport: "ORX-ABR",
  export: "ORX-EXP",
} as const;

export type PlatformReferenceKind = keyof typeof PLATFORM_REFERENCE_PREFIX;

/** e.g. `ORX-ABR-4M9K2P`. Six base32 characters, like the other references. */
export function generatePlatformReference(kind: PlatformReferenceKind): string {
  return `${PLATFORM_REFERENCE_PREFIX[kind]}-${randomReferenceBody()}`;
}

export async function reservePlatformReference(
  kind: PlatformReferenceKind,
  exists: (candidate: string) => Promise<{ id: string } | null>,
): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generatePlatformReference(kind);
    if (!(await exists(candidate))) return candidate;
  }
  throw new PlatformServiceError("duplicate", "A reference could not be allocated. Please try again.");
}
