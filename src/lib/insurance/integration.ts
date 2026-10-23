import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  ClaimDecision,
  ClaimStatus,
  EligibilityCheckStatus,
  InsurerIntegrationMode,
  PreAuthStatus,
} from "@prisma/client";

import { getInsurerIntegrationConfig } from "@/lib/env";
import { INTEGRATION_MODE_COPY } from "@/lib/insurance/labels";

/**
 * The replaceable insurer integration interface.
 *
 * Modelled on `src/lib/ai/provider.ts`: the modules above this file talk only to
 * the functions below and to `InsuranceIntegrationResult`, so nothing above it
 * knows an endpoint, a vendor, a credential or a payload shape.
 *
 * ## The one rule that governs this file
 *
 * **There is no code path here that returns a successful eligibility answer or a
 * claim/pre-authorisation approval without a real response from a configured
 * endpoint.** `not_supported`, `not_configured` and `failed` are first-class
 * outcomes and are rendered as such; an insurer's decision is only ever recorded
 * from a payload their system actually sent back, or — in the manual modes — from
 * a reference a human typed after speaking to them. There is deliberately no
 * fallback that synthesises a plausible "approved" or an eligibility "yes".
 *
 * ## What a partner must provide to be integrated
 *
 * A direct (`API`) integration is only enabled when *all* of the following hold,
 * checked in `getInsurerIntegration`:
 *
 *  1. `Insurer.integrationMode` is `API`. The mode is set by a platform
 *     administrator, never inferred from the presence of a key.
 *  2. `Insurer.isActive` is true.
 *  3. `Insurer.integrationConfigured` is true — a platform administrator has
 *     confirmed the credential below is in place for this insurer.
 *  4. The deployment has `INSURER_INTEGRATION_API_KEY` set, exposed through
 *     `getInsurerIntegrationConfig()`. This shared secret stays on the server and
 *     is never sent to the browser.
 *  5. A base URL is available — the insurer's own `integrationBaseUrl`, or the
 *     deployment-level `INSURER_INTEGRATION_BASE_URL`.
 *  6. Optionally, `INSURER_INTEGRATION_WEBHOOK_SECRET` so inbound callbacks can
 *     be signature-verified.
 *
 * The partner must also publish, over a channel outside this codebase, the exact
 * request and response contract for the three operations below: eligibility,
 * pre-authorisation and claim status. Nothing here fabricates that contract.
 */

export type InsuranceIntegrationOutcome = "submitted" | "not_configured" | "not_supported" | "failed";

export type InsuranceIntegrationResult<T> =
  | { outcome: "submitted"; data: T }
  | { outcome: "not_configured" | "not_supported" | "failed"; message: string };

export function integrationFailure<T>(
  outcome: "not_configured" | "not_supported" | "failed",
  message: string,
): InsuranceIntegrationResult<T> {
  return { outcome, message };
}

/** The minimal shape of an insurer row this module needs. */
export type InsurerRecord = {
  id: string;
  name: string;
  integrationMode: InsurerIntegrationMode;
  integrationBaseUrl: string | null;
  integrationConfigured: boolean;
  isActive: boolean;
};

export type InsurerIntegrationDescriptor = {
  /** True only when a real request can be sent right now. */
  available: boolean;
  mode: InsurerIntegrationMode;
  /** Whether the route is automated at all. `false` for the manual modes. */
  automated: boolean;
  /** Safe to render. Explains why a call will or will not be attempted. */
  reason: string;
  /** Resolved endpoint base, present only when `available`. */
  baseUrl?: string;
};

/**
 * Answers "can we actually call this insurer?" — and nothing more.
 *
 * A caller must treat `available: false` as "record this honestly as manual or
 * unsupported", never as "proceed anyway".
 */
