import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody, requireRoutePermission, zodFieldErrors } from "@/lib/auth/route-session";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getConsultationChat, sendConsultationMessage } from "@/lib/telemedicine/messages";
import { consultationMessageSchema } from "@/lib/validation/telemedicine";

/**
 * The clinician–patient chat for one consultation.
 *
 * Both handlers require `telemedicine.read_own`, which every signed-in account
 * holds; the real gate is the service, which refuses anyone who is not one of
 * the appointment's two parties. The window is derived from the appointment, so
 * no request can extend it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const { id } = await params;
  const result = await getConsultationChat({
    appointmentId: decodeURIComponent(id),
    userId: session.user.id,
  });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "not_a_participant" ? 403 : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ chat: result.chat });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoutePermission("telemedicine.read_own");
  if (!session.ok) return session.response;

  const limit = await consumeRateLimit("telemedicineChat", `user:${session.user.id}`, RATE_LIMITS.telemedicineChat);
  if (!limit.allowed) {
    return jsonError(429, "Too many messages. Wait a moment and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = consultationMessageSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return jsonError(422, "That message is not valid.", { fieldErrors: zodFieldErrors(parsed.error) });
  }
  if (parsed.data.appointmentId !== decodeURIComponent(id)) {
    return jsonError(409, "That message does not match this consultation.");
  }

  const result = await sendConsultationMessage({
    actor: {
      userId: session.user.id,
      role: session.user.roles.includes("DOCTOR") ? "DOCTOR" : "PATIENT",
      label: session.user.fullName,
    },
    data: parsed.data,
  });
  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "not_a_participant"
          ? 403
          : result.code === "invalid_attachment"
            ? 422
            : 409;
    return jsonError(status, result.message, { code: result.code });
  }

  return jsonOk({ message: result.message }, { status: 201 });
}
