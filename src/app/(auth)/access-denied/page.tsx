import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/guards";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, landingPathForUser, primaryRole } from "@/lib/auth/roles";
import { PERMISSIONS, type Permission } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Access denied",
  description: "You do not have permission to open that area.",
  robots: { index: false, follow: false },
};

type AuthSearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Human wording for the permissions a visitor is most likely to be missing. */
const PERMISSION_DESCRIPTIONS: Partial<Record<Permission, string>> = {
  "dashboard.access": "open a patient workspace",
  "provider.portal_access": "open the provider console for doctors and hospitals",
  "verification.review": "review provider verification requests",
  "partner_application.review": "review partner applications",
  "user.administer": "manage users and their roles",
  "audit.read": "read the platform audit log",
  "ai.clinical_review": "review preliminary AI assessments",
  "pharmacy.portal_access": "open the pharmacy partner console",
  "insurer.portal_access": "open the insurer console",
  "onboarding.apply": "submit a partner onboarding application",
  "role.grant": "grant roles to other accounts",
};

function describePermission(value: string | undefined) {
  if (!value) return undefined;
  const named = PERMISSION_DESCRIPTIONS[value as Permission];
  if (named) return named;
  return PERMISSIONS.includes(value as Permission) ? value.replace(/[._]/g, " ") : value;
}

/**
 * Access-denied page.
 *
 * It is deliberately outside any permission gate — a page that could redirect to
 * itself would loop. It names the permission that was missing in plain language
 * and offers the visitor the console their roles actually give them, so reaching
 * here is a signpost rather than a dead end.
 */
export default async function AccessDeniedPage({ searchParams }: { searchParams: AuthSearchParams }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);

  // Signed out: the honest next step is to sign in, not to explain permissions.
  if (!user) {
    const required = first(params.required);
    redirect(required ? `/login?next=${encodeURIComponent(`/access-denied?required=${required}`)}` : "/login");
  }

  const required = first(params.required);
  const described = describePermission(required);
  // The console is the one area a person's *platform role* does not entitle them
  // to: it is worked by operations staff, so reaching it without a staff row is
  // a different situation from missing one permission, and is explained as such.
  const notConsoleStaff = first(params.reason) === "not_console_staff";
  const role = primaryRole(user.roles);
  const landing = landingPathForUser(
    user.roles,
    user.hospitalMemberships.flatMap((membership) => (membership.staffRole ? [membership.staffRole] : [])),
    user.platformStaffMemberships.map((membership) => membership.role),
  );

  return (
    <div className="flex flex-col gap-6">
      <span aria-hidden className="grid size-14 place-items-center rounded-full bg-warning-soft text-warning">
        <ShieldQuestion className="size-7" />
      </span>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          {notConsoleStaff ? "The operations console is for platform staff" : "You don’t have access to that area"}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {notConsoleStaff ? (
            <>
              Verifying providers, working support queues and reviewing the audit trail are done by ORVEXA operations
              staff. Your account isn’t on that staff list, so the console has nothing it can show you. This attempt has
              been recorded in the audit log.
            </>
          ) : described ? (
            `Your ORVEXA account isn’t permitted to ${described} yet.`
          ) : (
            "Your ORVEXA account isn’t permitted to open that area yet."
          )}{" "}
          {notConsoleStaff
            ? null
            : "Permissions are attached to roles by an ORVEXA administrator, and this attempt has been recorded in the audit log."}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card-elevated p-5">
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Your access</p>
        <p className="mt-2 text-sm font-medium text-foreground">{ROLE_LABELS[role]}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
        {required ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">Required permission: {required}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="gradient">
          <Link href={landing}>
            Go to my workspace
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/contact">Request access</Link>
        </Button>
      </div>
    </div>
  );
}
