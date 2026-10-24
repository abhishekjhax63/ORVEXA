import type { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { getDoctorProfileForOwner, listClinicianTeleconsultations } from "@/lib/telemedicine/bookings";

/**
 * The treating clinician's virtual consultations.
 *
 * Scoped to the doctor profile owned by the signed-in account, so this cannot
 * return another clinician's list. `from` narrows to upcoming consultations when
 * the console is showing a schedule.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("provider.teleconsult_manage");
  if (!session.ok) return session.response;

  const doctor = await getDoctorProfileForOwner(session.user.id);
  if (!doctor) return jsonError(409, "Create your clinician profile to see virtual consultations.");

  const fromParam = request.nextUrl.searchParams.get("from");
  let from: Date | undefined;
  if (fromParam) {
    const parsed = new Date(fromParam);
    if (Number.isNaN(parsed.getTime())) return jsonError(400, "That 'from' filter is not a valid date.");
    from = parsed;
  }

  const consultations = await listClinicianTeleconsultations({ doctorUserId: session.user.id, from });
  return jsonOk({ doctor: { id: doctor.id, fullName: doctor.user.fullName }, consultations });
}
