import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getLabIntegrationConfig } from "@/lib/env";

/**
 * The replaceable laboratory-system (LIS) integration interface.
 *
 * Modelled on `src/lib/insurance/integration.ts`: the modules above this file
 * talk only to the functions below and to `LabIntegrationResult`, so nothing
 * above it knows an endpoint, a vendor or a payload shape.
 *
 * ## The one rule that governs this file
 *
 * **There is no code path here that returns a result, a value or a verified
 * report without a real response from a configured endpoint.** `not_supported`,
 * `not_configured` and `failed` are first-class outcomes. A partner whose LIS is
 * not reachable has its bookings worked from the ORVEXA console and its reports
 * uploaded by a human — the platform never synthesises a laboratory result.
 *
 * ## What a partner must provide to be integrated
 *
 * A direct integration is only enabled when the deployment has
 * `LAB_INTEGRATION_BASE_URL` and `LAB_INTEGRATION_API_KEY` set, exposed through
 * `getLabIntegrationConfig()`. The shared secret stays on the server. The
 * partner must publish, over a channel outside this codebase, the exact request
 * and response contract for the two operations below. Nothing here fabricates
 * that contract.
 */

export type LabIntegrationOutcome = "submitted" | "not_configured" | "not_supported" | "failed";

export type LabIntegrationResult<T> =
  | { outcome: "submitted"; data: T }
  | { outcome: "not_configured" | "not_supported" | "failed"; message: string };

export function labIntegrationFailure<T>(
  outcome: "not_configured" | "not_supported" | "failed",
  message: string,
): LabIntegrationResult<T> {
  return { outcome, message };
}

/** Whether the deployment can send anything to a partner LIS at all. */
export function getLabIntegrationDescriptor(): {
  available: boolean;
  automated: boolean;
  reason: string;
  baseUrl?: string;
} {
  const config = getLabIntegrationConfig();
  if (!config) {
    return {
      available: false,
      automated: false,
      reason:
        "No laboratory-system credential is configured on this deployment, so nothing can be sent automatically. Bookings are worked from the ORVEXA laboratory console instead.",
    };
  }
  return {
    available: true,
    automated: true,
    reason: "Bookings are sent to the laboratory's own system automatically and its answers are recorded.",
    baseUrl: config.baseUrl.replace(/\/+$/, ""),
  };
}

const CALL_TIMEOUT_MS = 20_000;

async function callLabApi(input: {
  path: string;
  method: "POST" | "GET";
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<LabIntegrationResult<{ status: number; body: Record<string, unknown> }>> {
  const config = getLabIntegrationConfig();
  if (!config) {
    return labIntegrationFailure(
      "not_configured",
      "No laboratory-system credential is configured on this deployment, so nothing was sent.",
    );
  }

  const base = config.baseUrl.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${base}${input.path.startsWith("/") ? "" : "/"}${input.path}`, {
      method: input.method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
        accept: "application/json",
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal ?? AbortSignal.timeout(CALL_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    console.error("[diagnostics] laboratory system could not be reached", name || "unknown error");
    return labIntegrationFailure(
      "failed",
      "The laboratory's system could not be reached, so no answer was obtained. Nothing has been recorded as accepted.",
    );
  }

  if (!response.ok) {
    console.error(`[diagnostics] laboratory system returned ${response.status}`);
    return labIntegrationFailure(
      "failed",
      `The laboratory's system returned an error (${response.status}), so no answer was obtained.`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return labIntegrationFailure(
      "failed",
      "The laboratory's system returned an unreadable answer, so none of it was recorded.",
    );
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return labIntegrationFailure(
      "failed",
      "The laboratory's system returned an unexpected answer, so none of it was recorded.",
    );
  }

  return { outcome: "submitted", data: { status: response.status, body: body as Record<string, unknown> } };
}

