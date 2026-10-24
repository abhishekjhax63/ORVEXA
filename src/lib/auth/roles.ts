import type { HospitalStaffRole, PlatformStaffRole, Role } from "@prisma/client";

/**
 * Role and permission vocabulary.
 *
 * This module is safe to import from Client Components: the Prisma import is
 * type-only, so no database code reaches the browser bundle. Server-side
 * enforcement lives in `src/lib/auth/guards.ts`, which is the only place a
 * request is authorised.
 */

export type AppRole = Role;

export const APP_ROLES = [
  "PATIENT",
  "DOCTOR",
  "HOSPITAL_ADMIN",
  "PHARMACY_PARTNER",
  "LAB_PARTNER",
  "AMBULANCE_PARTNER",
  "INSURANCE_PARTNER",
  "PLATFORM_ADMIN",
] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<AppRole, string> = {
  PATIENT: "Patient",
  DOCTOR: "Doctor",
  HOSPITAL_ADMIN: "Hospital administrator",
  PHARMACY_PARTNER: "Pharmacy partner",
  LAB_PARTNER: "Laboratory partner",
  AMBULANCE_PARTNER: "Ambulance partner",
  INSURANCE_PARTNER: "Insurance partner",
  PLATFORM_ADMIN: "Platform administrator",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  PATIENT: "Book appointments, manage your health records and family profiles.",
  DOCTOR: "Publish your practice, manage schedules and see your appointments.",
  HOSPITAL_ADMIN: "Maintain your facility listing, services and doctor affiliations.",
  PHARMACY_PARTNER: "Fulfil prescriptions and manage medicine delivery zones.",
  LAB_PARTNER: "Receive diagnostic orders and publish collected reports.",
  AMBULANCE_PARTNER: "Accept emergency dispatch requests in your coverage area.",
  INSURANCE_PARTNER: "Review coverage, claims and network participation.",
  PLATFORM_ADMIN: "Verify providers, review partner applications and audit activity.",
};

/** Roles that a signed-up user can never assign to themselves. */
export const PRIVILEGED_ROLES = APP_ROLES.filter((role) => role !== "PATIENT");

export type Permission =
  // Patient area
  | "dashboard.access"
  | "profile.manage_own"
  | "family.manage_own"
  | "consent.manage_own"
  | "appointment.book_own"
  | "appointment.read_own"
  | "appointment.cancel_own"
  // Emergency. Raising an incident and managing your own contacts is available to
  // every signed-in account, because anybody can be the person who witnesses an
  // emergency — a receptionist at a hospital is as likely to need SOS as a patient.
  | "emergency.raise"
  | "emergency.contacts_manage"
  // AI health assistant. Asking the assistant about your own symptoms, and
  // exporting the result to a clinician of your choosing, is available to every
  // signed-in account for the same reason as emergency access: the person
  // describing a symptom may be describing a family member's, and a permission
  // model that gates health information behind a healthcare role would leave
  // most of the people who need it unable to use it.
  | "ai.assess"
  | "ai.export"
  // Reviewing a preliminary assessment before it is shared more widely is a
  // clinical act, so it is gated on a clinical role.
  | "ai.clinical_review"
  // Provider area
  | "provider.portal_access"
  | "provider.profile_manage"
  | "provider.schedule_manage"
  | "provider.appointment_read"
  | "provider.appointment_decide"
  | "provider.change_request_submit"
  | "hospital.manage"
  // Phase 7 — the hospital's insurance desk. Held by a hospital administrator
  // rather than every member, because raising a pre-authorisation and recording
  // a settlement moves money and a claim record.
  | "hospital.insurance_manage"
  // Onboarding
  | "onboarding.apply"
  // Phase 6 — pharmacy, as a customer. Ordering your own medicines is available
  // to any signed-in account for the same reason SOS and the assistant are: the
  // person ordering is frequently ordering for a family member, and a permission
  // model that gated it behind a healthcare role would lock most people out.
  | "pharmacy.order_own"
  // Phase 6 — pharmacy, as a partner.
  | "pharmacy.portal_access"
  | "pharmacy.inventory_manage"
  | "pharmacy.order_fulfil"
  | "pharmacy.prescription_review"
  | "pharmacy.refund_process"
  | "pharmacy.report_read"
  // Phase 7 — insurance, as a policyholder.
  | "insurance.manage_own"
  // Phase 7 — insurance, as an insurer's reviewer.
  | "insurer.portal_access"
  | "insurer.review_queue"
  | "insurer.record_decision"
  | "insurer.manage_products"
  | "insurer.manage_network"
  // Phase 8 — diagnostics, as a customer. Booking a test is a consumer act, for
  // the same reason ordering a medicine is: the person booking is frequently
  // booking for a parent, and the result is that person's own health record.
  | "diagnostics.book_own"
  | "diagnostics.read_own"
  | "diagnostics.report_share_own"
  // Phase 8 — diagnostics, as a laboratory partner.
  | "lab.portal_access"
  | "lab.offer_manage"
  | "lab.booking_manage"
  | "lab.report_publish"
  // Phase 8 — the diagnostics catalogue is a platform-verified list, like the
  // medicine catalogue: a partner prices it, but only the platform defines it.
  | "diagnostics.catalogue_manage"
  // Phase 8 — telemedicine, as a patient.
  | "telemedicine.book_own"
  | "telemedicine.read_own"
  // Phase 8 — telemedicine, as a clinician. Writing a clinical note and issuing
  // a prescription are the two acts that make a consultation a medical event, so
  // they are separated from merely hosting the call.
  | "provider.teleconsult_manage"
  | "telemedicine.session_host"
  | "telemedicine.chat"
  | "consultation.notes_write"
  | "consultation.prescribe"
  // Phase 9 — the hospital workspace.
  //
  // These are tenant-scoped: holding `hospital.records_read` means "may read
  // clinical records inside the hospital I am a member of", never "may read any
  // hospital's records". `requireHospitalMembership()` resolves the hospital
  // from the caller's `HospitalMember` row and every query is scoped by it.
  //
  // The split below follows what a desk actually does, so a hospital can give a
  // receptionist the front desk without also handing over the pharmacy till.
  //
  // Entering a clinical fact (`records_write`, `prescribe`, `lab_verify`) is
  // separated from administering the hospital, because a hospital administrator
  // is not automatically a clinician. Recording a result is separated from
  // verifying it, because a result that nobody independent has checked is not a
  // released result.
  | "hospital.portal_access"
  | "hospital.dashboard_read"
  | "hospital.staff_manage"
  | "hospital.audit_read"
  | "hospital.patient_manage"
  | "hospital.records_read"
  | "hospital.records_write"
  | "hospital.prescribe"
  | "hospital.opd_manage"
  | "hospital.ipd_manage"
  | "hospital.lab_manage"
  | "hospital.lab_verify"
  | "hospital.imaging_manage"
  | "hospital.pharmacy_manage"
  | "hospital.dispense"
  | "hospital.billing_manage"
  | "hospital.charges_manage"
  | "hospital.claims_manage"
  | "hospital.emergency_manage"
  | "hospital.assets_manage"
  | "hospital.procurement_manage"
  | "hospital.feedback_manage"
  // Phase 10 — personal health, family care and wellness.
  //
  // The `care.*_own` family is the person's own health workspace. It is granted
  // to every role, for the same reason `pharmacy.order_own` is: a nurse tracking
  // her own blood pressure and a pharmacist logging her father's doses are using
  // the product as people, not as staff.
  //
  // Note what is deliberately NOT here: there is no `care.caregiver_read` or
  // "care.caregiver_act`. Caregiver access is not a role permission at all — it
  // is a per-relationship row (`CaregiverAccess`) with an explicit `scopes`
  // array, enforced by `src/lib/care/access.ts`. A role-based caregiver
  // permission would make every caregiver on the platform equally powerful,
  // which is exactly the model the spec rules out.
  //
  // The `care.service_*`, `care.support_manage` and `care.content_manage`
  // permissions are the professional side: running a physiotherapy or home
  // nursing listing, answering care requests and the grievance queue, and
  // curating the mental-wellness and health-education library.
  | "care.workspace_access"
  | "care.profile_manage_own"
  | "care.family_manage_own"
  | "care.caregiver_manage_own"
  | "care.records_manage_own"
  | "care.documents_manage_own"
  | "care.reminders_manage_own"
  | "care.medications_manage_own"
  | "care.wellness_manage_own"
  | "care.devices_manage_own"
  | "care.services_request_own"
  | "care.feedback_own"
  | "care.service_listing_manage"
  | "care.service_request_manage"
  | "care.support_manage"
  | "care.content_manage"
  // Platform administration
  | "verification.review"
  | "partner_application.review"
  | "insurer.manage"
  | "role.grant"
  | "audit.read"
  | "user.administer"
  // Phase 11 — the platform operations console.
  //
  // These are the workspaces of the platform's own staff, and each one is a
  // separate grant rather than a slice of one "admin" switch. `platform.console_access`
  // only opens the console shell; every queue, setting and export behind it is
  // gated on its own permission, so an account that works the hospital
  // verification queue cannot read the audit trail, work a refund or toggle a
  // feature flag.
  //
  // The permission is what is checked. Which account holds which of these is a
  // `PlatformStaffMember` row (see `PLATFORM_STAFF_ROLE_PERMISSIONS` below),
  // resolved from the database on every request like a hospital membership.
  | "platform.console_access"
  // Verification workspaces, one per subject so a reviewer's grant says what it
  // reviews. Diagnosing a hospital's registration papers and approving a
  // pharmacy's drug licence are different judgements.
  | "platform.verify_hospital"
  | "platform.verify_doctor"
  | "platform.verify_pharmacy"
  | "platform.verify_laboratory"
  | "platform.verify_ambulance"
  | "platform.verify_insurer"
  // Support and grievance work.
  | "platform.support_queue"
  | "platform.grievance_manage"
  // Money oversight. Separated from the support queue because refunding an order
  // moves money back to a customer, which is a finance act rather than a
  // customer-service one.
  | "platform.refund_oversight"
  // Emergency operations. Only meaningful where an approved operating model
  // exists; the console says so plainly when none is configured.
  | "platform.emergency_operations"
  // Platform configuration: service categories, feature flags, regions,
  // notification templates.
  | "platform.configuration_manage"
  // Reading the aggregate dashboards, and taking data out of them. Exporting is
  // separated from reading because an export leaves the platform.
  | "platform.analytics_read"
  | "platform.export_reports"
  // Security operations: the alert queue, the tenant-isolation review and the
  // audit trail.
  | "platform.security_operations"
  | "platform.retention_manage"
  | "platform.account_deletion_manage"
  // Granting and revoking platform staff roles.
  | "platform.staff_manage";

