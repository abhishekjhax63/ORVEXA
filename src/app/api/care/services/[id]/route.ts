import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { getCareServiceListing } from "@/lib/care/directory";

/**
 * One care service listing.
 *
 * Returned even when the listing has been switched off, so a link from a request
 * or a history still opens. `canRequest` carries whether it can be asked for
 * right now, so the page can explain a dead button rather than showing one.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("care.workspace_access");
  if (!session.ok) return session.response;

  const { id } = await params;
  const result = await getCareServiceListing({ listingId: id });
  if (!result) return jsonError(404, "That care service listing was not found.");

  return jsonOk({ listing: result.listing, canRequest: result.canRequest });
}
