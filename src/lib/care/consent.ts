import "server-only";

import type { ConsentType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/security/audit";
import { getRequestContext, type RequestContext } from "@/lib/security/request";
import { ConsentRequiredFailure } from "@/lib/care/errors";

/**
 * Consent for the two Phase 10 decisions that write about a person using data
 * they did not type themselves: family access to their record, and imported
 * measurements.
 *
 * Both follow the same idiom as insurance and diagnostics consent: a withdrawal
 * is a second `granted: false` row rather than a delete, so the trail can show
 * that consent was held at the time something happened and was removed later.
 * That matters here more than anywhere else, because a caregiver's read is
 * justified entirely by the consent row that existed when they read.
 */

export const CAREGIVER_CONSENT_POLICY_VERSION = "orvexa-caregiver-consent-v1";
export const DEVICE_IMPORT_CONSENT_POLICY_VERSION = "orvexa-device-import-consent-v1";

/** The most recent decision for one consent type, or null when never asked. */
export async function latestConsent(userId: string, consentType: ConsentType) {
  return prisma.consentRecord.findFirst({
    where: { userId, consentType },
    orderBy: { grantedAt: "desc" },
  });
}

/**
 * Whether the account currently holds a consent.
 *
 * "No record" reads as false. Nothing in this phase may treat silence as
 * permission, and a revoked consent reads as false even though a granted row
 * still exists behind it.
 */
export async function hasConsent(userId: string, consentType: ConsentType): Promise<boolean> {
  const record = await latestConsent(userId, consentType);
  return Boolean(record?.granted);
}

export async function recordConsent(input: {
  userId: string;
  consentType: ConsentType;
  granted: boolean;
  policyVersion: string;
  context?: RequestContext;
}): Promise<{ granted: boolean; at: Date; consentRecordId: string }> {
  const at = new Date();
  const context = input.context ?? (await getRequestContext());

  const record = await prisma.consentRecord.create({
    data: {
      userId: input.userId,
      consentType: input.consentType,
      policyVersion: input.policyVersion,
      granted: input.granted,
      grantedAt: at,
      revokedAt: input.granted ? null : at,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });

  await recordAuditEvent({
    action: input.granted ? "consent.recorded" : "consent.revoked",
    entityType: "consent",
    entityId: record.id,
    actorUserId: input.userId,
    context,
    metadata: { consentType: input.consentType, policyVersion: input.policyVersion },
  });

  return { granted: input.granted, at, consentRecordId: record.id };
}

/**
 * Throws unless the consent is currently held.
 *
 * Called at the one place each capability begins — inviting a caregiver,
 * importing a device export — rather than per field, so there is no path that
 * writes without passing through here.
 */
export async function requireConsent(input: {
  userId: string;
  consentType: ConsentType;
  message: string;
}): Promise<void> {
  if (await hasConsent(input.userId, input.consentType)) return;
  throw new ConsentRequiredFailure(input.consentType, input.message);
}