const PATIENT_PERMISSIONS: Permission[] = [
  "dashboard.access",
  "profile.manage_own",
  "family.manage_own",
  "consent.manage_own",
  "appointment.book_own",
  "appointment.read_own",
  "appointment.cancel_own",
];

/**
 * Phase 10 — the personal health workspace, granted to every role.
 *
 * `care.workspace_access` only opens the workspace shell. Each of the remaining
 * permissions is a distinct capability so that a person can be given, say, the
 * wellness tracker without the document vault, and so that a caregiver's scoped
 * access can be mapped onto the same vocabulary (see `src/lib/care/access.ts`,
 * which maps `CaregiverScope` onto these).
 */
const CARE_SELF_SERVICE_PERMISSIONS: Permission[] = [
  "care.workspace_access",
  "care.profile_manage_own",
  "care.family_manage_own",
  "care.caregiver_manage_own",
  "care.records_manage_own",
  "care.documents_manage_own",
  "care.reminders_manage_own",
  "care.medications_manage_own",
  "care.wellness_manage_own",
  "care.devices_manage_own",
  "care.services_request_own",
  "care.feedback_own",
];

/**
 * Granted to every role, without exception, like emergency and assistant access.
 *
 * Ordering your own medicines and holding your own insurance policy are consumer
 * acts, not professional ones. A doctor is also a person with a parent whose
 * prescription they manage, and a pharmacy partner is also a patient; gating these
 * behind a "patient" role would mean the platform stops working for the very
 * people who spend their day inside it.
 */
const SELF_SERVICE_PERMISSIONS: Permission[] = [
  "pharmacy.order_own",
  "insurance.manage_own",
  "diagnostics.book_own",
  "diagnostics.read_own",
  "diagnostics.report_share_own",
  "telemedicine.book_own",
  "telemedicine.read_own",
  ...CARE_SELF_SERVICE_PERMISSIONS,
];

/**
 * Phase 10 — the professional side of the care ecosystem.
 *
 * There is no doctor-only permission here, because writing a *patient's* care
 * record still goes through the hospital or consultation permissions that
 * already exist; these four only cover listings, care requests, the grievance
 * queue and the resource library.
 *
 * `care.content_manage` is separated from `care.support_manage` because
 * publishing health education in a language a person reads is a content
 * function, while answering their complaint is an operational one, and the
 * platform should not have to hand over one to get the other.
 */
const CARE_SERVICE_LISTING_PERMISSIONS: Permission[] = ["care.service_listing_manage"];
const CARE_SERVICE_REQUEST_PERMISSIONS: Permission[] = ["care.service_request_manage"];
const CARE_SUPPORT_PERMISSIONS: Permission[] = ["care.support_manage"];
const CARE_CONTENT_PERMISSIONS: Permission[] = ["care.content_manage"];

/**
 * Granted to every role, without exception.
 *
 * Emergency access is deliberately not gated on a healthcare role: the person
 * raising an incident is often a bystander or a staff member who is not the
 * patient, and a permission model that can lock somebody out of SOS is a
 * safety defect rather than a security control.
 */
const EMERGENCY_PERMISSIONS: Permission[] = ["emergency.raise", "emergency.contacts_manage"];

/**
 * Granted to every role, without exception: see the note on `ai.assess` above.
 *
 * `ai.clinical_review` is deliberately not here. It is added only to the roles
 * that carry a clinical duty, because agreeing with or raising an assessment is
 * a judgement a reviewer is accountable for.
 */
const AI_PERMISSIONS: Permission[] = ["ai.assess", "ai.export"];

const CLINICAL_REVIEW_PERMISSIONS: Permission[] = ["ai.clinical_review"];

/**
 * Phase 9 — the two permissions every member of a hospital workspace holds.
 *
 * Everything else in the `hospital.*` family is granted by the staff role the
 * person holds *inside that hospital* (`HospitalMember.staffRole`). The
 * platform-wide `Role` decides which console a person lands in; the staff role
 * decides what they may do once they are there.
 */
const HOSPITAL_WORKSPACE_BASE: Permission[] = ["hospital.portal_access", "hospital.dashboard_read"];

/**
 * What running a hospital involves: staffing, wards, billing, procurement,
 * complaints — and read access to the record, because running the place without
 * being able to look anything up is not workable.
 *
 * Deliberately absent: `hospital.records_write`, `hospital.prescribe` and
 * `hospital.lab_verify`. A hospital administrator is not automatically a
 * clinician, and the platform must not treat "administers the hospital" as
 * "may author a clinical fact".
 */
