import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { setCatalogueTestVerification } from "@/lib/diagnostics/lab";

const schema = z.object({
  testId: z.string().trim().min(1).max(64),
  verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "SUSPENDED"]),
});

/**
 * Sets a catalogue test's verification state.
 *
 * Verification is what allows the platform to describe a test as
 * platform-verified, so `dataProvenance` follows the decision inside the service
 * — a test is never presented as verified while its state says otherwise.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("diagnostics.catalogue_manage");
  if (!session.ok) return session.response;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That verification request is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await setCatalogueTestVerification({
    actorUserId: session.user.id,
    actorLabel: session.user.fullName,
    testId: parsed.data.testId,
    verificationStatus: parsed.data.verificationStatus,
  });
  if (!result.ok) return jsonError(404, result.message, { code: result.code });

  return jsonOk({ testId: result.testId });
}
