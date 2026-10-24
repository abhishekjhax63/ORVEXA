import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { saveDiagnosticCategory } from "@/lib/diagnostics/lab";
import { diagnosticCategorySchema } from "@/lib/validation/diagnostics";

/**
 * Records a catalogue category.
 *
 * The diagnostics catalogue is a platform-verified list, like the medicine
 * catalogue: a partner prices it, but only the platform defines it.
 */
export async function POST(request: NextRequest) {
  const session = await requireRoutePermission("diagnostics.catalogue_manage");
  if (!session.ok) return session.response;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = diagnosticCategorySchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That category is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }

  const result = await saveDiagnosticCategory({
    actorUserId: session.user.id,
    actorLabel: session.user.fullName,
    data: parsed.data,
  });

  return jsonOk({ categoryId: result.categoryId, created: result.created }, { status: result.created ? 201 : 200 });
}
