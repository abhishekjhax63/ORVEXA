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
  | "insurance.network_entry_deleted"
  // Diagnostics and laboratory reports.
  //
  // A report is a clinical document about a person, so its whole life is
  // recorded: who uploaded it, who authenticated it, who was allowed to open it
  // and who handed it to somebody else. Where ORVEXA cannot do something itself —
  // authenticate a result, verify an accreditation — the action name says
  // "recorded" rather than "verified".
  | "lab.partner_registered"
  | "lab.partner_updated"
  | "lab.offer_updated"
  | "diagnostics.category_recorded"
  | "diagnostics.category_updated"
  | "diagnostics.test_recorded"
  | "diagnostics.test_updated"
  | "diagnostics.booking_created"
  | "diagnostics.booking_rescheduled"
  | "diagnostics.booking_cancelled"
  | "diagnostics.booking_status_changed"
  | "diagnostics.booking_duplicate_suppressed"
  | "diagnostics.report_created"
  | "diagnostics.report_document_uploaded"
  | "diagnostics.report_document_deleted"
  | "diagnostics.report_published"
  | "diagnostics.report_amended"
  | "diagnostics.report_withdrawn"
  | "diagnostics.report_viewed"
  | "diagnostics.report_downloaded"
  | "diagnostics.report_link_issued"
  | "diagnostics.report_shared"
  | "diagnostics.report_share_revoked"
  | "diagnostics.report_share_viewed"
  // Telemedicine and consultation records.
  //
  // A session is only ever recorded as ready or active when the configured video
  // provider said so, and a note or prescription is only valid once a verified
  // clinician finalised it. The vocabulary keeps those two acts distinct: hosting
  // a call is not the same as making a clinical record.
  | "telemedicine.session_created"
  | "telemedicine.session_ready"
  | "telemedicine.session_failed"
  | "telemedicine.session_join_link_issued"
  | "telemedicine.session_joined"
  | "telemedicine.session_reconnected"
  | "telemedicine.session_ended"
  | "telemedicine.session_expired"
  | "telemedicine.session_cancelled"
  | "telemedicine.provider_webhook_received"
  | "telemedicine.provider_webhook_rejected"
  | "consultation.note_saved"
  | "consultation.note_finalized"
  | "consultation.note_amended"
  | "consultation.prescription_issued"
  | "consultation.message_sent"
  | "consultation.attachment_accessed"
  // Hospital management (Phase 9).
  //
  // Two families of events get a row here and nowhere else.
  //
  // The first is access to a patient's clinical record. Reading a chart, a lab
  // result or a discharge summary is an event even when nothing is written,
  // because "who looked at this patient's file" is exactly the question a
  // hospital has to be able to answer afterwards.
  //
  // The second is a transition that moves a patient, a rupee or a controlled
  // item: an admission, a bed assignment, a discharge, an invoice, a payment, a
  // refund, a dispense. Every one of those is written by a named staff member
  // and is reconstructible from this trail alone.
  //
  // Tenant isolation failures are recorded too. A staff member reaching for
  // another hospital's record is a security event, not a 404.
  | "hospital.staff_invited"
  | "hospital.staff_role_changed"
  | "hospital.staff_removed"
  | "hospital.workspace_accessed"
  | "hospital.tenant_access_denied"
  | "hospital.patient_registered"
  | "hospital.patient_updated"
  | "hospital.record_read"
  | "hospital.record_written"
  | "hospital.record_entry_amended"
  | "hospital.diagnosis_recorded"
  | "hospital.diagnosis_updated"
  | "hospital.vitals_recorded"
  | "hospital.prescription_issued"
  | "hospital.prescription_cancelled"
  | "hospital.opd_registered"
  | "hospital.opd_status_changed"
  | "hospital.opd_priority_changed"
  | "hospital.opd_cancelled"
  | "hospital.admission_created"
  | "hospital.admission_bed_assigned"
  | "hospital.admission_discharge_requested"
  | "hospital.admission_discharged"
  | "hospital.admission_cancelled"
  | "hospital.bed_transfer_recorded"
  | "hospital.bed_status_changed"
  | "hospital.ward_created"
  | "hospital.ward_updated"
  | "hospital.shift_scheduled"
  | "hospital.shift_updated"
  | "hospital.nursing_assignment_recorded"
  | "hospital.lab_order_created"
  | "hospital.lab_order_status_changed"
  | "hospital.lab_result_recorded"
  | "hospital.lab_result_verified"
  | "hospital.lab_result_amended"
  | "hospital.imaging_referral_created"
  | "hospital.imaging_referral_status_changed"
  | "hospital.stock_item_created"
  | "hospital.stock_adjusted"
  | "hospital.stock_alert_acknowledged"
  | "hospital.stock_alert_resolved"
  | "hospital.dispense_created"
  | "hospital.dispense_cancelled"
  | "hospital.dispense_duplicate_suppressed"
  | "hospital.charge_item_created"
  | "hospital.charge_item_updated"
  | "hospital.invoice_created"
  | "hospital.invoice_issued"
  | "hospital.invoice_voided"
  | "hospital.payment_recorded"
  | "hospital.refund_recorded"
  | "hospital.insurance_eligibility_checked"
  | "hospital.pre_authorisation_created"
  | "hospital.pre_authorisation_status_changed"
  | "hospital.insurance_claim_created"
  | "hospital.insurance_claim_status_changed"
  | "hospital.emergency_intake_created"
  | "hospital.emergency_triage_recorded"
  | "hospital.emergency_episode_closed"
  | "hospital.emergency_ambulance_dispatched"
  | "hospital.supplier_created"
  | "hospital.supplier_updated"
  | "hospital.purchase_order_created"
  | "hospital.purchase_order_status_changed"
  | "hospital.purchase_order_received"
  | "hospital.asset_created"
  | "hospital.asset_updated"
  | "hospital.asset_maintenance_recorded"
  | "hospital.feedback_received"
  | "hospital.feedback_status_changed"
  | "hospital.complaint_created"
  | "hospital.complaint_updated"
  | "hospital.complaint_status_changed"
  // Patient care and wellness (Phase 10).
  //
  // Three families belong here rather than nowhere.
  //
  // The first is consent to a family member's health information. Granting,
  // accepting, reviewing and revoking caregiver access are the events the person
  // whose record it is must be able to prove later, so each one is recorded with
  // the scopes that were in force and the acting account.
  //
  // The second is the opening of a document or a record by somebody who is not
  // its owner. A caregiver reading a relative's report is a legitimate read and
  // still an event, for the same reason a clinician's read is.
  //
  // The third is every write that a device or an import performed on a person's
  // record, and every reminder that was deliberately *not* sent. "We did not
  // notify you twice" and "this reading came from a wearable, not from your
  // doctor" are claims the platform makes, so both are auditable facts.
  | "care.caregiver_access_invited"
  | "care.caregiver_access_accepted"
  | "care.caregiver_access_scope_changed"
  | "care.caregiver_access_revoked"
  | "care.caregiver_access_reviewed"
  | "care.caregiver_access_expired"
  | "care.caregiver_scope_denied"
  | "care.record_read"
  | "care.record_written"
  | "care.record_verified_by_clinician"
  | "care.document_uploaded"
  | "care.document_downloaded"
  | "care.document_archived"
  | "care.family_member_added"
  | "care.family_member_updated"
  | "care.reminder_created"
  | "care.reminder_updated"
  | "care.reminder_paused"
  | "care.reminder_cancelled"
  | "care.reminder_preferences_changed"
  | "care.reminder_dispatched"
  | "care.reminder_suppressed"
  | "care.preventive_plan_created"
  | "care.preventive_plan_status_changed"
  | "care.care_program_enrolled"
  | "care.care_program_status_changed"
  | "care.medication_schedule_created"
  | "care.medication_schedule_updated"
  | "care.medication_schedule_stopped"
  | "care.medication_schedule_edit_denied"
  | "care.medication_dose_logged"
  | "care.wellness_entry_recorded"
  | "care.wellness_entry_updated"
  | "care.wellness_goal_created"
  | "care.wellness_goal_status_changed"
  | "care.device_connection_created"
  | "care.device_connection_revoked"
  | "care.device_import_started"
  | "care.device_import_completed"
  | "care.device_import_failed"
  | "care.care_service_requested"
  | "care.care_service_request_status_changed"
  | "care.care_service_listing_created"
  | "care.care_service_listing_updated"
  | "care.feedback_submitted"
  | "care.support_ticket_created"
  | "care.support_ticket_updated"
  | "care.support_ticket_status_changed"
  | "care.support_ticket_replied"
  | "care.education_resource_created"
  | "care.education_resource_updated"
  | "care.mental_wellness_resource_created"
  | "care.mental_wellness_resource_updated"
  // Platform administration (Phase 11).
  //
  // The operations console is the surface where the platform's own staff act on
  // other people's data, so every privileged act here writes a row. The
  // vocabulary is deliberately fine-grained: "who approved this laboratory" and
  // "who changed the refund state of this order" are different questions, and a
  // single `admin.action` would answer neither.
  //
  // Two families deserve naming. A *decision* on a partner or a person
  // (`platform.verification_decided`, `platform.partner_application_decided`,
  // `platform.abuse_report_decided`, `platform.account_deletion_decided`) is
  // recorded with the operator and the reason, because it is the platform
  // exercising authority over somebody. A *configuration change*
  // (`platform.setting_updated`, `platform.feature_flag_updated`) is recorded
  // with the old and new value, because a flag that flipped at 03:00 with no
  // author is how an outage becomes unexplainable.
  | "platform.access_denied"
  | "platform.staff_role_granted"
  | "platform.staff_role_revoked"
  | "platform.staff_role_updated"
  | "platform.verification_decided"
  | "platform.verification_info_requested"
  | "platform.partner_application_decided"
  | "platform.partner_suspended"
  | "platform.setting_updated"
  | "platform.feature_flag_updated"
  | "platform.notification_template_updated"
  | "platform.region_list_updated"
  | "platform.support_ticket_updated"
  | "platform.support_ticket_replied"
  | "platform.grievance_updated"
  | "platform.abuse_report_created"
  | "platform.abuse_report_decided"
  | "platform.refund_decided"
  | "platform.emergency_note_added"
  | "platform.alert_raised"
  | "platform.alert_acknowledged"
  | "platform.alert_resolved"
  | "platform.metric_snapshot_recorded"
  | "platform.report_export_requested"
  | "platform.report_export_completed"
  | "platform.report_export_failed"
  | "platform.report_export_downloaded"
  | "platform.report_export_expired"
  | "platform.retention_policy_updated"
  | "platform.retention_purge_run"
  | "platform.account_deletion_requested"
  | "platform.account_deletion_cancelled"
  | "platform.account_deletion_decided"
  | "platform.integration_health_checked";

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
  | "lab_partner_profile"
  | "ambulance_partner_profile"
  | "diagnostic_category"
  | "diagnostic_test"
  | "diagnostic_test_offer"
  | "diagnostic_booking"
  | "lab_report"
  | "lab_report_document"
  | "lab_report_share"
  | "teleconsultation_session"
  | "video_provider_event"
  | "consultation_note"
  | "consultation_message"
  // Hospital management (Phase 9). Every one of these belongs to exactly one
  // hospital, and the audit row carries that `hospitalId` so a hospital
  // administrator can read their own trail without seeing anybody else's.
  | "hospital_member"
  | "hospital_patient"
  | "hospital_record_entry"
  | "hospital_diagnosis"
  | "hospital_vitals"
  | "hospital_prescription"
  | "opd_department"
  | "opd_visit"
  | "ward"
  | "bed"
  | "admission"
  | "bed_transfer"
  | "hospital_shift"
  | "nursing_assignment"
  | "hospital_lab_order"
  | "hospital_lab_result"
  | "imaging_referral"
  | "hospital_pharmacy_unit"
  | "hospital_stock_item"
  | "hospital_stock_alert"
  | "hospital_dispense"
  | "hospital_charge_item"
  | "hospital_invoice"
  | "hospital_payment"
  | "hospital_refund"
  | "hospital_insurance_check"
  | "hospital_pre_authorisation"
  | "hospital_insurance_claim"
  | "emergency_intake"
  | "hospital_supplier"
  | "hospital_purchase_order"
  | "hospital_asset"
  | "hospital_asset_maintenance"
  | "patient_feedback"
  | "complaint"
  // Patient care and wellness (Phase 10). These rows are owned by a person, not
  // by a hospital, so they carry no `hospitalId`; the caregiver access row and
  // the record entry are the two that a person is most likely to want to
  // reconstruct.
  | "caregiver_access"
  | "health_document"
  | "health_timeline_event"
  | "allergy_record"
  | "immunization_record"
  | "medical_history_item"
  | "care_reminder"
  | "care_reminder_preference"
  | "care_reminder_dispatch"
  | "preventive_care_plan"
  | "care_program_enrollment"
  | "medication_schedule"
  | "medication_dose_log"
  | "wellness_entry"
  | "wellness_goal"
  | "health_device_connection"
  | "health_device_sync_record"
  | "care_service_listing"
  | "care_service_request"
  | "mental_wellness_resource"
  | "health_education_resource"
  | "service_feedback"
  | "support_ticket"
  | "support_ticket_message"
  // Platform administration (Phase 11). These rows are platform-level, so they
  // carry no `hospitalId`; the acting operator is in `actorUserId`.
  | "platform_staff_member"
  | "platform_setting"
  | "feature_flag"
  | "integration_alert"
  | "retention_policy"
  | "account_deletion_request"
  | "report_export"
  | "operational_metric"
  | "abuse_report"
  | "system";

