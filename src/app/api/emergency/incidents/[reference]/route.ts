import type { NextRequest } from "next/server";

import { hasPermission } from "@/lib/auth/guards";
import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { loadIncidentByReference, toIncidentSummary } from "@/lib/emergency/incidents";
import { recordAuditEvent } from "@/lib/security/audit";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { incidentReferenceSchema } from "@/lib/validation/emergency";

/**
 * Incident status, polled by the status page while an incident is open.
 *
 * The summary is built on the server from the database, so the client can never
 * promote a request to "accepted" by editing what it renders. A signed-in user
 * who is neither the reporter nor the patient gets a 404 rather than a 403, so
 * incident references cannot be probed for existence.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const session = await requireRoutePermission("emergency.raise");
  if (!session.ok) return session.response;

  const { reference } = await params;
  const parsed = incidentReferenceSchema.safeParse(reference);
  if (!parsed.success) return jsonError(404, "That incident reference was not found.");

  const limit = await consumeRateLimit("emergencyStatusPoll", `user:${session.user.id}`, RATE_LIMITS.emergencyStatusPoll);
  if (!limit.allowed) {
    return jsonError(429, "Too many status checks. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const incident = await loadIncidentByReference(parsed.data);
  if (!incident) return jsonError(404, "That incident reference was not found.");

  const isReporter = incident.createdById === session.user.id || incident.patientUserId === session.user.id;
  const isOversight = hasPermission(session.user, "audit.read");

  if (!isReporter && !isOversight) {
    await recordAuditEvent({
      action: "access.denied",
      entityType: "emergency_incident",
      entityId: incident.id,
      outcome: "DENIED",
      actorUserId: session.user.id,
      metadata: { reason: "cross_user_access", reference: parsed.data },
    });
    return jsonError(404, "That incident reference was not found.");
  }

  return jsonOk({
    incident: toIncidentSummary(incident),
    viewer: isReporter ? ("reporter" as const) : ("oversight" as const),
    // The page shows a live countdown; the clock is ours so a device with a wrong
    // time cannot claim a window has closed when it has not.
    serverTime: new Date().toISOString(),
  });
}