export function getInsurerIntegration(insurer: InsurerRecord): InsurerIntegrationDescriptor {
  const copy = INTEGRATION_MODE_COPY[insurer.integrationMode];

  if (!insurer.isActive) {
    return {
      available: false,
      mode: insurer.integrationMode,
      automated: false,
      reason: "This insurer is not active on the platform, so no request can be sent to them.",
    };
  }

  if (insurer.integrationMode !== "API") {
    return {
      available: false,
      mode: insurer.integrationMode,
      automated: false,
      reason: copy.detail,
    };
  }

  const config = getInsurerIntegrationConfig();
  if (!config) {
    return {
      available: false,
      mode: insurer.integrationMode,
      automated: false,
      reason:
        "No insurer API credential is configured on this deployment, so nothing can be sent automatically. The request will be handled manually with a reference number instead.",
    };
  }

  if (!insurer.integrationConfigured) {
    return {
      available: false,
      mode: insurer.integrationMode,
      automated: false,
      reason:
        "A credential has not been confirmed for this insurer on this deployment, so no automatic request will be sent. The request will be handled manually instead.",
    };
  }

  const baseUrl = (insurer.integrationBaseUrl ?? config.baseUrl).replace(/\/+$/, "");
  if (!baseUrl) {
    return {
      available: false,
      mode: insurer.integrationMode,
      automated: false,
      reason:
        "This insurer is marked as an API integration but no base URL is recorded, so no request will be sent.",
    };
  }

  return {
    available: true,
    mode: insurer.integrationMode,
    automated: true,
    reason: "Requests are sent to the insurer's system and their answers are recorded automatically.",
    baseUrl,
  };
}

// ---------------------------------------------------------------------------
// Call contract
// ---------------------------------------------------------------------------

type InsurerApiCall = {
  insurer: InsurerRecord;
  path: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
};

type InsurerApiResponse = { status: number; body: Record<string, unknown> };

const CALL_TIMEOUT_MS = 20_000;

/**
 * Sends one request to a configured insurer API.
 *
 * Everything that can go wrong produces a `failed` outcome with a message safe
 * to render: a non-2xx status, an unreadable body, a timeout or a network error.
 * Nothing is logged but the HTTP status — never the payload, never the key.
 */
