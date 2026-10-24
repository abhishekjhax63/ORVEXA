import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgeCheck, ShieldCheck } from "lucide-react";

import { LocationPermissionPrompt } from "@/components/auth/location-permission-prompt";
import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentUser } from "@/lib/auth/guards";
import { landingPathForRoles } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Create a free ORVEXA account to book appointments, keep your health records together and manage prescriptions and claims.",
  robots: { index: false, follow: false },
};

/**
 * Registration page.
 *
 * Anyone may open a patient account: the patient role is the only one an account
 * can self-assign, and the form posts to a Server Action that grants `PATIENT`
 * and nothing else. Partner and clinician accounts carry clinical or commercial
 * responsibility, so they are issued through verification rather than self-serve
 * — the form says so and points at the partnership route.
 */
export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(landingPathForRoles(user.roles));

  return (
    <div className="flex flex-col gap-6">
      <LocationPermissionPrompt />
      <RegisterForm />

      <section
        aria-labelledby="partner-roles-note"
        className="rounded-2xl border border-border bg-card-elevated p-5"
      >
        <h2 id="partner-roles-note" className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck aria-hidden className="size-4 text-primary" />
          Patient accounts are created instantly
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Your account starts as a patient. Partner and clinician roles — hospital administrator, doctor, pharmacy, lab,
          ambulance and insurance — are granted only after ORVEXA verifies the credentials behind them, so they are not
          offered as a sign-up option here.
        </p>
        <p className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-primary">
          <BadgeCheck aria-hidden className="size-4" />
          Apply for partner credentials from your workspace once you’re signed in.
        </p>
      </section>
    </div>
  );
}
