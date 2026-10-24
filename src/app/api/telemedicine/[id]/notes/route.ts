import { jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { listPatientConsultationNotes } from "@/lib/telemedicine/notes";

/**
 * The finalised consultation notes a patient may read.
 *
 * A draft is the clinician's working text and is never returned here — not
 * filtered in the UI, simply not sent. An appointment that is not this
 * patient's yields an empty list without revealing whether it exists.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const { id } = await params;
  const notes = await listPatientConsultationNotes({
    appointmentId: decodeURIComponent(id),
    patientUserId: session.user.id,
  });

  return jsonOk({ notes });
}