async function callInsurerApi(input: InsurerApiCall): Promise<InsuranceIntegrationResult<InsurerApiResponse>> {
  const descriptor = getInsurerIntegration(input.insurer);
  if (!descriptor.available || !descriptor.baseUrl) {
    return integrationFailure(
      descriptor.mode === "API" ? "not_configured" : "not_supported",
      descriptor.reason,
    );
  }

  const config = getInsurerIntegrationConfig();
  if (!config) {
    return integrationFailure(
      "not_configured",
      "No insurer API credential is configured on this deployment, so nothing was sent.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${descriptor.baseUrl}${input.path.startsWith("/") ? "" : "/"}${input.path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
        accept: "application/json",
      },
      body: JSON.stringify(input.body),
      signal: input.signal ?? AbortSignal.timeout(CALL_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    console.error("[insurance] insurer API could not be reached", name || "unknown error");
    return integrationFailure(
      "failed",
      "The insurer's system could not be reached, so no answer was obtained. Nothing has been recorded as a decision.",
    );
  }

  if (!response.ok) {
    // The status is safe; the body is not logged, because it can carry patient data.
    console.error(`[insurance] insurer API returned ${response.status}`);
    return integrationFailure(
      "failed",
      `The insurer's system returned an error (${response.status}), so no answer was obtained.`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return integrationFailure("failed", "The insurer's system returned an unreadable answer, so none of it was recorded.");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return integrationFailure("failed", "The insurer's system returned an unexpected answer, so none of it was recorded.");
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

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export type EligibilitySubmissionInput = {
  insurer: InsurerRecord;
  policyNumber: string;
  memberId: string | null;
  patientName: string;
  plannedProcedure?: string | null;
  hospitalName?: string | null;
  /** The ORVEXA reference, sent so the insurer can quote it back. */
  reference: string;
  signal?: AbortSignal;
};

export type EligibilitySubmission = {
  status: Extract<EligibilityCheckStatus, "ACKNOWLEDGED" | "RESPONDED">;
  insurerReferenceNumber: string | null;
  /** Only the fields the insurer actually returned. Never invented. */
  responseSummary: Record<string, unknown>;
  respondedAt: Date;
};

/**
 * Asks the insurer whether a policy is live and what it covers.
 *
 * Returns `submitted` only when the insurer's system answered. A manual insurer
 * returns `not_supported`, and the caller records the check as such rather than
 * leaving a plausible-looking answer.
 */
export async function submitEligibilityCheck(
  input: EligibilitySubmissionInput,
): Promise<InsuranceIntegrationResult<EligibilitySubmission>> {
  const result = await callInsurerApi({
    insurer: input.insurer,
    path: "/eligibility",
    body: {
      reference: input.reference,
      policyNumber: input.policyNumber,
      memberId: input.memberId,
      patientName: input.patientName,
      plannedProcedure: input.plannedProcedure ?? null,
      hospitalName: input.hospitalName ?? null,
    },
    signal: input.signal,
  });

  if (result.outcome !== "submitted") return result;

  const body = result.data.body;
  const answered = body.eligible === true || body.eligible === false || readString(body, "status", "result") !== null;

  return {
    outcome: "submitted",
    data: {
      status: answered ? "RESPONDED" : "ACKNOWLEDGED",
      insurerReferenceNumber: readString(body, "referenceNumber", "reference", "requestId"),
      responseSummary: body,
      respondedAt: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// Pre-authorisation
// ---------------------------------------------------------------------------

export type PreAuthSubmissionInput = {
  insurer: InsurerRecord;
  reference: string;
  policyNumber: string;
  memberId: string | null;
  patientName: string;
  hospitalName: string;
  plannedProcedure: string;
  plannedAdmissionDate: Date | null;
  treatingDoctorName: string | null;
  treatingDoctorRegistration: string | null;
  requestedAmountPaise: number | null;
  signal?: AbortSignal;
};

export type PreAuthSubmission = {
  status: PreAuthStatus;
  insurerReferenceNumber: string | null;
  approvedAmountPaise: number | null;
  decisionNotes: string | null;
  decidedByLabel: string | null;
  validUntil: Date | null;
};

const PRE_AUTH_STATUS_BY_CODE: Record<string, PreAuthStatus> = {
  submitted: "SUBMITTED",
  acknowledged: "ACKNOWLEDGED",
  pending: "SUBMITTED",
  query: "QUERY_RAISED",
  query_raised: "QUERY_RAISED",
  approved: "APPROVED",
  partial: "PARTIALLY_APPROVED",
  partially_approved: "PARTIALLY_APPROVED",
  rejected: "REJECTED",
  declined: "REJECTED",
  expired: "EXPIRED",
};

function mapPreAuthStatus(value: string | null): PreAuthStatus | null {
  if (!value) return null;
  return PRE_AUTH_STATUS_BY_CODE[value.trim().toLowerCase()] ?? null;
}

/**
 * Files a cashless pre-authorisation with the insurer.
 *
 * A returned `SUBMITTED` or `ACKNOWLEDGED` is *not* an approval, and the caller
 * must keep saying so. An approval appears here only when the insurer's own
 * response said so.
 */
export async function submitPreAuthorization(
  input: PreAuthSubmissionInput,
): Promise<InsuranceIntegrationResult<PreAuthSubmission>> {
  const result = await callInsurerApi({
    insurer: input.insurer,
    path: "/pre-authorisations",
    body: {
      reference: input.reference,
      policyNumber: input.policyNumber,
      memberId: input.memberId,
      patientName: input.patientName,
      hospitalName: input.hospitalName,
      plannedProcedure: input.plannedProcedure,
      plannedAdmissionDate: input.plannedAdmissionDate ? input.plannedAdmissionDate.toISOString() : null,
      treatingDoctorName: input.treatingDoctorName,
      treatingDoctorRegistration: input.treatingDoctorRegistration,
      requestedAmountPaise: input.requestedAmountPaise,
    },
    signal: input.signal,
  });

  if (result.outcome !== "submitted") return result;

  const body = result.data.body;
  const status = mapPreAuthStatus(readString(body, "status", "decision", "result")) ?? "ACKNOWLEDGED";
  const approvedPaise = readInteger(body, "approvedAmountPaise", "approvedAmount");
  const validUntilRaw = readString(body, "validUntil", "validTo");

  return {
    outcome: "submitted",
    data: {
      status,
      insurerReferenceNumber: readString(body, "referenceNumber", "reference", "authorisationNumber"),
      approvedAmountPaise: approvedPaise,
      decisionNotes: readString(body, "notes", "reason", "decisionNotes"),
      decidedByLabel: readString(body, "decidedBy", "reviewer", "reviewerName"),
      validUntil: validUntilRaw ? parseDate(validUntilRaw) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Claim status
// ---------------------------------------------------------------------------

export type ClaimStatusFetchInput = {
  insurer: InsurerRecord;
  reference: string;
  insurerClaimNumber: string | null;
  signal?: AbortSignal;
};

export type ClaimStatusSnapshot = {
  status: ClaimStatus;
  decision: ClaimDecision;
  approvedAmountPaise: number | null;
  decisionNotes: string | null;
  decidedByLabel: string | null;
  decidedAt: Date | null;
};

const CLAIM_STATUS_BY_CODE: Record<string, ClaimStatus> = {
  received: "ACKNOWLEDGED",
  acknowledged: "ACKNOWLEDGED",
  information_required: "AWAITING_INFORMATION",
  query: "AWAITING_INFORMATION",
  under_review: "UNDER_REVIEW",
  approved: "APPROVED",
  partially_approved: "PARTIALLY_APPROVED",
  rejected: "REJECTED",
  settled: "SETTLED",
  closed: "CLOSED",
};

/**
 * Reads the insurer's current position on a claim.
 *
 * The mapping only recognises statuses the insurer named. An unrecognised
 * response is a `failed` call, not a guess: the claim stays exactly where it is.
 */
export async function fetchClaimStatus(
  input: ClaimStatusFetchInput,
): Promise<InsuranceIntegrationResult<ClaimStatusSnapshot>> {
  const result = await callInsurerApi({
    insurer: input.insurer,
    path: "/claims/status",
    body: {
      reference: input.reference,
      insurerClaimNumber: input.insurerClaimNumber,
    },
    signal: input.signal,
  });

  if (result.outcome !== "submitted") return result;

  const body = result.data.body;
  const code = readString(body, "status", "decision", "state")?.toLowerCase() ?? null;
  const status = code ? CLAIM_STATUS_BY_CODE[code] : undefined;

  if (!status) {
    return integrationFailure(
      "failed",
      "The insurer's system returned a status this platform does not recognise, so the claim was left unchanged.",
    );
  }

  const decision: ClaimDecision =
    status === "APPROVED"
      ? "APPROVED"
      : status === "PARTIALLY_APPROVED"
        ? "PARTIALLY_APPROVED"
        : status === "REJECTED"
          ? "REJECTED"
          : status === "AWAITING_INFORMATION"
            ? "QUERY_RAISED"
            : "PENDING";

  const decidedAtRaw = readString(body, "decidedAt", "updatedAt");

  return {
    outcome: "submitted",
    data: {
      status,
      decision,
      approvedAmountPaise: readInteger(body, "approvedAmountPaise", "approvedAmount"),
      decisionNotes: readString(body, "notes", "reason", "decisionNotes"),
      decidedByLabel: readString(body, "decidedBy", "reviewer", "reviewerName"),
      decidedAt: decidedAtRaw ? parseDate(decidedAtRaw) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Inbound callbacks
// ---------------------------------------------------------------------------

/**
 * Verifies an inbound insurer callback over the *exact* raw body string.
 *
 * The caller must read the body with `await request.text()` and pass that string
 * here, so the bytes verified are the bytes parsed. Without a configured
 * `INSURER_INTEGRATION_WEBHOOK_SECRET` every callback is refused rather than
 * trusted, because an unsigned payload is indistinguishable from a forgery.
 */
export function verifyInsurerCallbackSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
}): { ok: true } | { ok: false; message: string } {
  const config = getInsurerIntegrationConfig();
  if (!config?.webhookSecret) {
    return {
      ok: false,
      message: "No insurer callback secret is configured on this deployment, so this callback was refused.",
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

/** Whether the deployment can verify an inbound callback at all. */
export function isInsurerCallbackVerificationConfigured(): boolean {
  return getInsurerIntegrationConfig()?.webhookSecret !== undefined;
}

// ---------------------------------------------------------------------------
// Internal parsers
// ---------------------------------------------------------------------------

function readInteger(body: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.round(parsed);
    }
  }
  return null;
}

function parseDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
