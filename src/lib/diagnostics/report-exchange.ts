import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getReportExchangeConfig } from "@/lib/env";

/**
 * The replaceable report-exchange interface.
 *
 * Handing an authenticated report to another system — a hospital's record
 * system, a referring clinician's inbox, a national exchange — is a distinct
 * capability from storing it. Modelled on `src/lib/insurance/integration.ts`.
 *
 * ## What this may and may not claim
 *
 * The strongest honest claim on this interface is **transport acceptance**: the
 * other system accepted the envelope. It is never a claim that a human received
 * it, read it or acted on it. Without credentials the report is exchanged by the
 * patient through a signed link instead, and nothing claims it was delivered.
 *
 * ## Consent
 *
 * An exchange is a release of a patient's record to a third party. The caller
 * must hold a live patient consent and a named recipient; this module does not
 * decide that, and it will not exchange a report without a recipient reference.
 */

export type ReportExchangeOutcome = "accepted" | "not_configured" | "not_supported" | "failed";

export type ReportExchangeResult<T> =
  | { outcome: "accepted"; data: T }
  | { outcome: "not_configured" | "not_supported" | "failed"; message: string };

export function reportExchangeFailure<T>(
  outcome: "not_configured" | "not_supported" | "failed",
  message: string,
): ReportExchangeResult<T> {
  return { outcome, message };
}

export function getReportExchangeDescriptor(): {
  available: boolean;
  automated: boolean;
  reason: string;
} {
  const config = getReportExchangeConfig();
  if (!config) {
    return {
      available: false,
      automated: false,
      reason:
        "No report-exchange credential is configured on this deployment. A report is shared with a recipient through a signed link instead, and nothing claims it was delivered to another system.",
    };
  }
  return {
    available: true,
    automated: true,
    reason: "An authenticated report is sent to the recipient's system automatically and its acknowledgement is recorded.",
  };
}

const CALL_TIMEOUT_MS = 20_000;

export type ReportExchangeRequest = {
  /** ORVEXA's report reference. */
  reportReference: string;
  /** Who the patient consented to share it with. Never optional. */
  recipient: { name: string; reference: string; kind: "CLINICIAN" | "FACILITY" | "SYSTEM" };
  /** Where the authenticated document can be fetched. A short-lived signed URL. */
  documentUrl: string;
  documentContentType: string;
  /** ISO instant after which the document URL stops working. */
  documentUrlExpiresAt: Date;
  /** The report's authentication details, so the recipient can see who signed it. */
  authenticatedByName: string;
  authenticatedByRegistration: string;
  authenticatedAt: Date;
  summary: { analyteCount: number; hasAbnormalFlags: boolean };
  signal?: AbortSignal;
};

export type ReportExchangeAcknowledgement = {
  /** The recipient system's own reference for what it received. */
  recipientReference: string | null;
  /** Transport acceptance only. Never a claim that a person received it. */
  acceptedAt: Date;
  responseSummary: Record<string, unknown>;
};

/**
 * Sends one authenticated report to a recipient's system.
 *
 * A recipient reference is required: an exchange to nobody is not an exchange.
 * A non-2xx status, a timeout or a missing integration each produce their own
 * outcome, and none of them is reported as accepted.
 */
export async function exchangeReport(
  request: ReportExchangeRequest,
): Promise<ReportExchangeResult<ReportExchangeAcknowledgement>> {
  const config = getReportExchangeConfig();
  if (!config) {
    return reportExchangeFailure(
      "not_configured",
      "No report-exchange integration is configured on this deployment, so the report was not sent to any system. It can still be shared with the recipient through a signed link.",
    );
  }

  if (!request.recipient?.reference) {
    return reportExchangeFailure("failed", "An exchange needs a named recipient system, so nothing was sent.");
  }

  const base = config.baseUrl.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${base}/reports/exchange`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
        accept: "application/json",
      },
      body: JSON.stringify({
        reportReference: request.reportReference,
        recipient: request.recipient,
        document: {
          url: request.documentUrl,
          contentType: request.documentContentType,
          expiresAt: request.documentUrlExpiresAt.toISOString(),
        },
        authentication: {
          authenticatedByName: request.authenticatedByName,
          authenticatedByRegistration: request.authenticatedByRegistration,
          authenticatedAt: request.authenticatedAt.toISOString(),
        },
        summary: request.summary,
      }),
      signal: request.signal ?? AbortSignal.timeout(CALL_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    console.error("[diagnostics] report exchange could not be reached", name || "unknown error");
    return reportExchangeFailure(
      "failed",
      "The recipient's system could not be reached, so the report was not sent. Nothing has been recorded as delivered.",
    );
  }

  if (!response.ok) {
    console.error(`[diagnostics] report exchange returned ${response.status}`);
    return reportExchangeFailure(
      "failed",
      `The recipient's system returned an error (${response.status}), so the report was not sent.`,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // An empty acknowledgement body is acceptable: the status already said accepted.
    body = {};
  }

  const recipientReference =
    typeof body.referenceNumber === "string"
      ? body.referenceNumber
      : typeof body.reference === "string"
        ? body.reference
        : typeof body.id === "string"
          ? body.id
          : null;

  return {
    outcome: "accepted",
    data: {
      recipientReference,
      acceptedAt: new Date(),
      // Transport acceptance only. The wording here is load-bearing.
      responseSummary: { ...body, note: "Accepted for delivery by the recipient system. This is not proof of receipt." },
    },
  };
}

/**
 * Verifies an inbound acknowledgement callback over the exact raw body.
 *
 * Without a configured `REPORT_EXCHANGE_WEBHOOK_SECRET` every callback is
 * refused rather than trusted.
 */
export function verifyReportExchangeCallbackSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
}): { ok: true } | { ok: false; message: string } {
  const config = getReportExchangeConfig();
  if (!config?.webhookSecret) {
    return {
      ok: false,
      message: "No report-exchange callback secret is configured on this deployment, so this callback was refused.",
    };
  }
  if (!input.signatureHeader) {
    return { ok: false, message: "This callback did not carry a signature." };
  }

  const expected = createHmac("sha256", config.webhookSecret).update(input.rawBody, "utf8").digest("hex");
  const provided = input.signatureHeader.replace(/^sha256=/i, "").trim();

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");
  if (expectedBuffer.length === 0 || expectedBuffer.length !== providedBuffer.length) {
    return { ok: false, message: "This callback's signature could not be verified." };
  }
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
    return { ok: false, message: "This callback's signature could not be verified." };
  }
  return { ok: true };
}
