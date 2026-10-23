import "server-only";

import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RequestContext } from "@/lib/security/request";
import type { EmergencyContactInput } from "@/lib/validation/emergency";

/**
 * Emergency contacts.
 *
 * A contact can only ever be created for the signed-in account: `ownerUserId`
 * comes from the session, never from the form. `canReceiveLocation` is a
 * separate, deliberate opt-in per contact, so consenting for one family member
 * does not consent for all of them.
 */

export const MAX_EMERGENCY_CONTACTS = 10;

export async function listEmergencyContacts(userId: string) {
  return prisma.emergencyContact.findMany({
    where: { ownerUserId: userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function saveEmergencyContact(input: {
  actor: { id: string; fullName: string };
  contact: EmergencyContactInput;
  context?: RequestContext;
}) {
  const { actor, contact } = input;

  if (!contact.id) {
    const existing = await prisma.emergencyContact.count({ where: { ownerUserId: actor.id } });
    if (existing >= MAX_EMERGENCY_CONTACTS) {
      throw new Error(`You can save up to ${MAX_EMERGENCY_CONTACTS} emergency contacts.`);
    }
  } else {
    // Ownership is verified before any write, so a guessed id cannot edit or
    // re-point somebody else's contact.
    const owned = await prisma.emergencyContact.findFirst({
      where: { id: contact.id, ownerUserId: actor.id },
      select: { id: true },
    });
    if (!owned) throw new Error("That contact is not on your account.");
  }

  const record = contact.id
    ? await prisma.emergencyContact.update({
        where: { id: contact.id },
        data: {
          fullName: contact.fullName,
          relationship: contact.relationship ?? null,
          phone: contact.phone,
          email: contact.email ? contact.email : null,
          canReceiveLocation: contact.canReceiveLocation,
          isPrimary: contact.isPrimary,
        },
      })
    : await prisma.emergencyContact.create({
        data: {
          ownerUserId: actor.id,
          fullName: contact.fullName,
          relationship: contact.relationship ?? null,
          phone: contact.phone,
          email: contact.email ? contact.email : null,
          canReceiveLocation: contact.canReceiveLocation,
          isPrimary: contact.isPrimary,
        },
      });

  if (contact.isPrimary) {
    await prisma.emergencyContact.updateMany({
      where: { ownerUserId: actor.id, id: { not: record.id } },
      data: { isPrimary: false },
    });
  }

  await recordAuditEvent({
    action: "emergency.contact_updated",
    entityType: "emergency_contact",
    entityId: record.id,
    actorUserId: actor.id,
    actorLabel: actor.fullName,
    context: input.context,
    metadata: {
      created: !contact.id,
      canReceiveLocation: record.canReceiveLocation,
      isPrimary: record.isPrimary,
    },
  });

  return record;
}

export async function deleteEmergencyContact(input: {
  actor: { id: string; fullName: string };
  contactId: string;
  context?: RequestContext;
}) {
  const owned = await prisma.emergencyContact.findFirst({
    where: { id: input.contactId, ownerUserId: input.actor.id },
    select: { id: true },
  });
  if (!owned) throw new Error("That contact is not on your account.");

  await prisma.emergencyContact.delete({ where: { id: owned.id } });

  await recordAuditEvent({
    action: "emergency.contact_updated",
    entityType: "emergency_contact",
    entityId: owned.id,
    actorUserId: input.actor.id,
    actorLabel: input.actor.fullName,
    context: input.context,
    metadata: { deleted: true },
  });
}
