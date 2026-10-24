import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { getClinicianConsultation } from "@/lib/telemedicine/bookings";

/**
 * The full consultation workspace for the treating clinician.
 *
 * The query is scoped by the doctor profile's owner, so a clinician cannot open
 * another clinician's consultation by guessing an id — the row simply is not
 * returned.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("provider.teleconsult_manage");
  if (!session.ok) return session.response;

  const { id } = await params;
  const consultation = await getClinicianConsultation({
    doctorUserId: session.user.id,
    appointmentId: decodeURIComponent(id),
  });
  if (!consultation) return jsonError(404, "That consultation was not found on your practice.");

  return jsonOk({ consultation });
}
