"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { AccessDeniedError, UnauthenticatedError, requirePermissionForAction } from "@/lib/auth/guards";
import { zodFieldErrors } from "@/lib/auth/route-session";
import { deleteEmergencyContact, saveEmergencyContact } from "@/lib/emergency/contacts";
import { dispatchIncident, retryIncidentRequests } from "@/lib/emergency/dispatch";
import type { EmergencyFormState } from "@/lib/emergency/form-state";
import {
  cancelEmergencyIncident,
  createEmergencyIncident,
  loadIncidentById,
  type IncidentActor,
} from "@/lib/emergency/incidents";
import { issueLocationShares } from "@/lib/emergency/location-share";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request";
import {
  cancelIncidentSchema,
  createIncidentSchema,
  emergencyContactSchema,
  locationShareRequestSchema,
  retryIncidentSchema,
} from "@/lib/validation/emergency";

/**
 * Emergency mutations.
 *
 * Every action takes its actor from the session — never from the form — and every
 * one re-checks the permission on the server. The one rule that governs the whole
 * module: a user can raise, watch, retry and cancel their own incident, and can
 * never mark a responder as coming. Only the responder callback can do that.
 *
 * A `"use server"` module may only export async functions, so the action state
 * type lives in `src/lib/emergency/form-state.ts`.
 */

