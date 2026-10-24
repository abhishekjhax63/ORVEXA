import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { addFamilyMember, listFamilyMembers } from "@/lib/care/family";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { familyMemberCreateSchema } from "@/lib/validation/care";

/** Maps a service failure code onto the HTTP status the screen should see. */
function careFailureStatus(code: string): number {
  if (code === "not_found" || code.endsWith("_not_found")) return 404;
  if (code === "consent_required") return 403;
  return 409;
}

/**
 * The account holder's dependents.
 *
 * A dependent lives on the account holder's own record — a child, an elderly
 * parent — and is always fully controlled by the account holder. This is not
 * caregiver access: there is no invitation to accept and no consent to
 * withdraw.
 */
export async function GET() {
  const session = await requireRoutePermission("care.family_manage_own");
  if (!session.ok) return session.response;

  const familyMembers = await listFamilyMembers(session.user.id);
  return jsonOk({ familyMembers });
}

/**
 * Adds a dependent.
 *
 * The owning record is taken from the session and never from the body, so a
 * request can only ever add somebody to its own account.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("care.family_manage_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("profileWrite", `user:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!limit.allowed) {
    return jsonError(429, "Too many changes in a short time. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = familyMemberCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That family member is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await addFamilyMember({ user: session.user, data: parsed.data });
  if (!result.ok) return jsonError(careFailureStatus(result.code), result.message, { code: result.code });

  return jsonOk({ familyMemberId: result.data.familyMemberId });
}
