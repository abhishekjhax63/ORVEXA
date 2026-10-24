import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { loadEmergencyIncident } from "@/lib/platform/emergency-ops";

/**
 * One incident, with its dispatch attempts and its own timeline.
 *
 * The timeline is the incident's append-only events, i.e. the same history the
 * patient sees. A console that rendered its own parallel history would let the
 * two disagree, and the one shown to the person in trouble is the one that must
 * be authoritative.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformRoute("platform.emergency_operations");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const { id } = await params;
  const incident = await loadEmergencyIncident({ incidentId: id });
  if (!incident) return jsonError(404, "That emergency incident was not found.");

  return jsonOk({ incident });
}
