import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import type { Permission } from "@/lib/auth/roles";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import { isManagedPartnerKind, setPartnerSuspension, type ManagedPartnerKind } from "@/lib/platform/verifications";
import { partnerSuspensionSchema } from "@/lib/validation/platform";

/**
 * The verification grant each partner kind's suspension requires.
 *
 * The kind sits in the path so the permission is known before the body is read:
 * refusing a hospital-only reviewer a pharmacy suspension happens in the guard,
 * which audits the denial, rather than in a hand-written check afterwards that
 * somebody would eventually forget to write.
 */
const SUSPENSION_PERMISSION: Record<ManagedPartnerKind, Permission> = {
  HOSPITAL: "platform.verify_hospital",
  DOCTOR: "platform.verify_doctor",
  PHARMACY: "platform.verify_pharmacy",
  LABORATORY: "platform.verify_laboratory",
  AMBULANCE: "platform.verify_ambulance",
  INSURER: "platform.verify_insurer",
};

/**
 * Suspends a verified partner, or lifts a suspension.
 *
 * The body's `partnerKind` is overwritten with the path segment, so the two can
 * never disagree about which table is being written.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const normalised = kind.trim().toUpperCase();

  if (!isManagedPartnerKind(normalised)) {
    return jsonError(404, "That is not a partner kind this platform manages.");
  }

  const session = await requirePlatformRoute(SUSPENSION_PERMISSION[normalised]);
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminDecisionWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, partnerSuspensionSchema, "That suspension");
  if (!parsed.ok) return parsed.response;

  const result = await setPartnerSuspension({
    context: session.context,
    data: { ...parsed.data, partnerKind: normalised },
  });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({
    partnerKind: result.data.kind,
    partnerId: result.data.id,
    label: result.data.label,
    verificationStatus: result.data.verificationStatus,
  });
}