const HOSPITAL_ADMIN_PERMISSIONS: Permission[] = [
  ...HOSPITAL_WORKSPACE_BASE,
  "hospital.staff_manage",
  "hospital.audit_read",
  "hospital.patient_manage",
  "hospital.records_read",
  "hospital.opd_manage",
  "hospital.ipd_manage",
  "hospital.lab_manage",
  "hospital.imaging_manage",
  "hospital.pharmacy_manage",
  "hospital.billing_manage",
  "hospital.charges_manage",
  "hospital.claims_manage",
  "hospital.emergency_manage",
  "hospital.assets_manage",
  "hospital.procurement_manage",
  "hospital.feedback_manage",
];

/**
 * What practising inside a hospital involves: writing the record, ordering
 * tests and referring for imaging, and issuing a prescription.
 *
 * `hospital.charges_manage` is absent — a clinician sets the clinical plan, not
 * the price list.
 */
const HOSPITAL_DOCTOR_PERMISSIONS: Permission[] = [
  ...HOSPITAL_WORKSPACE_BASE,
  "hospital.records_read",
  "hospital.records_write",
  "hospital.prescribe",
  "hospital.opd_manage",
  "hospital.ipd_manage",
  "hospital.lab_manage",
  "hospital.imaging_manage",
];

/**
 * Granular permissions for each staff role inside a hospital.
 *
 * This map — not the platform `Role` — is what a hospital tenant actually grants.
 * The union of the platform role's permissions and this map's permissions is
 * what `requireHospitalMembership()` checks against, always scoped to the one
 * hospital the membership names.
 *
 * `LAB_STAFF` holds `hospital.lab_verify`, but the laboratory service additionally
 * refuses to let the person who entered a result be the person who verifies it,
 * so separation of duties is enforced on the row rather than by role alone.
 */
export const HOSPITAL_STAFF_ROLE_PERMISSIONS: Record<HospitalStaffRole, Permission[]> = {
  HOSPITAL_ADMIN: HOSPITAL_ADMIN_PERMISSIONS,
  DOCTOR: HOSPITAL_DOCTOR_PERMISSIONS,
  NURSE: [
    ...HOSPITAL_WORKSPACE_BASE,
    "hospital.records_read",
    // A nurse records observations, vitals and nursing notes. The record-entry
    // service refuses a nurse-entered prescription or a final diagnosis, so the
    // broad permission does not become a broad power.
    "hospital.records_write",
    "hospital.ipd_manage",
    "hospital.lab_manage",
  ],
  RECEPTIONIST: [
    ...HOSPITAL_WORKSPACE_BASE,
    "hospital.patient_manage",
    "hospital.opd_manage",
    "hospital.ipd_manage",
    "hospital.billing_manage",
  ],
  PHARMACIST: [
    ...HOSPITAL_WORKSPACE_BASE,
    // Read access only, so the pharmacist can see the prescription being
    // dispensed against without opening the rest of the chart.
    "hospital.records_read",
    "hospital.pharmacy_manage",
    "hospital.dispense",
  ],
  LAB_STAFF: [...HOSPITAL_WORKSPACE_BASE, "hospital.records_read", "hospital.lab_manage", "hospital.lab_verify"],
  IMAGING_TECHNICIAN: [...HOSPITAL_WORKSPACE_BASE, "hospital.records_read", "hospital.imaging_manage"],
  BILLING_STAFF: [
    ...HOSPITAL_WORKSPACE_BASE,
    "hospital.patient_manage",
    "hospital.billing_manage",
    "hospital.charges_manage",
    "hospital.claims_manage",
  ],
  WARD_COORDINATOR: [...HOSPITAL_WORKSPACE_BASE, "hospital.records_read", "hospital.ipd_manage"],
  EMERGENCY_STAFF: [
    ...HOSPITAL_WORKSPACE_BASE,
    "hospital.patient_manage",
    "hospital.opd_manage",
    "hospital.ipd_manage",
    "hospital.records_read",
    "hospital.emergency_manage",
  ],
};

export const HOSPITAL_STAFF_ROLE_LABELS: Record<HospitalStaffRole, string> = {
  HOSPITAL_ADMIN: "Hospital administrator",
  DOCTOR: "Doctor",
  NURSE: "Nurse",
  RECEPTIONIST: "Receptionist",
  PHARMACIST: "Pharmacist",
  LAB_STAFF: "Laboratory staff",
  IMAGING_TECHNICIAN: "Imaging technician",
  BILLING_STAFF: "Billing staff",
  WARD_COORDINATOR: "Ward coordinator",
  EMERGENCY_STAFF: "Emergency staff",
};

/**
 * The permissions a set of in-hospital staff roles confers.
 *
 * Note this is *scoped*: it answers "what may this person do inside the hospital
 * they are a member of", not "what may they do anywhere". Callers must still
 * scope their queries by the hospitalId of the membership that granted it.
 */
export function hospitalStaffPermissionsForRoles(staffRoles: readonly HospitalStaffRole[]): Set<Permission> {
  const granted = new Set<Permission>();
  for (const role of staffRoles) {
    for (const permission of HOSPITAL_STAFF_ROLE_PERMISSIONS[role] ?? []) granted.add(permission);
  }
  return granted;
}

// ---------------------------------------------------------------------------
// Phase 11 — platform operations staff.
//
// The same shape as the hospital staff roles above, one level up: the platform
// `Role` decides whether an account is an administrator *identity*, and a
// `PlatformStaffMember` row decides which queues that account actually works.
//
// Every operational role opens the console shell and nothing else, and each
// queue is added deliberately. A verification reviewer holds no `audit.read`, no
// `platform.refund_oversight` and no `platform.configuration_manage` — the three
// powers that would let a mistake in a verification queue reach money, privacy
// or the running configuration.
// ---------------------------------------------------------------------------

export const PLATFORM_ROLE_PERMISSIONS: Permission[] = [
  "platform.console_access",
  "platform.verify_hospital",
  "platform.verify_doctor",
  "platform.verify_pharmacy",
  "platform.verify_laboratory",
  "platform.verify_ambulance",
  "platform.verify_insurer",
  "platform.support_queue",
  "platform.grievance_manage",
  "platform.refund_oversight",
  "platform.emergency_operations",
  "platform.configuration_manage",
  "platform.analytics_read",
  "platform.export_reports",
  "platform.security_operations",
  "platform.retention_manage",
  "platform.account_deletion_manage",
  "platform.staff_manage",
];

/**
 * The permissions each platform staff role confers.
 *
 * `SECURITY_ANALYST` deliberately does not hold `platform.account_deletion_manage`:
 * erasing an account is an operational act with a customer on the other end, not
 * a security one, and the analyst who investigates an incident should not also
 * be the person who can destroy the evidence.
 */
export const PLATFORM_STAFF_ROLE_PERMISSIONS: Record<PlatformStaffRole, Permission[]> = {
  PLATFORM_ADMIN: [
    ...PLATFORM_ROLE_PERMISSIONS,
    // The full administrator also keeps the Phase 1–10 governance permissions,
    // which the pre-Phase-11 console and its route handlers already check.
    "verification.review",
    "partner_application.review",
    "insurer.manage",
    "diagnostics.catalogue_manage",
    "role.grant",
    "audit.read",
    "user.administer",
  ],
  VERIFICATION_HOSPITAL: ["platform.console_access", "platform.verify_hospital", "verification.review"],
  VERIFICATION_DOCTOR: ["platform.console_access", "platform.verify_doctor", "verification.review"],
  VERIFICATION_PHARMACY: ["platform.console_access", "platform.verify_pharmacy", "partner_application.review"],
  VERIFICATION_LABORATORY: ["platform.console_access", "platform.verify_laboratory", "verification.review"],
  VERIFICATION_AMBULANCE: ["platform.console_access", "platform.verify_ambulance", "partner_application.review"],
  VERIFICATION_INSURER: ["platform.console_access", "platform.verify_insurer", "insurer.manage"],
  SUPPORT_AGENT: [
    "platform.console_access",
    "platform.support_queue",
    "platform.grievance_manage",
    // The Phase 10 support queue is guarded by this permission, and the platform
    // support desk is its intended holder.
    "care.support_manage",
  ],
  EMERGENCY_OPERATOR: ["platform.console_access", "platform.emergency_operations"],
  SECURITY_ANALYST: [
    "platform.console_access",
    "platform.security_operations",
    "platform.analytics_read",
    "platform.retention_manage",
    "audit.read",
  ],
};

