import { jsonError, jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { getPatientTeleconsultationByReference } from "@/lib/telemedicine/bookings";
import { teleconsultReferenceSchema } from "@/lib/validation/telemedicine";

/**
 * One consultation, by reference.
 *
 * The lookup is scoped to the signed-in account, so another patient's reference
 * resolves to a 404 rather than to their consultation.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const { reference } = await params;
  const parsed = teleconsultReferenceSchema.safeParse(decodeURIComponent(reference));
  if (!parsed.success) return jsonError(400, "That is not a valid consultation reference.");

  const consultation = await getPatientTeleconsultationByReference({
    userId: session.user.id,
    reference: parsed.data,
  });
  if (!consultation) return jsonError(404, "That consultation was not found on your account.");

  return jsonOk({ consultation });
}
