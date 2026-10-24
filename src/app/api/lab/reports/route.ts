import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { getLabProfileForOwner } from "@/lib/diagnostics/bookings";
import { LAB_QUEUE_REPORT_STATUSES } from "@/lib/diagnostics/lab";
import { createLabReport, listLabReportQueue } from "@/lib/diagnostics/reports";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { LAB_REPORT_STATUSES, labReportCreateSchema } from "@/lib/validation/diagnostics";

const queueFilterSchema = z.object({ status: z.enum(LAB_REPORT_STATUSES).optional() });

/** This laboratory's report queue, newest first within each status. */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("lab.booking_manage");
  if (!session.ok) return session.response;

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile to see the report desk.");

  const parsed = queueFilterSchema.safeParse({ status: request.nextUrl.searchParams.get("status") ?? undefined });
  if (!parsed.success) {
    return jsonError(422, "That status filter is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const reports = await listLabReportQueue({ labProfileId: lab.id, status: parsed.data.status });
  return jsonOk({ reports, queueStatuses: LAB_QUEUE_REPORT_STATUSES, canPublishReports: lab.canPublishReports });
}

/**
 * Opens a draft report against a booking.
 *
 * Only reachable once the sample has been recorded as collected, because a
 * report for a sample that was never taken would be a fabricated document.
 * Opening is idempotent: a booking that already has a working draft reuses it.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("lab.booking_manage");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("diagnosticReportWrite", `user:${session.user.id}`, RATE_LIMITS.diagnosticReportWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many report actions. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const lab = await getLabProfileForOwner(session.user.id);
  if (!lab) return jsonError(409, "Create your laboratory profile to open a report.");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = labReportCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That report request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await createLabReport({
    actor: { userId: session.user.id, role: "LAB_PARTNER", label: session.user.fullName },
    labProfileId: lab.id,
    bookingId: parsed.data.bookingId,
    interpretation: parsed.data.interpretation ?? null,
  });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "booking_not_ready" ? 409 : 422;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ report: result.report, created: result.created }, { status: result.created ? 201 : 200 });
}
