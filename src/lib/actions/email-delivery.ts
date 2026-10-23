import "server-only";

import { getEmailProviderConfig } from "@/lib/env";

/**
 * Transactional email capability — the single honest answer to "can we send?".
 *
 * No email transport adapter exists in this codebase: nothing can hand a message
 * to a provider, so even with `EMAIL_PROVIDER_*` set no verification link or
 * reset link can actually be delivered. `src/lib/emergency/delivery.ts` already
 * reports the same way for dispatch, and every auth screen reuses this so none
 * of them claims a message was sent when it was not.
 *
 * When an adapter is added, implement `sendEmail` (or similar) and flip the flag;
 * nothing else has to change.
 */
const EMAIL_TRANSPORT_IMPLEMENTED = false;

export function emailDeliveryAvailable(): boolean {
  return EMAIL_TRANSPORT_IMPLEMENTED && Boolean(getEmailProviderConfig());
}

/** Shared copy so every surface explains the same limitation in the same words. */
export const EMAIL_NOT_CONFIGURED_MESSAGE =
  "This deployment has no email delivery configured, so no email can be sent from it.";
