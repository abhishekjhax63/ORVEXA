import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listEmergencyIncidents } from "@/lib/platform/emergency-ops";
import { emergencyIncidentFilterSchema } from "@/lib/validation/platform";

/**
 * The SOS queue.
 *
 * Read-only on purpose. An operator watching this screen escalates by phone;
 * they cannot advance an incident's status, because "help is on the way" is only
 * ever true when a responder's own system said so. The summary alongside the
 * rows carries the count that matters — incidents where nothing has been
 * acknowledged.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.emergency_operations");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, emergencyIncidentFilterSchema, "That emergency filter");
  if (!parsed.ok) return parsed.response;

  const result = await listEmergencyIncidents({
    status: parsed.data.status,
    includeDemo: parsed.data.includeDemo,
    from: parsed.data.from,
    to: parsed.data.to,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  return jsonOk(result);
}
