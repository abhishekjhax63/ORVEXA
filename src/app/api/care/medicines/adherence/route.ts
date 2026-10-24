import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { adherenceSummary } from "@/lib/care/medications";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/** Reads a required ISO date from a query string, or undefined if unreadable. */
function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * How many doses of a schedule fell into each outcome over a window.
 *
 * Counts only. There is no percentage, no score and no verdict here — a skipped
 * dose is a decision the person recorded while a missed dose is an omission, and
 * they are counted separately so the screen shows them side by side. The service
 * produces the raw counts and this route returns them unchanged.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.medications_manage_own");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const scheduleId = params.get("scheduleId")?.trim();
  const from = parseDateParam(params.get("from"));
  const to = parseDateParam(params.get("to"));
  if (!scheduleId || !from || !to) {
    return jsonError(422, "That request is not valid.", {
      fieldErrors: {
        ...(scheduleId ? {} : { scheduleId: "Choose a medicine schedule." }),
        ...(from ? {} : { from: "Choose a start date." }),
        ...(to ? {} : { to: "Choose an end date." }),
      },
    });
  }

  const result = await adherenceSummary({ user: session.user, scheduleId, from, to });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ adherence: result.data });
}
