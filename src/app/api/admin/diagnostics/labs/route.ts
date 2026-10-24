import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { listLabsForReview } from "@/lib/diagnostics/lab";

const filterSchema = z.object({
  verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "SUSPENDED"]).optional(),
});

/**
 * The reviewer's queue of laboratory applications.
 *
 * Every field a decision needs is here — registration, accreditation,
 * pathologist and their registration, and the current `canPublishReports` flag —
 * so a reviewer never has to accept a claim they cannot see the evidence for.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("verification.review");
  if (!session.ok) return session.response;

  const parsed = filterSchema.safeParse({
    verificationStatus: request.nextUrl.searchParams.get("verificationStatus") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(422, "That filter is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const labs = await listLabsForReview({ verificationStatus: parsed.data.verificationStatus });
  return jsonOk({ labs });
}
