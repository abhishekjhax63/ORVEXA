import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { withdrawLabReport } from "@/lib/diagnostics/reports";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { labReportWithdrawSchema } from "@/lib/validation/diagnostics";

/**
 * Withdraws a report permanently.
 *
 * A withdrawn report keeps its reference and its access history but returns no
 * content, so a page can say the laboratory withdrew it rather than rendering a
 * stale table. The reason is required and is recorded.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("lab.booking_manage");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("diagnosticReportWrite", `user:${session.user.id}`, RATE_LIMITS.diagnosticReportWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many report actions. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile to withdraw a report.");

  const { id } = await params;
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = labReportWithdrawSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That withdrawal request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }
  if (parsed.data.reportId !== decodeURIComponent(id)) {
    return jsonError(400, "The report id in the request did not match the report being withdrawn.");
  }

  const result = await withdrawLabReport({
    actor: { userId: session.user.id, role: "LAB_PARTNER", label: session.user.fullName },
    labProfileId: lab.id,
    reportId: parsed.data.reportId,
    reason: parsed.data.reason,
  });
  if (!result.ok) return jsonError(result.code === "not_found" ? 404 : 409, result.message, { code: result.code });

  return jsonOk({ reportId: result.reportId, reference: result.reference, status: result.status });
}
