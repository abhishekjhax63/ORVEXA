import type { NextRequest } from "next/server";

import { jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, readConsoleQuery } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { listAuditEvents } from "@/lib/security/audit";
import { auditLogFilterSchema } from "@/lib/validation/platform";

/**
 * The audit trail, newest first.
 *
 * Gated on `platform.security_operations`. A caller who lacks that permission is
 * refused *and* recorded — `requirePlatformRoute` writes a `platform.access_denied`
 * row — so an attempt to read the trail is visible even when it fails. The filter
 * is by action, entity, actor, hospital and window; there is no free-text search,
 * because searching an audit log for a name is how a privacy-conscious log
 * becomes a surveillance tool.
 */
export async function GET(request: NextRequest) {
  const session = await requirePlatformRoute("platform.security_operations");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  const parsed = readConsoleQuery(request, auditLogFilterSchema, "That audit filter");
  if (!parsed.ok) return parsed.response;

  const { items, total } = await listAuditEvents({
    action: parsed.data.action,
    entityType: parsed.data.entityType,
    actorUserId: parsed.data.actorUserId,
    hospitalId: parsed.data.hospitalId,
    from: parsed.data.from,
    to: parsed.data.to,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  return jsonOk({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize });
}