function readString(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function parseDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Pushing a booking to the laboratory
// ---------------------------------------------------------------------------

export type LabBookingSubmissionInput = {
  /** The ORVEXA reference, sent so the laboratory can quote it back. */
  reference: string;
  mode: "WALK_IN" | "HOME_COLLECTION";
  scheduledAt: Date;
  patientName: string;
  patientPhone: string | null;
  /** Catalogue test slugs or names, so the partner can map them to its own codes. */
  tests: string[];
  collectionAddress: string | null;
  notes: string | null;
  signal?: AbortSignal;
};

export type LabBookingSubmission = {
  /** The partner's own acknowledgement reference, when it gave one. */
  partnerReferenceNumber: string | null;
  accepted: boolean;
  responseSummary: Record<string, unknown>;
  respondedAt: Date;
};

/**
 * Sends a booking to the laboratory's system.
 *
 * `accepted` is true only when the partner's response said so. Any other answer
 * leaves the booking awaiting the laboratory's own console action.
 */
export async function submitBookingToLab(
  input: LabBookingSubmissionInput,
): Promise<LabIntegrationResult<LabBookingSubmission>> {
  const result = await callLabApi({
    path: "/orders",
    method: "POST",
    body: {
      reference: input.reference,
      mode: input.mode,
      scheduledAt: input.scheduledAt.toISOString(),
      patientName: input.patientName,
      patientPhone: input.patientPhone,
      tests: input.tests,
      homeCollection: input.mode === "HOME_COLLECTION" ? { address: input.collectionAddress } : null,
      notes: input.notes,
    },
    signal: input.signal,
  });

  if (result.outcome !== "submitted") return result;

  const body = result.data.body;
  const status = readString(body, "status", "result")?.toLowerCase() ?? null;
  return {
    outcome: "submitted",
    data: {
      partnerReferenceNumber: readString(body, "referenceNumber", "reference", "orderId", "id"),
      accepted: status === "accepted" || status === "confirmed" || body.accepted === true,
      responseSummary: body,
      respondedAt: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// Reading a report's arrival from the laboratory
// ---------------------------------------------------------------------------

export type LabReportFetchInput = {
  reference: string;
  partnerReferenceNumber: string | null;
  signal?: AbortSignal;
};

export type LabReportAvailability = {
  /** True only when the laboratory said an authenticated report exists. */
  available: boolean;
  partnerReferenceNumber: string | null;
  reportedAt: Date | null;
  responseSummary: Record<string, unknown>;
};

/**
 * Asks the laboratory whether a report is ready.
 *
 * The strongest claim this produces is "the laboratory said a report is ready".
 * The report's *contents* are never read here: a result is entered and
 * authenticated by the laboratory through a route that records who did it.
 */
export async function fetchLabReportAvailability(
  input: LabReportFetchInput,
): Promise<LabIntegrationResult<LabReportAvailability>> {
  const result = await callLabApi({
    path: "/reports/availability",
    method: "POST",
    body: { reference: input.reference, partnerReferenceNumber: input.partnerReferenceNumber },
    signal: input.signal,
  });

  if (result.outcome !== "submitted") return result;

  const body = result.data.body;
  const status = readString(body, "status", "state")?.toLowerCase() ?? null;
  const reportedAtRaw = readString(body, "reportedAt", "publishedAt", "readyAt");
  return {
    outcome: "submitted",
    data: {
      available: status === "ready" || status === "published" || body.available === true,
      partnerReferenceNumber: readString(body, "referenceNumber", "reportId", "id"),
      reportedAt: reportedAtRaw ? parseDate(reportedAtRaw) : null,
      responseSummary: body,
    },
  };
}

// ---------------------------------------------------------------------------
// Inbound callbacks
// ---------------------------------------------------------------------------

/**
 * Verifies an inbound laboratory callback over the *exact* raw body string.
 *
 * The caller must read the body with `await request.text()` and pass that string
 * here, so the bytes verified are the bytes parsed. Without a configured
 * `LAB_INTEGRATION_WEBHOOK_SECRET` every callback is refused rather than
 * trusted, because an unsigned payload is indistinguishable from a forgery.
 */
export function verifyLabCallbackSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
}): { ok: true } | { ok: false; message: string } {
  const config = getLabIntegrationConfig();
  if (!config?.webhookSecret) {
    return {
      ok: false,
      message: "No laboratory callback secret is configured on this deployment, so this callback was refused.",
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

export function isLabCallbackVerificationConfigured(): boolean {
  return getLabIntegrationConfig()?.webhookSecret !== undefined;
}
