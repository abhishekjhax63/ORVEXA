import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { getEducationResource } from "@/lib/care/directory";

/** One health education article. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.workspace_access");
  if (!session.ok) return session.response;

  const { id } = await params;
  const resource = await getEducationResource({ resourceId: id });
  if (!resource) return jsonError(404, "That health education article was not found.");

  return jsonOk({ resource });
}
