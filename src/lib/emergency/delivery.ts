import "server-only";

import { createHmac } from "node:crypto";

import { getEmailProviderConfig, getEmergencyDispatchConfig, getSmsProviderConfig } from "@/lib/env";

/**
 * Outbound delivery.
 *
 * The single rule this module enforces: a delivery is only reported as sent when
 * a transport actually accepted it. There is no optimistic success path, and a
 * missing integration is reported as `not_configured` rather than silently
 * swallowed — that value is what lets the UI say "this request was not sent"
 * instead of implying a dispatcher received it.
 *
 * The only fully implemented transport is an HTTPS webhook, because that is the
 * one this deployment can be configured for without choosing a vendor. Email and
 * SMS report `unsupported` until a provider adapter is written; see
 * `.env.example` and `docs/phase-4-production-checklist` notes in the README.
 */

export type DeliveryChannel = "WEBHOOK" | "EMAIL" | "SMS" | "MANUAL_CALL";

export type DeliveryOutcome =
  | { status: "DELIVERED"; transportReference: string | null; attemptedAt: Date }
  | { status: "FAILED"; reason: string; attemptedAt: Date }
  | { status: "NOT_CONFIGURED"; reason: string; attemptedAt: Date };

export type DispatchCapability = {
  /** The deployment has been told to attempt outbound requests at all. */
  dispatchModeAllowsSending: boolean;
  /** A webhook transport exists and is signed with a secret. */
  webhookConfigured: boolean;
  emailConfigured: boolean;
  smsConfigured: boolean;
  /**
   * True only when at least one transport can carry a request end to end. The UI
   * uses this to decide whether to promise an automated request at all.
   */
  automatedDispatchAvailable: boolean;
};

export function getDispatchCapability(
  dispatchMode: "disabled" | "manual_call" | "live",
): DispatchCapability {
  const webhookConfigured = Boolean(getEmergencyDispatchConfig());
  const emailConfigured = Boolean(getEmailProviderConfig());
  const smsConfigured = Boolean(getSmsProviderConfig());
  const dispatchModeAllowsSending = dispatchMode !== "disabled";
  return {
    dispatchModeAllowsSending,
    webhookConfigured,
    emailConfigured,
    smsConfigured,
    automatedDispatchAvailable: dispatchModeAllowsSending && webhookConfigured,
  };
}

const DELIVERY_TIMEOUT_MS = 10_000;

export type DispatchPayload = {
  event: "emergency.dispatch.request";
  incidentReference: string;
  requestId: string;
  responderKind: string;
  responderLabel: string;
  incidentType: string;
  injuryDescription: string | null;
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracyMetres: number | null;
    addressText: string | null;
    locality: string | null;
    city: string | null;
    /** A localised string for a human dispatcher, not a raw ISO timestamp. */
    reportedAt: string;
  } | null;
  attempt: number;
  /**
   * Absolute URLs the responder may POST a decision to. POST only: a GET is
   * refused so an email link scanner or preview cannot accept an incident on a
   * crew's behalf. The body may be empty — the decision travels in the query.
   */
  callback: { acknowledgeUrl: string; declineUrl: string };
  sentAt: string;
};

/**
 * POSTs one dispatch payload to the configured dispatch webhook.
 *
 * The body is signed so the receiver can verify it and reject a replayed or
 * forged request. A timeout, a non-2xx status and a missing integration all
 * produce distinct outcomes; none of them is reported as delivered.
 */
export async function deliverDispatchRequest(payload: DispatchPayload): Promise<DeliveryOutcome> {
  const config = getEmergencyDispatchConfig();
  const attemptedAt = new Date();
  if (!config) {
    return {
      status: "NOT_CONFIGURED",
      reason: "No dispatch webhook is configured on this deployment.",
      attemptedAt,
    };
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(attemptedAt.getTime() / 1000).toString();
  const signature = createHmac("sha256", config.webhookSecret).update(`${timestamp}.${body}`).digest("hex");

  let response: Response;
  try {
    response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-orvexa-signature": `sha256=${signature}`,
        "x-orvexa-timestamp": timestamp,
        "x-orvexa-event": payload.event,
        "idempotency-key": payload.requestId,
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const reason = name === "TimeoutError" || name === "AbortError" ? "The dispatch endpoint timed out." : "The dispatch endpoint could not be reached.";
    console.error("[emergency] dispatch webhook failed", error);
    return { status: "FAILED", reason, attemptedAt };
  }

  if (!response.ok) {
    return { status: "FAILED", reason: `The dispatch endpoint returned HTTP ${response.status}.`, attemptedAt };
  }

  // The transport accepting the request is the strongest claim we are entitled
  // to make. It is a delivery receipt, never an acknowledgement from a human.
  const transportReference = response.headers.get("x-request-id") ?? null;
  return { status: "DELIVERED", transportReference, attemptedAt };
}

export type ContactNotification = {
  contactLabel: string;
  /** The time-limited link. Sharing this is the point of the notification. */
  locationLink: string;
  incidentReference: string;
};

/**
 * Contact notification. Until a provider adapter exists there is no transport
 * here, so this returns `unsupported` and the caller must surface the link for
 * the user to send themselves. It never reports a message as sent.
 */
export async function notifyEmergencyContact(notification: ContactNotification): Promise<DeliveryOutcome> {
  const attemptedAt = new Date();
  if (!getEmailProviderConfig() && !getSmsProviderConfig()) {
    return {
      status: "NOT_CONFIGURED",
      reason: "Neither an email nor an SMS provider is configured, so no message was sent.",
      attemptedAt,
    };
  }
  return {
    status: "NOT_CONFIGURED",
    reason: `No transport adapter is implemented for the configured provider. Share this link directly: ${notification.locationLink}`,
    attemptedAt,
  };
}

/** Redacts the token-in-URL form before it is written to an audit record. */
export function redactShareLink(link: string) {
  return link.replace(/(\/emergency\/share\/)[A-Za-z0-9_-]+/, "$1<token>");
}
