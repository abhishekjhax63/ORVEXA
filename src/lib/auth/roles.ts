import type { Role } from "@prisma/client";

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
  // Platform administration
  | "verification.review"
  | "partner_application.review"
  | "insurer.manage"
  | "role.grant"
  | "audit.read"
  | "user.administer";

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
 * Granted to every role, without exception, like emergency and assistant access.
 *
 * Ordering your own medicines and holding your own insurance policy are consumer
 * acts, not professional ones. A doctor is also a person with a parent whose
 * prescription they manage, and a pharmacy partner is also a patient; gating these
 * behind a "patient" role would mean the platform stops working for the very
 * people who spend their day inside it.
 */
const SELF_SERVICE_PERMISSIONS: Permission[] = ["pharmacy.order_own", "insurance.manage_own"];

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
    "role.grant",
    "audit.read",
    "user.administer",
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
  | "chart-column";

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
 * The store and the policy wallet, for an account whose day job is something
 * else. A pharmacy partner still has a parent with a prescription, so the two
 * consumer surfaces travel with `SELF_SERVICE_PERMISSIONS` wherever they land.
 */
const SELF_SERVICE_NAV: NavSection = {
  title: "Your own care",
  items: [
    { title: "Pharmacy store", href: "/pharmacy", icon: "pill" },
    { title: "My medicine orders", href: "/dashboard/orders", icon: "package" },
    { title: "My insurance", href: "/dashboard/insurance", icon: "shield-plus" },
  ],
};

const ADMIN_NAV: NavSection[] = [
  {
    title: "Governance",
    items: [
      { title: "Overview", href: "/admin", icon: "layout-dashboard" },
      { title: "Verification queue", href: "/admin/verifications", icon: "badge-check" },
      { title: "Partner applications", href: "/admin/partners", icon: "clipboard-list" },
      { title: "Insurers & products", href: "/admin/insurers", icon: "shield-plus" },
      { title: "AI clinical reviews", href: "/admin/ai-reviews", icon: "shield-check" },
      { title: "Users & roles", href: "/admin/users", icon: "users" },
      { title: "Audit log", href: "/admin/audit", icon: "shield-check" },
    ],
  },
  {
    title: "Your account",
    items: [{ title: "Settings", href: "/dashboard/settings", icon: "settings" }],
  },
];

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

/** Navigation is derived from permissions on the server, never from a client claim. */
export function navigationForRoles(roles: readonly AppRole[]): NavSection[] {
  const permissions = permissionsForRoles(roles);
  const nav: NavSection[] = [];
  let hasConsumerNav = false;

  // One workspace console per account: the governance console outranks a partner
  // console, which outranks the clinical console.
  if (permissions.has("verification.review")) nav.push(...ADMIN_NAV);
  else if (permissions.has("pharmacy.portal_access")) nav.push(...pharmacyPartnerNav(permissions));
  else if (permissions.has("insurer.portal_access")) nav.push(...insurerPartnerNav(permissions));
  else if (permissions.has("provider.portal_access") || permissions.has("hospital.manage"))
    nav.push(...PROVIDER_NAV);

  // A pharmacy or insurer partner already carries its own credentials section, so
  // the generic application tracker is only shown to the partners that need it.
  if (
    permissions.has("onboarding.apply") &&
    !permissions.has("pharmacy.portal_access") &&
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

  if (permissions.has("ai.assess")) nav.push(ASSISTANT_NAV);

  if (permissions.has("emergency.raise")) nav.push(EMERGENCY_NAV);

  return nav;
}

export function landingPathForRoles(roles: readonly AppRole[]): string {
  const role = primaryRole(roles);
  if (role === "PLATFORM_ADMIN") return "/admin";
  if (role === "PHARMACY_PARTNER") return "/pharmacy/portal";
  if (role === "INSURANCE_PARTNER") return "/insurer";
  if (role === "DOCTOR" || role === "HOSPITAL_ADMIN") return "/provider";
  return "/dashboard";
}