function textOf(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function numberOf(formData: FormData, key: string) {
  const value = textOf(formData, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function failureFrom(error: unknown): EmergencyFormState {
  if (error instanceof UnauthenticatedError) return { status: "error", message: error.message };
  if (error instanceof AccessDeniedError) return { status: "error", message: error.message };
  if (error instanceof Error) return { status: "error", message: error.message };
  return { status: "error", message: "That request could not be completed." };
}

async function actorFor() {
  const user = await requirePermissionForAction("emergency.raise");
  const actor: IncidentActor = { id: user.id, fullName: user.fullName, email: user.email };
  return { user, actor };
}

// ---------------------------------------------------------------------------
// Raise, cancel, retry
// ---------------------------------------------------------------------------

export async function raiseEmergencyIncident(
  _previous: EmergencyFormState,
  formData: FormData,
): Promise<EmergencyFormState> {
  let actor: IncidentActor;
  let userId: string;
  try {
    const session = await actorFor();
    actor = session.actor;
    userId = session.user.id;
  } catch (error) {
    return failureFrom(error);
  }

  const candidate = {
    incidentType: textOf(formData, "incidentType"),
    injuryDescription: textOf(formData, "injuryDescription"),
    familyMemberId: textOf(formData, "familyMemberId"),
    location: {
      latitude: numberOf(formData, "latitude"),
      longitude: numberOf(formData, "longitude"),
      accuracyMetres: numberOf(formData, "accuracyMetres"),
      addressText: textOf(formData, "addressText"),
      locality: textOf(formData, "locality"),
      city: textOf(formData, "city"),
      locationConsent: checked(formData, "locationConsent"),
    },
    contactShareConsent: checked(formData, "contactShareConsent"),
    idempotencyKey: textOf(formData, "idempotencyKey"),
  };

  const parsed = createIncidentSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Some details are missing or not valid.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const limit = await consumeRateLimit("emergencyCreate", `user:${userId}`, RATE_LIMITS.emergencyCreate);
  if (!limit.allowed) {
    return {
      status: "error",
      message: `You have raised several incidents in a short time. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes, or call the emergency services directly.`,
    };
  }

  const context = await getRequestContext();

  let reference: string;
  let incidentId: string;
  let created: boolean;
  try {
    const result = await createEmergencyIncident({ actor, data: parsed.data, context });
    reference = result.incident.reference;
    incidentId = result.incident.id;
    created = result.created;
  } catch (error) {
    return failureFrom(error);
  }

  // The fan-out talks to external responders with a 10s timeout each. Running it
  // after the response keeps the reporter from waiting on somebody else's server,
  // and the status page polls for the requests as they appear.
  if (created) {
    after(async () => {
      const record = await loadIncidentById(incidentId);
      if (!record) return;
      await dispatchIncident(record, { actorLabel: actor.fullName, context });
    });
  }

  redirect(`/emergency/incidents/${reference}`);
}

export async function cancelIncident(_previous: EmergencyFormState, formData: FormData): Promise<EmergencyFormState> {
  let actor: IncidentActor;
  let userId: string;
  try {
    const session = await actorFor();
    actor = session.actor;
    userId = session.user.id;
  } catch (error) {
    return failureFrom(error);
  }

  const parsed = cancelIncidentSchema.safeParse({ incidentId: textOf(formData, "incidentId"), reason: textOf(formData, "reason") });
  if (!parsed.success) {
    return { status: "error", message: "That incident could not be cancelled.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  const limit = await consumeRateLimit("emergencyRetry", `user:${userId}`, RATE_LIMITS.emergencyRetry);
  if (!limit.allowed) {
    return { status: "error", message: "Too many requests. Wait a moment and try again." };
  }

  try {
    const incident = await cancelEmergencyIncident({
      actor,
      incidentId: parsed.data.incidentId,
      reason: parsed.data.reason,
      context: await getRequestContext(),
    });
    revalidatePath(`/emergency/incidents/${incident.reference}`);
    revalidatePath("/emergency/incidents");
    return { status: "success", message: "Incident cancelled. Any location links shared with your contacts have stopped working." };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function retryIncidentDispatch(
  _previous: EmergencyFormState,
  formData: FormData,
): Promise<EmergencyFormState> {
  let actor: IncidentActor;
  let userId: string;
  try {
    const session = await actorFor();
    actor = session.actor;
    userId = session.user.id;
  } catch (error) {
    return failureFrom(error);
  }

  const parsed = retryIncidentSchema.safeParse({
    incidentId: textOf(formData, "incidentId"),
    idempotencyKey: textOf(formData, "idempotencyKey"),
  });
  if (!parsed.success) {
    return { status: "error", message: "That retry could not be sent.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  const limit = await consumeRateLimit("emergencyRetry", `user:${userId}`, RATE_LIMITS.emergencyRetry);
  if (!limit.allowed) {
    return { status: "error", message: "Too many retries. Wait a moment and try again." };
  }

  try {
    const incident = await loadIncidentById(parsed.data.incidentId);
    if (!incident) return { status: "error", message: "That incident no longer exists." };
    if (incident.createdById !== actor.id && incident.patientUserId !== actor.id) {
      return { status: "error", message: "That incident does not belong to your account." };
    }

    const outcome = await retryIncidentRequests(incident, { actor, context: await getRequestContext() });
    revalidatePath(`/emergency/incidents/${incident.reference}`);
    return { status: "success", message: outcome.notice };
  } catch (error) {
    return failureFrom(error);
  }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function saveEmergencyContactAction(
  _previous: EmergencyFormState,
  formData: FormData,
): Promise<EmergencyFormState> {
  let actor: IncidentActor;
  let userId: string;
  try {
    const session = await actorFor();
    actor = session.actor;
    userId = session.user.id;
  } catch (error) {
    return failureFrom(error);
  }

  const parsed = emergencyContactSchema.safeParse({
    id: textOf(formData, "id"),
    fullName: textOf(formData, "fullName"),
    relationship: textOf(formData, "relationship"),
    phone: textOf(formData, "phone"),
    email: textOf(formData, "email") ?? "",
    canReceiveLocation: checked(formData, "canReceiveLocation"),
    isPrimary: checked(formData, "isPrimary"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Check the contact details.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  const limit = await consumeRateLimit("emergencyContactWrite", `user:${userId}`, RATE_LIMITS.emergencyContactWrite);
  if (!limit.allowed) {
    return { status: "error", message: "Too many contact changes. Wait a moment and try again." };
  }

  try {
    const record = await saveEmergencyContact({
      actor: { id: actor.id, fullName: actor.fullName },
      contact: parsed.data,
      context: await getRequestContext(),
    });
    revalidatePath("/emergency/contacts");
    return {
      status: "success",
      message: parsed.data.id ? `${record.fullName} was updated.` : `${record.fullName} was added to your emergency contacts.`,
    };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function deleteEmergencyContactAction(
  _previous: EmergencyFormState,
  formData: FormData,
): Promise<EmergencyFormState> {
  let actor: IncidentActor;
  let userId: string;
  try {
    const session = await actorFor();
    actor = session.actor;
    userId = session.user.id;
  } catch (error) {
    return failureFrom(error);
  }

  const contactId = textOf(formData, "contactId");
  if (!contactId) return { status: "error", message: "That contact could not be found." };

  const limit = await consumeRateLimit("emergencyContactWrite", `user:${userId}`, RATE_LIMITS.emergencyContactWrite);
  if (!limit.allowed) {
    return { status: "error", message: "Too many contact changes. Wait a moment and try again." };
  }

  try {
    await deleteEmergencyContact({
      actor: { id: actor.id, fullName: actor.fullName },
      contactId,
      context: await getRequestContext(),
    });
    revalidatePath("/emergency/contacts");
    return { status: "success", message: "Contact removed." };
  } catch (error) {
    return failureFrom(error);
  }
}

// ---------------------------------------------------------------------------
// Location sharing with nominated contacts
// ---------------------------------------------------------------------------

export async function shareIncidentLocation(
  _previous: EmergencyFormState,
  formData: FormData,
): Promise<EmergencyFormState> {
  let actor: IncidentActor;
  let userId: string;
  try {
    const session = await actorFor();
    actor = session.actor;
    userId = session.user.id;
  } catch (error) {
    return failureFrom(error);
  }

  const parsed = locationShareRequestSchema.safeParse({
    incidentId: textOf(formData, "incidentId"),
    contactIds: formData.getAll("contactIds").map(String).filter(Boolean),
    ttlMinutes: numberOf(formData, "ttlMinutes"),
    idempotencyKey: textOf(formData, "idempotencyKey"),
  });
  if (!parsed.success) {
    return { status: "error", message: "That share could not be issued.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  const limit = await consumeRateLimit("emergencyLocationShare", `user:${userId}`, RATE_LIMITS.emergencyLocationShare);
  if (!limit.allowed) {
    return { status: "error", message: "Too many share requests. Wait a moment and try again." };
  }

  try {
    const incident = await loadIncidentById(parsed.data.incidentId);
    if (!incident) return { status: "error", message: "That incident no longer exists." };
    if (incident.createdById !== actor.id && incident.patientUserId !== actor.id) {
      return { status: "error", message: "That incident does not belong to your account." };
    }

    const result = await issueLocationShares({
      actor,
      incident,
      contactIds: parsed.data.contactIds,
      ttlMinutes: parsed.data.ttlMinutes,
      context: await getRequestContext(),
    });

    revalidatePath(`/emergency/incidents/${incident.reference}`);

    const shareLinks = result.issued
      .filter((entry): entry is typeof entry & { link: string } => entry.link !== null)
      .map((entry) => ({ contactLabel: entry.contactLabel, link: entry.link, expiresAtISO: entry.expiresAtISO }));

    return {
      status: shareLinks.length > 0 ? "success" : "error",
      message: result.notice,
      shareLinks,
    };
  } catch (error) {
    return failureFrom(error);
  }
}
