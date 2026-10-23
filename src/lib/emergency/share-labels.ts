import type { LocationShareStatus } from "@prisma/client";

/**
 * Labels for the lifecycle of a location link handed to an emergency contact.
 *
 * Client-safe: `import type` keeps Prisma out of the browser bundle while the
 * compiler still checks this map against the database enum. The wording matters
 * more than the styling here — `REVOKED` has to read as "no longer working", not
 * as a mild variation on "expired", because the two have different causes.
 */
export const LOCATION_SHARE_LABELS: Record<LocationShareStatus, string> = {
  ACTIVE: "Link active",
  EXPIRED: "Link expired",
  REVOKED: "Link revoked",
};

/** One line explaining why a link is in its current state. */
export const LOCATION_SHARE_DETAILS: Record<LocationShareStatus, string> = {
  ACTIVE: "The contact can open this link until it expires. It stops working the moment the incident closes.",
  EXPIRED: "The time window ran out. Issue a new link if the contact still needs it.",
  REVOKED: "Withdrawn deliberately — either the incident was cancelled, or sharing was turned off.",
};
