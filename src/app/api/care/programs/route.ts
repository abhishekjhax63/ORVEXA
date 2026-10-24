import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { enrollCareProgram, listCarePrograms } from "@/lib/care/preventive";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { CARE_PROGRAM_KINDS, careProgramEnrollSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/** The person's care programme enrolments, active first. */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.reminders_manage_own");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const kindParam = params.get("kind");
  const result = await listCarePrograms({
    user: session.user,
    ownerUserId: params.get("ownerUserId")?.trim() || undefined,
    familyMemberId: params.get("familyMemberId")?.trim() || undefined,
    kind: CARE_PROGRAM_KINDS.find((value) => value === kindParam),
  });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ programs: result.data });
}

/**
 * Enrols somebody in a structured care programme.
 *
 * The enrolment is also written to the person's health timeline by the service,
 * because joining a course of care is part of their history.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.reminders_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = careProgramEnrollSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That programme enrolment is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await enrollCareProgram({ user: session.user, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ programId: result.data.programId });
}
