import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { addEmergencyOperatorNote } from "@/lib/platform/emergency-ops";
import { emergencyOperatorNoteSchema } from "@/lib/validation/platform";

/**
 * An operator's note on an incident.
 *
 * The body schema's `incidentId` is dropped and the identifier is taken from the
 * path instead, so the note can never be attached to a different incident than
 * the one the operator is looking at. The note is appended to the incident's
 * timeline as a `NOTE` event: it adds context for whoever reads next, and it
 * deliberately changes no status, no dispatch state and no clinical fact.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformRoute("platform.emergency_operations");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminDecisionWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(
    request,
    emergencyOperatorNoteSchema.omit({ incidentId: true }),
    "That note",
  );
  if (!parsed.ok) return parsed.response;

  const { id } = await params;
  const result = await addEmergencyOperatorNote({
    context: session.context,
    data: { incidentId: id, note: parsed.data.note },
  });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk(result.data);
}