export type AuditInput = {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  outcome?: AuditOutcome;
  actorUserId?: string | null;
  actorLabel?: string | null;
  /**
   * The hospital this event belongs to, when the event happened inside a
   * hospital workspace. Resolved from the caller's `HospitalMember` row, never
   * from the request. Null for platform-level events.
   */
  hospitalId?: string | null;
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
        hospitalId: input.hospitalId ?? null,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record event", input.action, error);
  }
}

/**
 * A row as the security console reads it.
 *
 * `ipAddress` and `userAgent` are included because "which session did this" is
 * the question an audit reader actually asks, and both are already stored on the
 * row. `metadata` is whatever the writer put there — by contract, identifiers,
 * outcomes and safe summaries only, never a request body or a secret.
 */
export type AuditEventView = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: AuditOutcome;
  actorUserId: string | null;
  actorLabel: string | null;
  hospitalId: string | null;
  ipAddress: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type AuditEventQuery = {
  action?: string;
  entityType?: string;
  actorUserId?: string;
  hospitalId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

/**
 * Reads the audit trail, newest first.
 *
 * The audit log is append-only and this is a read, so there is nothing to
 * enforce beyond the filter and the page ceiling. The caller's own access to
 * this queue is what gets audited — by `requirePlatformRoute` — not each row.
 */
export async function listAuditEvents(
  input: AuditEventQuery = {},
): Promise<{ items: AuditEventView[]; total: number }> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(Math.max(1, input.pageSize ?? 25), 100);

  const where: Prisma.AuditEventWhereInput = {
    ...(input.action ? { action: input.action } : {}),
    ...(input.entityType ? { entityType: input.entityType } : {}),
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(input.hospitalId ? { hospitalId: input.hospitalId } : {}),
    ...(input.from || input.to
      ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      outcome: row.outcome,
      actorUserId: row.actorUserId,
      actorLabel: row.actorLabel,
      hospitalId: row.hospitalId,
      ipAddress: row.ipAddress,
      metadata: row.metadata,
      createdAt: row.createdAt,
    })),
    total,
  };
}

/** Retention window for the audit log: 24 months, then rows are purged. */
export const AUDIT_RETENTION_MONTHS = 24;

export async function purgeAuditEventsOlderThanRetention() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - AUDIT_RETENTION_MONTHS);
  const result = await prisma.auditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}
