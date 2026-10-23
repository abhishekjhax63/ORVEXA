import "server-only";

import type { AuditOutcome, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getRequestContext, type RequestContext } from "@/lib/security/request";

/**
 * Audit trail for sensitive operations.
 *
 * Records are written for every authentication event, every role change, every
 * provider verification decision and every cross-user access denial. Secrets are
 * never passed in `metadata` — only identifiers, outcomes and safe summaries.
 */
export type AuditAction =
  | "auth.register"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.email_verified"
  | "auth.otp_requested"
  | "auth.otp_failed"
  | "auth.password_reset_requested"
  | "auth.password_reset_completed"
  | "auth.password_changed"
  | "auth.session_revoked"
  | "auth.sessions_revoked_all"
  | "profile.updated"
  | "avatar.updated"
  | "family_member.created"
  | "family_member.updated"
  | "family_member.deleted"
  | "consent.recorded"
  | "consent.revoked"
  | "notification_preferences.updated"
  | "partner_application.created"
  | "partner_application.submitted"
  | "partner_application.withdrawn"
  | "partner_application.reviewed"
  | "hospital.registered"
  | "hospital.updated"
  | "hospital.service_updated"
  | "hospital.opening_hours_updated"
  | "provider.profile_submitted"
  | "provider.schedule_created"
  | "provider.schedule_updated"
  | "provider.schedule_deleted"
  | "provider.slots_generated"
  | "provider.slot_blocked"
  | "verification.requested"
  | "verification.approved"
  | "verification.rejected"
  | "appointment.booked"
  | "appointment.rescheduled"
  | "appointment.cancelled"
  | "appointment.status_changed"
  | "appointment.reminder_queued"
  | "appointment.reminders_dispatched"
  | "emergency.incident_created"
  | "emergency.duplicate_suppressed"
  | "emergency.dispatch_requested"
  | "emergency.dispatch_failed"
  | "emergency.dispatch_retried"
  | "emergency.responder_acknowledged"
  | "emergency.responder_accepted"
  | "emergency.responder_declined"
  | "emergency.status_changed"
  | "emergency.incident_cancelled"
  | "emergency.incident_resolved"
  | "emergency.incident_expired"
  | "emergency.contact_notified"
  | "emergency.location_shared"
  | "emergency.location_share_viewed"
  | "emergency.contact_updated"
  | "access.denied"
  | "rate_limit.blocked"
  | "user.status_changed"
  | "user.role_granted"
  | "user.role_revoked"
  | "user.account_deactivated"
  | "maintenance.retention_purge"
  // AI health assistant.
  //
  // There is no action for "assessment generated": the assistant's reply is
  // recorded on the assessment row itself, and an audit event would only
  // duplicate it. These are the decisions worth an immutable trail — what was
  // kept, what was escalated, and who was allowed to see it.
  | "ai.conversation_created"
  | "ai.conversation_deleted"
  | "ai.turn_completed"
  | "ai.turn_failed"
  | "ai.upload_received"
  | "ai.upload_rejected"
  | "ai.upload_deleted"
  | "ai.assessment_saved"
  | "ai.assessment_deleted"
  | "ai.assessment_shared"
  | "ai.share_revoked"
  | "ai.share_viewed"
  | "ai.escalated"
  | "ai.review_requested"
  | "ai.review_decided"
  // Pharmacy and medicine ordering.
  //
  // Prices, refunds and prescription decisions are the events worth an immutable
  // trail. A prescription is a controlled document: who released it, to which
  // pharmacy, and who reviewed it, is recorded every time it moves.
  | "pharmacy.partner_registered"
  | "pharmacy.partner_updated"
  | "pharmacy.offer_costed"
  | "pharmacy.inventory_adjusted"
  | "pharmacy.cart_updated"
  | "pharmacy.order_created"
  | "pharmacy.order_status_changed"
  | "pharmacy.order_cancelled"
  | "pharmacy.payment_initiated"
  | "pharmacy.payment_captured"
  | "pharmacy.payment_failed"
  | "pharmacy.payment_webhook_received"
  | "pharmacy.payment_webhook_rejected"
  | "pharmacy.refund_requested"
  | "pharmacy.refund_decided"
  | "pharmacy.refund_processed"
  | "prescription.uploaded"
  | "prescription.review_started"
  | "prescription.clarification_requested"
  | "prescription.approved"
  | "prescription.rejected"
  | "prescription.withdrawn"
  | "prescription.document_accessed"
  | "address.created"
  | "address.updated"
  | "address.deleted"
  // Health insurance and claims.
  //
  // A decision on this surface is always the insurer's, never the platform's, so
  // the audit vocabulary distinguishes what was *requested* from what the insurer
  // *recorded*. Where no integration exists the action names say "recorded"
  // rather than "verified", because the platform cannot verify an insurer's data.
  | "insurance.policy_recorded"
  | "insurance.policy_updated"
  | "insurance.policy_deleted"
  | "insurance.policy_document_uploaded"
  | "insurance.policy_document_deleted"
  | "insurance.policy_document_accessed"
  | "insurance.claim_created"
  | "insurance.claim_updated"
  | "insurance.claim_withdrawn"
  | "insurance.claim_duplicate_suppressed"
  | "insurance.claim_document_uploaded"
  | "insurance.claim_document_deleted"
  | "insurance.claim_document_accessed"
  | "insurance.claim_query_raised"
  | "insurance.claim_query_answered"
  | "insurance.claim_status_changed"
  | "insurance.claim_decision_recorded"
  | "insurance.claim_decision_cleared"
  | "insurance.pre_authorisation_requested"
  | "insurance.pre_authorisation_updated"
  | "insurance.eligibility_requested"
  | "insurance.eligibility_recorded"
  | "insurance.settlement_recorded"
  | "insurance.partner_registered"
  | "insurance.partner_updated"
  | "insurance.product_recorded"
  | "insurance.product_updated"
  | "insurance.network_entry_recorded"
  | "insurance.network_entry_updated"
  | "insurance.network_entry_deleted";

