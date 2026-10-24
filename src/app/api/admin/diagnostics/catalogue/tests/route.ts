import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { saveDiagnosticTest } from "@/lib/diagnostics/lab";
import { diagnosticTestSchema } from "@/lib/validation/diagnostics";

/**
 * Records a catalogue test.
 *
 * A test the platform may not list is stored with `listable: false` and a reason,
 * and is then invisible to every discovery and booking query — the exclusion is
 * enforced in the service and in the discovery reads, not in a page.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("diagnostics.catalogue_manage");
  if (!session.ok) return session.response;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = diagnosticTestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That catalogue test is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await saveDiagnosticTest({
    actorUserId: session.user.id,
    actorLabel: session.user.fullName,
    data: parsed.data,
  });
  if (!result.ok) return jsonError(422, result.message, { code: result.code });

  return jsonOk({ testId: result.testId, created: result.created }, { status: result.created ? 201 : 200 });
}