export const PLATFORM_STAFF_ROLE_LABELS: Record<PlatformStaffRole, string> = {
  PLATFORM_ADMIN: "Platform administrator",
  VERIFICATION_HOSPITAL: "Hospital verification",
  VERIFICATION_DOCTOR: "Doctor verification",
  VERIFICATION_PHARMACY: "Pharmacy verification",
  VERIFICATION_LABORATORY: "Laboratory verification",
  VERIFICATION_AMBULANCE: "Ambulance verification",
  VERIFICATION_INSURER: "Insurer verification",
  SUPPORT_AGENT: "Customer support",
  EMERGENCY_OPERATOR: "Emergency operations",
  SECURITY_ANALYST: "Security analyst",
};

export const PLATFORM_STAFF_ROLE_DESCRIPTIONS: Record<PlatformStaffRole, string> = {
  PLATFORM_ADMIN: "Every workspace, including configuration, exports and staff grants.",
  VERIFICATION_HOSPITAL: "Review hospital registrations and facility claims.",
  VERIFICATION_DOCTOR: "Review clinician credentials and practice details.",
  VERIFICATION_PHARMACY: "Review pharmacy applications and drug licences.",
  VERIFICATION_LABORATORY: "Review laboratory accreditation and report-signing authority.",
  VERIFICATION_AMBULANCE: "Review ambulance partner applications and coverage areas.",
  VERIFICATION_INSURER: "Review insurer credentials, products and network claims.",
  SUPPORT_AGENT: "Work support tickets, grievances and general complaints.",
  EMERGENCY_OPERATOR: "Monitor SOS delivery acknowledgements and failed dispatch integrations.",
  SECURITY_ANALYST: "Work the alert queue, review tenant isolation and manage retention.",
};

/**
 * The permissions a set of platform staff roles confers.
 *
 * Scoped like the hospital equivalent: it answers "what may this reviewer do in
 * the platform operations console", not "what may they do anywhere".
 */
export function platformStaffPermissionsForRoles(staffRoles: readonly PlatformStaffRole[]): Set<Permission> {
  const granted = new Set<Permission>();
  for (const role of staffRoles) {
    for (const permission of PLATFORM_STAFF_ROLE_PERMISSIONS[role] ?? []) granted.add(permission);
  }
  return granted;
}

/**
 * Escalation guard for every code path that writes a `PlatformStaffMember` row.
 *
 * Mirrors `canGrantRole`: only a holder of `platform.staff_manage` may grant,
 * nobody may grant themselves a platform staff role (which would be a way to
 * give oneself `platform.staff_manage` in the first place), and the grant must
 * name its target.
 */
export function canGrantPlatformStaffRole(input: {
  actorUserId: string;
  targetUserId: string;
  actorPermissions: readonly Permission[];
}): { allowed: true } | { allowed: false; reason: string } {
  if (!input.actorPermissions.includes("platform.staff_manage")) {
    return { allowed: false, reason: "Only a platform administrator can grant operations roles." };
  }
  if (input.actorUserId === input.targetUserId) {
    return { allowed: false, reason: "You cannot grant an operations role to your own account." };
  }
  return { allowed: true };
}


const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  PATIENT: [...PATIENT_PERMISSIONS, ...EMERGENCY_PERMISSIONS, ...AI_PERMISSIONS, ...SELF_SERVICE_PERMISSIONS],
  DOCTOR: [
    "dashboard.access",
    "profile.manage_own",
    "consent.manage_own",
    "provider.portal_access",
    "provider.profile_manage",
    "provider.schedule_manage",
    "provider.appointment_read",
    "provider.appointment_decide",
    "provider.change_request_submit",
    "provider.teleconsult_manage",
    "telemedicine.session_host",
    "telemedicine.chat",
    "consultation.notes_write",
    "consultation.prescribe",
    ...HOSPITAL_DOCTOR_PERMISSIONS,
    ...CARE_SERVICE_LISTING_PERMISSIONS,
    ...CARE_SERVICE_REQUEST_PERMISSIONS,
    ...EMERGENCY_PERMISSIONS,
    ...AI_PERMISSIONS,
    ...SELF_SERVICE_PERMISSIONS,
    ...CLINICAL_REVIEW_PERMISSIONS,
  ],
  HOSPITAL_ADMIN: [
    "dashboard.access",
    "profile.manage_own",
    "consent.manage_own",
    "provider.portal_access",
    "hospital.manage",
    "hospital.insurance_manage",
    "provider.profile_manage",
    "provider.schedule_manage",
    "provider.appointment_read",
    "provider.change_request_submit",
    "provider.teleconsult_manage",
    ...HOSPITAL_ADMIN_PERMISSIONS,
    ...CARE_SERVICE_LISTING_PERMISSIONS,
    ...CARE_SERVICE_REQUEST_PERMISSIONS,
    ...CARE_SUPPORT_PERMISSIONS,
    ...EMERGENCY_PERMISSIONS,
    ...AI_PERMISSIONS,
    ...SELF_SERVICE_PERMISSIONS,
  ],
  PHARMACY_PARTNER: [
    "dashboard.access",
    "profile.manage_own",
    "consent.manage_own",
    "onboarding.apply",
    "pharmacy.portal_access",
    "pharmacy.inventory_manage",
    "pharmacy.order_fulfil",
    "pharmacy.prescription_review",
    "pharmacy.refund_process",
    "pharmacy.report_read",
    ...EMERGENCY_PERMISSIONS,
    ...AI_PERMISSIONS,
    ...SELF_SERVICE_PERMISSIONS,
  ],
  LAB_PARTNER: [
    "dashboard.access",
    "profile.manage_own",
    "consent.manage_own",
    "onboarding.apply",
    "lab.portal_access",
    "lab.offer_manage",
    "lab.booking_manage",
    // Publishing a report is withheld by default. A platform administrator grants
    // it once the laboratory's accreditation and signing pathologist have been
    // checked, because this is the permission that can put a result in front of
    // a patient.
    ...EMERGENCY_PERMISSIONS,
    ...AI_PERMISSIONS,
    ...SELF_SERVICE_PERMISSIONS,
  ],
  AMBULANCE_PARTNER: [
    "dashboard.access",
    "profile.manage_own",
    "consent.manage_own",
    "onboarding.apply",
    ...EMERGENCY_PERMISSIONS,
    ...AI_PERMISSIONS,
    ...SELF_SERVICE_PERMISSIONS,
  ],
  INSURANCE_PARTNER: [
    "dashboard.access",
    "profile.manage_own",
    "consent.manage_own",
    "onboarding.apply",
    "insurer.portal_access",
    "insurer.review_queue",
    // Recording a decision and editing an insurer's published product or network
    // data are withheld by default. A platform administrator grants them once the
    // partner's credentials and authority have been checked, because these are the
    // two powers that can mislead a patient about what their policy will pay.
    ...EMERGENCY_PERMISSIONS,
    ...AI_PERMISSIONS,
    ...SELF_SERVICE_PERMISSIONS,
  ],
  PLATFORM_ADMIN: [
    "dashboard.access",
    "profile.manage_own",
    "consent.manage_own",
    "verification.review",
    "partner_application.review",
    "insurer.manage",
    "diagnostics.catalogue_manage",
    "role.grant",
    "audit.read",
    "user.administer",
    // Platform operations curate the care service directory, work the
    // grievance queue and own the mental-wellness and education library,
    // including the crisis resources that must remain reachable.
    ...CARE_SERVICE_LISTING_PERMISSIONS,
    ...CARE_SERVICE_REQUEST_PERMISSIONS,
    ...CARE_SUPPORT_PERMISSIONS,
    ...CARE_CONTENT_PERMISSIONS,
    ...EMERGENCY_PERMISSIONS,
    ...AI_PERMISSIONS,
    ...SELF_SERVICE_PERMISSIONS,
    ...CLINICAL_REVIEW_PERMISSIONS,
  ],
};

