import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { wellnessCategorySummary } from "@/lib/care/wellness";

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
 * What was recorded in each wellness category over a window.
 *
 * Raw values, counts and the ordered readings only. There is no average, no
 * trend verdict and no composite "wellness index" — ORVEXA does not score a
 * person's health, and two readings are two facts rather than one number.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.wellness_manage_own");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const from = parseDateParam(params.get("from"));
  const to = parseDateParam(params.get("to"));
  if (!from || !to) {
    return jsonError(422, "That request is not valid.", {
      fieldErrors: {
        ...(from ? {} : { from: "Choose a start date." }),
        ...(to ? {} : { to: "Choose an end date." }),
      },
    });
  }

  const result = await wellnessCategorySummary({
    user: session.user,
    ownerUserId: params.get("ownerUserId")?.trim() || undefined,
    familyMemberId: params.get("familyMemberId")?.trim() || undefined,
    from,
    to,
  });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ summary: result.data });
}