export type AuditEntityType =
  | "user"
  | "session"
  | "patient_profile"
  | "family_member"
  | "doctor_profile"
  | "hospital"
  | "partner_application"
  | "verification_request"
  | "appointment"
  | "emergency_incident"
  | "emergency_dispatch_request"
  | "emergency_contact"
  | "emergency_location_share"
  | "consent"
  | "notification_preference"
  | "ai_conversation"
  | "ai_upload"
  | "ai_assessment"
  | "ai_assessment_share"
  | "ai_clinical_review"
  | "patient_address"
  | "pharmacy_partner_profile"
  | "medicine_product"
  | "pharmacy_offer"
  | "pharmacy_inventory_entry"
  | "pharmacy_cart"
  | "pharmacy_order"
  | "pharmacy_payment"
  | "pharmacy_refund"
  | "payment_webhook_event"
  | "prescription"
  | "prescription_document"
  | "insurer"
  | "insurer_partner_profile"
  | "insurance_product"
  | "insurance_network_hospital"
  | "insurance_policy"
  | "insurance_policy_document"
  | "insurance_claim"
  | "insurance_claim_document"
  | "insurance_claim_query"
  | "insurance_pre_authorization"
  | "insurance_eligibility_check"
  | "insurance_settlement"
  | "system";

export type AuditInput = {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  outcome?: AuditOutcome;
  actorUserId?: string | null;
  actorLabel?: string | null;
  metadata?: Prisma.InputJsonValue;
  context?: RequestContext;
};

/**
 * Audit writes must never break the user-facing flow, so failures are logged and
 * swallowed. The trade-off is deliberate: a lost audit row is preferable to a
 * failed appointment booking.
 */
export async function recordAuditEvent(input: AuditInput): Promise<void> {
  try {
    const context = input.context ?? (await getRequestContext());
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        outcome: input.outcome ?? "SUCCESS",
        actorUserId: input.actorUserId ?? null,
        actorLabel: input.actorLabel ?? null,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record event", input.action, error);
  }
}

/** Retention window for the audit log: 24 months, then rows are purged. */
export const AUDIT_RETENTION_MONTHS = 24;

export async function purgeAuditEventsOlderThanRetention() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - AUDIT_RETENTION_MONTHS);
  const result = await prisma.auditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}