export const PERMISSIONS = Array.from(
  new Set([...PATIENT_PERMISSIONS, ...Object.values(ROLE_PERMISSIONS).flat()]),
).sort() as Permission[];

export function permissionsForRoles(roles: readonly AppRole[]): Set<Permission> {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) granted.add(permission);
  }
  return granted;
}

export function roleHasPermission(role: AppRole, permission: Permission) {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

/**
 * Role escalation guard used by every code path that writes a UserRole row.
 *
 * - Only a platform administrator can hand out roles.
 * - Nobody may grant themselves a role, whatever they already hold.
 * - A grant must name the target user explicitly; there is no "default" role.
 */
export function canGrantRole(input: {
  actorUserId: string;
  actorRoles: readonly AppRole[];
  targetUserId: string;
  roleToGrant: AppRole;
}): { allowed: true } | { allowed: false; reason: string } {
  if (input.actorUserId === input.targetUserId) {
    return { allowed: false, reason: "You cannot grant a role to your own account." };
  }
  if (!input.actorRoles.includes("PLATFORM_ADMIN")) {
    return { allowed: false, reason: "Only a platform administrator can grant roles." };
  }
  if (!APP_ROLES.includes(input.roleToGrant)) {
    return { allowed: false, reason: "Unknown role." };
  }
  return { allowed: true };
}

/** Role that decides where a signed-in user lands and which nav they see. */
export function primaryRole(roles: readonly AppRole[]): AppRole {
  const priority: AppRole[] = [
    "PLATFORM_ADMIN",
    "HOSPITAL_ADMIN",
    "DOCTOR",
    "PHARMACY_PARTNER",
    "LAB_PARTNER",
    "AMBULANCE_PARTNER",
    "INSURANCE_PARTNER",
    "PATIENT",
  ];
  return priority.find((role) => roles.includes(role)) ?? "PATIENT";
}

export type NavItem = { title: string; href: string; description?: string; icon: NavIconName };

export type NavIconName =
  | "layout-dashboard"
  | "calendar-check"
  | "folder-heart"
  | "users"
  | "settings"
  | "building-2"
  | "clipboard-list"
  | "clipboard-check"
  | "clock"
  | "stethoscope"
  | "shield-check"
  | "badge-check"
  | "scroll-text"
  | "siren"
  | "activity"
  | "sparkles"
  | "pill"
  | "package"
  | "truck"
  | "receipt"
  | "file-text"
  | "shield-plus"
  | "hand-heart"
  | "chart-column"
  | "flask-conical"
  | "microscope"
  | "video"
  | "message-square"
  | "clipboard-plus"
  // Phase 9 — hospital workspace.
  | "bed-double"
  | "user-plus"
  | "heart-pulse"
  | "wallet"
  | "box"
  | "scan-line"
  | "megaphone"
  | "list-ordered"
  | "building"
  // Phase 10 — patient care and wellness.
  | "watch"
  | "life-buoy"
  | "book-open"
  // Phase 11 — the platform operations console.
  | "user-check"
  | "shield-alert"
  | "sliders-horizontal"
  | "bar-chart-3"
  | "download"
  | "flag"
  | "radio"
  | "map-pin"
  | "bell-ring"
  | "database"
  | "trash-2"
  | "gauge"
  | "ticket"
  | "server-cog"
  | "arrow-left-right"
  | "scale"
  | "lock"
  | "shield-x"
  | "undo-2"
  | "ban"
  | "key-round"
  | "trending-up"
  | "file-warning"
  | "circle-alert"
  | "send";

export type NavSection = { title: string; items: NavItem[] };

const PATIENT_NAV: NavSection[] = [
  {
    title: "Care",
    items: [
      { title: "Overview", href: "/dashboard", icon: "layout-dashboard" },
      { title: "Appointments", href: "/dashboard/appointments", icon: "calendar-check" },
      { title: "Health records", href: "/dashboard/records", icon: "folder-heart" },
      { title: "Find care", href: "/hospitals", icon: "stethoscope" },
    ],
  },
  {
    title: "Diagnostics",
    items: [
      {
        title: "Find a test",
        href: "/diagnostics",
        icon: "flask-conical",
        description: "Search verified laboratories, compare prices and book",
      },
      { title: "My test bookings", href: "/dashboard/diagnostics", icon: "clipboard-plus" },
      { title: "My lab reports", href: "/dashboard/diagnostics/reports", icon: "microscope" },
    ],
  },
  {
    title: "Virtual care",
    items: [
      {
        title: "Consult a doctor online",
        href: "/telemedicine",
        icon: "video",
        description: "Book a secure video consultation",
      },
      { title: "My consultations", href: "/dashboard/consultations", icon: "message-square" },
    ],
  },
  {
    title: "Medicines",
    items: [
      {
        title: "Pharmacy store",
        href: "/pharmacy",
        icon: "pill",
        description: "Search medicines and order with a prescription",
      },
      { title: "My orders", href: "/dashboard/orders", icon: "package" },
      { title: "Prescriptions", href: "/dashboard/prescriptions", icon: "file-text" },
      { title: "Delivery addresses", href: "/dashboard/addresses", icon: "truck" },
    ],
  },
  {
    title: "Insurance",
    items: [
      { title: "My policies", href: "/dashboard/insurance", icon: "shield-plus" },
      { title: "Claims", href: "/dashboard/insurance/claims", icon: "clipboard-list" },
      { title: "Cashless pre-authorisation", href: "/dashboard/insurance/pre-authorisation", icon: "hand-heart" },
      { title: "Network hospitals", href: "/dashboard/insurance/network", icon: "building-2" },
    ],
  },
  {
    title: "You",
    items: [
      { title: "Profile", href: "/dashboard/profile", icon: "users" },
      { title: "Family members", href: "/dashboard/family", icon: "users" },
      { title: "Consents", href: "/dashboard/consent", icon: "scroll-text" },
      { title: "Settings", href: "/dashboard/settings", icon: "settings" },
    ],
  },
];

const PROVIDER_NAV: NavSection[] = [
  {
    title: "Practice",
    items: [
      { title: "Overview", href: "/provider", icon: "layout-dashboard" },
      { title: "Appointments", href: "/provider/appointments", icon: "calendar-check" },
      { title: "Schedules", href: "/provider/schedules", icon: "clock" },
      { title: "Slots", href: "/provider/slots", icon: "calendar-check" },
    ],
  },
  {
    title: "Profile",
    items: [
      { title: "Provider profile", href: "/provider/profile", icon: "building-2" },
      { title: "Change requests", href: "/provider/requests", icon: "clipboard-list" },
      {
        title: "Telemedicine",
        href: "/provider/telemedicine",
        icon: "video",
        description: "Virtual consultations, notes and prescriptions",
      },
      {
        title: "AI review queue",
        href: "/provider/ai-reviews",
        icon: "shield-check",
        description: "Preliminary AI assessments waiting for a clinician",
      },
      { title: "Your account", href: "/dashboard/settings", icon: "settings" },
    ],
  },
];

/** Shared trailing section for the partner portals that need onboarding. */
const PARTNERSHIP_NAV: NavSection = {
  title: "Partnership",
  items: [
    { title: "Credentials & onboarding", href: "/onboarding", icon: "clipboard-list" },
    { title: "Your account", href: "/dashboard/settings", icon: "settings" },
  ],
};

const PARTNER_NAV: NavSection[] = [
  {
    title: "Partnership",
    items: [
      { title: "Overview", href: "/dashboard", icon: "layout-dashboard" },
      { title: "Onboarding applications", href: "/onboarding", icon: "clipboard-list" },
      { title: "Your account", href: "/dashboard/settings", icon: "settings" },
    ],
  },
];

/**
 * The pharmacy partner's own console.
 *
 * Each link is gated on the permission the page behind it checks. A partner who
 * has been given the inventory desk but not, say, the refund power sees no
 * refunds link rather than a link that redirects them to an access-denied page.
 */
function pharmacyPartnerNav(permissions: Set<Permission>): NavSection[] {
  const items: NavItem[] = [{ title: "Overview", href: "/pharmacy/portal", icon: "layout-dashboard" }];
  if (permissions.has("pharmacy.order_fulfil"))
    items.push({ title: "Orders", href: "/pharmacy/portal/orders", icon: "truck" });
  if (permissions.has("pharmacy.inventory_manage"))
    items.push({ title: "Inventory", href: "/pharmacy/portal/inventory", icon: "package" });
  if (permissions.has("pharmacy.prescription_review"))
    items.push({ title: "Prescriptions", href: "/pharmacy/portal/prescriptions", icon: "file-text" });
  if (permissions.has("pharmacy.refund_process"))
    items.push({ title: "Refunds", href: "/pharmacy/portal/refunds", icon: "receipt" });
  if (permissions.has("pharmacy.report_read"))
    items.push({ title: "Reports", href: "/pharmacy/portal/reports", icon: "chart-column" });
  return [{ title: "Pharmacy", items }, PARTNERSHIP_NAV];
}

/** The insurer reviewer's console. Product and network editors are opt-in. */
function insurerPartnerNav(permissions: Set<Permission>): NavSection[] {
  const items: NavItem[] = [
    { title: "Overview", href: "/insurer", icon: "layout-dashboard" },
    { title: "Review queue", href: "/insurer/reviews", icon: "clipboard-check" },
    { title: "Pre-authorisations", href: "/insurer/pre-authorisations", icon: "hand-heart" },
    { title: "Claims", href: "/insurer/claims", icon: "clipboard-list" },
  ];
  if (permissions.has("insurer.manage_network"))
    items.push({ title: "Network hospitals", href: "/insurer/network", icon: "building-2" });
  if (permissions.has("insurer.manage_products"))
    items.push({ title: "Approved products", href: "/insurer/products", icon: "shield-plus" });
  return [{ title: "Insurance desk", items }, PARTNERSHIP_NAV];
}

/**
 * The laboratory partner's console.
 *
 * The reports link follows `lab.booking_manage`, because whether a partner may
 * release a report is decided per-laboratory by the reviewer-set
 * `LabPartnerProfile.canPublishReports` flag in the database — not by a role. The
 * reports page checks that flag and says plainly when the desk has not been
 * released, rather than the link silently disappearing for every partner.
 */
function labPartnerNav(permissions: Set<Permission>): NavSection[] {
  const items: NavItem[] = [{ title: "Overview", href: "/lab", icon: "layout-dashboard" }];
  if (permissions.has("lab.booking_manage")) {
    items.push({ title: "Bookings", href: "/lab/bookings", icon: "clipboard-plus" });
    items.push({ title: "Sample collection", href: "/lab/collections", icon: "truck" });
  }
  if (permissions.has("lab.booking_manage"))
    items.push({ title: "Reports", href: "/lab/reports", icon: "microscope" });
  if (permissions.has("lab.offer_manage"))
    items.push({ title: "Test catalogue & pricing", href: "/lab/tests", icon: "flask-conical" });
  return [{ title: "Laboratory", items }, PARTNERSHIP_NAV];
}

/**
 * The store and the policy wallet, for an account whose day job is something
 * else. A pharmacy partner still has a parent with a prescription, so the two
 * consumer surfaces travel with `SELF_SERVICE_PERMISSIONS` wherever they land.
 */
const SELF_SERVICE_NAV: NavSection = {
  title: "Your own care",
  items: [
    { title: "Pharmacy store", href: "/pharmacy", icon: "pill" },
    { title: "My medicine orders", href: "/dashboard/orders", icon: "package" },
    { title: "Find a test", href: "/diagnostics", icon: "flask-conical" },
    { title: "My lab reports", href: "/dashboard/diagnostics/reports", icon: "microscope" },
    { title: "My consultations", href: "/dashboard/consultations", icon: "video" },
    { title: "My insurance", href: "/dashboard/insurance", icon: "shield-plus" },
  ],
};

/**
 * Phase 11 — the platform operations console.
 *
 * One navigation, built from the permissions the account actually holds rather
 * than from its job title. An account that works only the hospital verification
 * queue holds `platform.verify_hospital` and sees the Hospital verification
 * link and nothing else here: no refunds, no configuration, no audit trail. The
 * console shell itself is gated on `platform.console_access`, and each link
 * below is gated on the permission the page behind it checks, so a link that is
 * shown is a page that will open.
 *
 * The sections are the six workspaces the platform is meant to be run with:
 * verification, support and trust, emergency operations, configuration,
 * analytics, and security and compliance. A section that has no reachable item
 * for this account is omitted entirely.
 */
function platformConsoleNav(permissions: Set<Permission>): NavSection[] {
  const sections: NavSection[] = [];

  // --- Verification -------------------------------------------------------
  // Each subject is its own queue. Reading a hospital's registration papers and
  // approving a pharmacy's drug licence are different judgements, so the links
  // follow the subject-specific permissions rather than one "verify everything".
  const verification: NavItem[] = [];
  if (permissions.has("verification.review") || permissions.has("platform.verify_hospital"))
    verification.push({ title: "Hospital registration", href: "/admin/verifications/hospitals", icon: "building-2" });
  if (permissions.has("verification.review") || permissions.has("platform.verify_doctor"))
    verification.push({ title: "Clinician credentials", href: "/admin/verifications/doctors", icon: "stethoscope" });
  if (permissions.has("partner_application.review") || permissions.has("platform.verify_pharmacy"))
    verification.push({ title: "Pharmacy licences", href: "/admin/verifications/pharmacies", icon: "pill" });
  if (permissions.has("verification.review") || permissions.has("platform.verify_laboratory"))
    verification.push({
      title: "Laboratory accreditation",
      href: "/admin/verifications/laboratories",
      icon: "flask-conical",
    });
  if (permissions.has("partner_application.review") || permissions.has("platform.verify_ambulance"))
    verification.push({ title: "Ambulance partners", href: "/admin/verifications/ambulances", icon: "siren" });
  if (permissions.has("insurer.manage") || permissions.has("platform.verify_insurer"))
    verification.push({ title: "Insurers & products", href: "/admin/insurers", icon: "shield-plus" });
  if (permissions.has("partner_application.review") || permissions.has("verification.review"))
    verification.push({ title: "All applications", href: "/admin/partners", icon: "clipboard-list" });
  if (permissions.has("diagnostics.catalogue_manage"))
    verification.push({ title: "Diagnostics catalogue", href: "/admin/diagnostics", icon: "microscope" });
  if (permissions.has("ai.clinical_review"))
    verification.push({ title: "AI clinical reviews", href: "/admin/ai-reviews", icon: "shield-check" });
  if (verification.length) sections.push({ title: "Verification", items: verification });

  // --- Support and trust --------------------------------------------------
  const support: NavItem[] = [];
  if (permissions.has("platform.support_queue"))
    support.push({ title: "Support tickets", href: "/admin/support", icon: "ticket" });
  if (permissions.has("platform.grievance_manage")) {
    support.push({ title: "Grievances & complaints", href: "/admin/grievances", icon: "megaphone" });
    support.push({ title: "Abuse reports", href: "/admin/abuse", icon: "flag" });
  }
  if (permissions.has("platform.refund_oversight"))
    support.push({ title: "Refunds & chargebacks", href: "/admin/refunds", icon: "undo-2" });
  if (permissions.has("care.support_manage"))
    support.push({ title: "Care service support", href: "/admin/care-support", icon: "hand-heart" });
  if (permissions.has("care.content_manage"))
    support.push({ title: "Wellness & education library", href: "/admin/library", icon: "book-open" });
  if (support.length) sections.push({ title: "Support & trust", items: support });

  // --- Emergency operations ----------------------------------------------
  // Only meaningful where an approved operating model exists, and the page says
  // so plainly when none is configured rather than implying a service.
  if (permissions.has("platform.emergency_operations")) {
    sections.push({
      title: "Emergency operations",
      items: [
        { title: "SOS delivery monitor", href: "/admin/emergency", icon: "radio" },
        { title: "Failed integrations", href: "/admin/emergency/integrations", icon: "circle-alert" },
      ],
    });
  }

  // --- Configuration ------------------------------------------------------
  if (permissions.has("platform.configuration_manage")) {
    sections.push({
      title: "Configuration",
      items: [
        { title: "Service categories", href: "/admin/settings", icon: "sliders-horizontal" },
        { title: "Feature flags", href: "/admin/feature-flags", icon: "arrow-left-right" },
        { title: "Supported regions", href: "/admin/regions", icon: "map-pin" },
        { title: "Notification templates", href: "/admin/notifications", icon: "bell-ring" },
      ],
    });
  }

  // --- Analytics ----------------------------------------------------------
  const analytics: NavItem[] = [];
  if (permissions.has("platform.analytics_read")) {
    analytics.push({ title: "Operations overview", href: "/admin/analytics", icon: "bar-chart-3" });
    analytics.push({ title: "Provider performance", href: "/admin/analytics/providers", icon: "gauge" });
    analytics.push({ title: "Service reliability", href: "/admin/analytics/reliability", icon: "activity" });
  }
  if (permissions.has("platform.export_reports"))
    analytics.push({ title: "Report exports", href: "/admin/exports", icon: "download" });
  if (analytics.length) sections.push({ title: "Analytics", items: analytics });

  // --- Security and compliance -------------------------------------------
  const security: NavItem[] = [];
  if (permissions.has("platform.security_operations"))
    security.push({ title: "Security & integration alerts", href: "/admin/security", icon: "shield-alert" });
  if (permissions.has("audit.read")) security.push({ title: "Audit trail", href: "/admin/audit", icon: "scroll-text" });
  if (permissions.has("platform.retention_manage"))
    security.push({ title: "Retention policies", href: "/admin/retention", icon: "database" });
  if (permissions.has("platform.account_deletion_manage"))
    security.push({ title: "Account deletions", href: "/admin/deletions", icon: "trash-2" });
  if (security.length) sections.push({ title: "Security & compliance", items: security });

  // --- Platform access ----------------------------------------------------
  const access: NavItem[] = [];
  if (permissions.has("platform.staff_manage"))
    access.push({ title: "Operations staff", href: "/admin/staff", icon: "user-check" });
  if (permissions.has("user.administer"))
    access.push({ title: "Users & platform roles", href: "/admin/users", icon: "users" });
  if (access.length) sections.push({ title: "Platform access", items: access });

  sections.push({
    title: "Your account",
    items: [{ title: "Settings", href: "/dashboard/settings", icon: "settings" }],
  });

  return sections;
}

/**
 * Appended for every signed-in account with `ai.assess`, after the role-specific
 * sections and before the emergency section.
 *
 * Like emergency access, this is not tucked inside a role's own navigation: a
 * person describing their own symptoms is a patient whatever else they do here.
 */
const ASSISTANT_NAV: NavSection = {
  title: "Health assistant",
  items: [
    {
      title: "AI health assistant",
      href: "/assistant",
      icon: "sparkles",
      description: "Describe symptoms, upload a photo or report, get a preliminary explanation",
    },
    { title: "Previous assessments", href: "/assistant/history", icon: "folder-heart" },
  ],
};

/**
 * Appended for every signed-in account, after the role-specific sections.
 *
 * The emergency surface is never behind a role check, and it is always the last
 * section so it cannot push a role's own navigation below the fold.
 */
const EMERGENCY_NAV: NavSection = {
  title: "Emergency",
  items: [
    { title: "Emergency SOS", href: "/emergency", icon: "siren", description: "Raise an incident or call for help" },
    { title: "My incidents", href: "/emergency/incidents", icon: "activity" },
    { title: "Emergency contacts", href: "/emergency/contacts", icon: "users" },
  ],
};

/**
 * The hospital workspace console.
 *
 * Every link is gated on the permission the page behind it checks, so a
 * receptionist sees the front desk and not the pharmacy till, and a pharmacist
 * sees the pharmacy and not the billing desk. The console tells the truth about
 * what the person may do rather than showing links that lead to an access-denied
 * page.
 *
 * "Facility listing" is deliberately still here: the Phase 1 hospital profile
 * (address, opening hours, published services) is the public listing, and it is
 * a different thing from the operational workspace below it.
 */
function hospitalNav(permissions: Set<Permission>): NavSection[] {
  const operations: NavItem[] = [];

  if (permissions.has("hospital.patient_manage") || permissions.has("hospital.records_read"))
    operations.push({ title: "Patients", href: "/hospital/patients", icon: "user-plus" });
  if (permissions.has("hospital.opd_manage"))
    operations.push({ title: "OPD & queue", href: "/hospital/opd", icon: "list-ordered" });
  if (permissions.has("hospital.ipd_manage"))
    operations.push({ title: "Admissions & beds", href: "/hospital/admissions", icon: "bed-double" });
  if (permissions.has("hospital.records_read"))
    operations.push({ title: "Clinical records", href: "/hospital/records", icon: "folder-heart" });
  if (permissions.has("hospital.lab_manage"))
    operations.push({ title: "Laboratory", href: "/hospital/lab", icon: "flask-conical" });
  if (permissions.has("hospital.imaging_manage"))
    operations.push({ title: "Imaging", href: "/hospital/imaging", icon: "scan-line" });
  if (permissions.has("hospital.emergency_manage"))
    operations.push({ title: "Emergency & ambulance", href: "/hospital/emergency", icon: "siren" });

  const resources: NavItem[] = [];
  if (permissions.has("hospital.pharmacy_manage") || permissions.has("hospital.dispense"))
    resources.push({ title: "Pharmacy & stock", href: "/hospital/pharmacy", icon: "pill" });
  if (permissions.has("hospital.assets_manage") || permissions.has("hospital.procurement_manage")) {
    resources.push({ title: "Assets", href: "/hospital/assets", icon: "box" });
    resources.push({ title: "Procurement", href: "/hospital/procurement", icon: "truck" });
  }

  const finance: NavItem[] = [];
  if (permissions.has("hospital.billing_manage"))
    finance.push({ title: "Billing & invoices", href: "/hospital/billing", icon: "wallet" });
  if (permissions.has("hospital.claims_manage"))
    finance.push({ title: "Insurance desk", href: "/hospital/insurance", icon: "shield-plus" });

  const governance: NavItem[] = [];
  if (permissions.has("hospital.staff_manage"))
    governance.push({ title: "Staff & shifts", href: "/hospital/staff", icon: "users" });
  if (permissions.has("hospital.feedback_manage"))
    governance.push({ title: "Feedback & complaints", href: "/hospital/feedback", icon: "megaphone" });
  if (permissions.has("hospital.audit_read"))
    governance.push({ title: "Access audit", href: "/hospital/audit", icon: "shield-check" });
  governance.push({ title: "Facility listing", href: "/provider/profile", icon: "building-2" });
  governance.push({ title: "Your account", href: "/dashboard/settings", icon: "settings" });

  const sections: NavSection[] = [];
  if (operations.length) sections.push({ title: "Operations", items: operations });
  if (resources.length) sections.push({ title: "Resources", items: resources });
  if (finance.length) sections.push({ title: "Finance", items: finance });
  sections.push({ title: "Hospital", items: governance });
  return sections;
}

/**
 * Phase 10 — the personal health workspace, appended for every signed-in account
 * that holds `care.workspace_access`.
 *
 * Kept as three sections rather than one long list because the surfaces answer
 * different questions: "what is my history", "what is coming up", and "how am I
 * doing day to day". Merging them into a single list is what makes a personal
 * health screen feel like a settings page.
 */
const CARE_NAV: NavSection[] = [
  {
    title: "My health",
    items: [
      { title: "Health overview", href: "/care", icon: "heart-pulse" },
      {
        title: "Health timeline",
        href: "/care/timeline",
        icon: "activity",
        description: "Everything recorded against your record, newest first",
      },
      { title: "Medical history", href: "/care/history", icon: "folder-heart" },
      { title: "Allergies & immunisations", href: "/care/allergies", icon: "shield-check" },
      {
        title: "Document vault",
        href: "/care/documents",
        icon: "file-text",
        description: "Reports and certificates, stored privately",
      },
    ],
  },
  {
    title: "Family & prevention",
    items: [
      { title: "Family & caregivers", href: "/care/family", icon: "users" },
      { title: "Reminders", href: "/care/reminders", icon: "clock" },
      { title: "Preventive care", href: "/care/preventive", icon: "badge-check" },
      { title: "Medicines & adherence", href: "/care/medicines", icon: "pill" },
      {
        title: "Mental wellness",
        href: "/mental-wellness",
        icon: "life-buoy",
        description: "Support resources and how to reach a professional",
      },
    ],
  },
  {
    title: "Wellness",
    items: [
      { title: "Wellness tracking", href: "/care/wellness", icon: "chart-column" },
      {
        title: "Devices & imports",
        href: "/care/devices",
        icon: "watch",
        description: "Connect a wearable or import an export file",
      },
      {
        title: "Health education",
        href: "/health-education",
        icon: "book-open",
        description: "Plain-language guides in the languages you read",
      },
      {
        title: "Care services",
        href: "/care-services",
        icon: "hand-heart",
        description: "Physiotherapy, home nursing and home sample collection",
      },
    ],
  },
];

/**
 * Phase 10 — the provider-side care console, for the accounts that may publish
 * care-service listings and answer the requests they attract.
 *
 * A physiotherapist or a home-nursing agency onboards as a provider, so these
 * live under `/provider` rather than in a console of their own. A listing that
 * nobody can answer is worse than no listing, which is why the two permissions
 * appear together.
 */
function careProviderNav(permissions: Set<Permission>): NavSection[] {
  const items: NavItem[] = [];
  if (permissions.has("care.service_listing_manage"))
    items.push({ title: "Care service listings", href: "/provider/care/listings", icon: "hand-heart" });
  if (permissions.has("care.service_request_manage"))
    items.push({ title: "Care requests", href: "/provider/care/requests", icon: "clipboard-check" });
  if (items.length === 0) return [];
  return [{ title: "Care services", items }];
}

/** Navigation is derived from permissions on the server, never from a client claim. */
export function navigationForRoles(
  roles: readonly AppRole[],
  hospitalStaffRoles: readonly HospitalStaffRole[] = [],
  platformStaffRoles: readonly PlatformStaffRole[] = [],
): NavSection[] {
  const permissions = permissionsForRoles(roles);
  if (hospitalStaffRoles.length > 0) {
    for (const permission of hospitalStaffPermissionsForRoles(hospitalStaffRoles)) permissions.add(permission);
  }
  // Phase 11. A platform staff role is a row, so it is resolved per request and
  // folded in here. An account that only works a verification queue holds no
  // administrative identity and no `platform.*` permission beyond its own queue.
  if (platformStaffRoles.length > 0) {
    for (const permission of platformStaffPermissionsForRoles(platformStaffRoles)) permissions.add(permission);
  }
  const nav: NavSection[] = [];
  let hasConsumerNav = false;

  // One workspace console per account: the platform operations console outranks
  // a hospital workspace, which outranks a partner console, which outranks the
  // clinical console. A hospital administrator sometimes also runs a pharmacy, so
  // the ordering has to be deterministic rather than additive.
  if (permissions.has("platform.console_access") || permissions.has("verification.review"))
    nav.push(...platformConsoleNav(permissions));
  else if (permissions.has("hospital.portal_access")) nav.push(...hospitalNav(permissions));
  else if (permissions.has("pharmacy.portal_access")) nav.push(...pharmacyPartnerNav(permissions));
  else if (permissions.has("lab.portal_access")) nav.push(...labPartnerNav(permissions));
  else if (permissions.has("insurer.portal_access")) nav.push(...insurerPartnerNav(permissions));
  else if (permissions.has("provider.portal_access") || permissions.has("hospital.manage"))
    nav.push(...PROVIDER_NAV, ...careProviderNav(permissions));

  // A pharmacy, laboratory or insurer partner already carries its own credentials
  // section, so the generic application tracker is only shown to the partners
  // that need it.
  if (
    permissions.has("onboarding.apply") &&
    !permissions.has("pharmacy.portal_access") &&
    !permissions.has("lab.portal_access") &&
    !permissions.has("insurer.portal_access")
  ) {
    nav.push(...PARTNER_NAV);
  }

  if (permissions.has("appointment.read_own")) {
    nav.push(...PATIENT_NAV);
    hasConsumerNav = true;
  } else if (permissions.has("pharmacy.order_own")) {
    // Every role holds the self-service permissions, but a console user should not
    // be handed the whole patient area: only the two surfaces they can actually use.
    nav.push(SELF_SERVICE_NAV);
    hasConsumerNav = true;
  }

  if (!hasConsumerNav && nav.length === 0) nav.push(...PATIENT_NAV);

  // Phase 10. The personal health workspace is not a role's console — it belongs
  // to the person, so it is appended for everyone who can reach it rather than
  // being gated behind a healthcare role.
  if (permissions.has("care.workspace_access")) nav.push(...CARE_NAV);

  if (permissions.has("ai.assess")) nav.push(ASSISTANT_NAV);

  if (permissions.has("emergency.raise")) nav.push(EMERGENCY_NAV);

  return nav;
}

export function landingPathForRoles(roles: readonly AppRole[]): string {
  const role = primaryRole(roles);
  if (role === "PLATFORM_ADMIN") return "/admin";
  if (role === "PHARMACY_PARTNER") return "/pharmacy/portal";
  if (role === "LAB_PARTNER") return "/lab";
  if (role === "INSURANCE_PARTNER") return "/insurer";
  if (role === "HOSPITAL_ADMIN") return "/hospital";
  if (role === "DOCTOR") return "/provider";
  return "/dashboard";
}

/**
 * Where to send a person once their memberships are known.
 *
 * A nurse holds the `PATIENT` platform role, so `landingPathForRoles` would send
 * them to the consumer dashboard. When they are actually on shift, the hospital
 * workspace is where they need to be. The same is true of an operations reviewer
 * whose account carries no administrative `Role` at all: a platform staff row is
 * what makes the console their workplace. Sign-in calls this only after
 * resolving memberships; a person with none keeps their platform landing page.
 */
export function landingPathForUser(
  roles: readonly AppRole[],
  hospitalStaffRoles: readonly HospitalStaffRole[] = [],
  platformStaffRoles: readonly PlatformStaffRole[] = [],
): string {
  if (platformStaffRoles.length > 0) return "/admin";
  if (hospitalStaffRoles.length > 0) return "/hospital";
  return landingPathForRoles(roles);
}
