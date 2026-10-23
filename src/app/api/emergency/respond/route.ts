import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, zodFieldErrors } from "@/lib/auth/route-session";
import { safeCompare } from "@/lib/auth/tokens";
import { isResponderApiConfigured, recordResponderDecision } from "@/lib/emergency/dispatch";
import { getEmergencyResponderSecret } from "@/lib/env";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { clientIpFromHeaders, getRequestContext } from "@/lib/security/request";
import { responderDecisionSchema } from "@/lib/validation/emergency";

/**
 * Responder callback.
 *
 * This is the only endpoint in the product that can move an incident past
 * "seeking responders", and it is reachable only with the shared responder
 * secret. The patient-facing UI has no equivalent path, because a platform must
 * never be able to mark an ambulance as coming on a patient's word alone.
 *
 * POST is required. A GET is refused even though the callback URLs are readable,
 * because mail scanners and link previews issue GETs — if those could accept an
 * incident, an ambulance crew would appear to be on the way without a human ever
 * having agreed.
 */
const NOT_FOUND_MESSAGE = /^Unknown /;

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : value; // Return the raw value so Zod reports it.
}

export async function GET() {
  return jsonError(405, "Post responder decisions as JSON. This endpoint does not accept GET, so an email link scanner cannot answer for a responder.", {
    accepted: "POST",
  });
}

export async function POST(request: NextRequest) {
  if (!isResponderApiConfigured()) {
    return jsonError(503, "The responder callback is not configured on this deployment, so no decision can be recorded.");
  }

  const presented =
    request.headers.get("x-orvexa-responder-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const expected = getEmergencyResponderSecret() as string;
  if (presented === "" || !safeCompare(presented, expected)) {
    return jsonError(401, "That responder credential was not accepted.");
  }

  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.headers.get("content-type")?.includes("application/json")) {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;
    body = parsedBody.body && typeof parsedBody.body === "object" ? (parsedBody.body as Record<string, unknown>) : {};
  }

  const candidate = {
    requestId: url.searchParams.get("requestId") ?? body.requestId,
    decision: url.searchParams.get("decision") ?? body.decision,
    reason: url.searchParams.get("reason") ?? body.reason,
    etaMinutes: optionalNumber(url.searchParams.get("etaMinutes") ?? body.etaMinutes),
    distanceMetres: optionalNumber(url.searchParams.get("distanceMetres") ?? body.distanceMetres),
    responderReference: url.searchParams.get("responderReference") ?? body.responderReference,
  };

  const parsed = responderDecisionSchema.safeParse(candidate);
  if (!parsed.success) {
    return jsonError(422, "That decision payload is not valid.", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }

  const identity = parsed.data.requestId || `ip:${clientIpFromHeaders(request.headers) ?? "unknown"}`;
  const limit = await consumeRateLimit("emergencyRespondCallback", identity, RATE_LIMITS.emergencyRespondCallback);
  if (!limit.allowed) {
    return jsonError(429, "Too many responder callbacks. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  try {
    const context = await getRequestContext();
    const result = await recordResponderDecision({ ...parsed.data, context });
    return jsonOk({
      requestId: parsed.data.requestId,
      applied: result.applied,
      duplicate: result.duplicate,
      incidentStatus: result.incidentStatus,
      message: result.message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "That decision could not be recorded.";
    return jsonError(NOT_FOUND_MESSAGE.test(message) ? 404 : 409, message);
  }
}
