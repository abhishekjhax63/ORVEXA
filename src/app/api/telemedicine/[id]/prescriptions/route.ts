import { jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { listPatientConsultationPrescriptions } from "@/lib/telemedicine/prescriptions";

/**
 * The prescriptions a patient may read from one of their own consultations.
 *
 * These are clinician-issued prescriptions only, and the ownership check is a
 * query: an appointment that is not this patient's returns an empty list without
 * revealing whether the appointment exists.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const { id } = await params;
  const prescriptions = await listPatientConsultationPrescriptions({
    appointmentId: decodeURIComponent(id),
    patientUserId: session.user.id,
  });

  return jsonOk({ prescriptions });
}
