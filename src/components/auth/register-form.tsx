"use client";

import { useActionState, useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CircleAlert,
  CircleCheckBig,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  PhoneCall,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Label, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cities } from "@/data/providers";
import { idleFormState } from "@/lib/actions/form-state";
import { register } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

const cityOptions = cities.filter((city) => city !== "All cities");

type Role = "patient" | "provider";

const roles: { id: Role; label: string }[] = [
  { id: "patient", label: "Patient" },
  { id: "provider", label: "Provider" },
];

/** 0–4 score used only to describe the password the visitor just typed. */
function strengthScore(value: string) {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 10) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}

const strengthLabels = ["Add a password", "Weak", "Fair", "Good", "Strong"] as const;
const strengthBars = ["bg-muted", "bg-emergency", "bg-warning", "bg-primary", "bg-success"] as const;

/**
 * Registration form.
 *
 * The patient form posts to the `register` Server Action, which opens a real
 * account (always as a patient), records the required consents and issues a
 * verification challenge. The provider path is intentionally not self-serve —
 * provider accounts are created through a verification flow, so that panel only
 * points at how listing works. Role selection here never reaches the server: the
 * action grants `PATIENT` and nothing else.
 */
function RegisterForm() {
  const formId = useId();
  const [role, setRole] = useState<Role>("patient");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [maxDob, setMaxDob] = useState("");
  const [state, formAction, pending] = useActionState(register, idleFormState);

  // The native date picker needs today's date as its ceiling. This is read in
  // an effect so no clock value is read during render.
  useEffect(() => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;
    setMaxDob(iso);
  }, []);

  const score = strengthScore(password);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-success-soft text-success">
          <CircleCheckBig className="size-7" />
        </span>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold sm:text-2xl">Your ORVEXA account is ready</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{state.message}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="gradient" className="w-full sm:w-auto">
            <Link href={state.redirectTo ?? "/login"}>Go to sign in</Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/verify-email">Verify your email</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Create account
        </span>
        <h1 className="text-2xl font-semibold sm:text-3xl">Join ORVEXA</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          One account keeps your consultations, reports, prescriptions and claims in a single timeline.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">I am registering as</span>
        <div
          role="group"
          aria-label="Account type"
          className="inline-flex w-fit gap-1 rounded-full border border-border bg-muted/70 p-1.5"
        >
          {roles.map((option) => {
            const active = role === option.id;
            const Icon = option.id === "patient" ? UserRound : Building2;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setRole(option.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active ? "bg-card text-foreground shadow-[var(--shadow-soft)]" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {role === "provider" ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card-elevated p-5">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Building2 className="size-5" />
            </span>
            <div className="flex flex-col">
              <span className="font-semibold">Provider onboarding</span>
              <span className="text-xs text-muted-foreground">Hospitals, clinics and individual practitioners</span>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Provider accounts are created through a verification flow, not a self-serve form. Registration confirms
            your clinical credentials, facility licences and accreditation before a listing goes live, and a
            partnerships specialist walks you through the listing and pricing. Sign up as a patient first, then apply
            for partner credentials from your workspace.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="gradient">
              <Link href="/about#providers">How provider listing works</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/contact">Talk to partnerships</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            To create a patient account instead, switch back to the Patient option above.
          </p>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-5">
          {state.status === "error" ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-emergency/30 bg-emergency-soft px-4 py-3 text-sm text-emergency"
            >
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{state.message}</span>
            </p>
          ) : null}

          <Field id={`${formId}-full-name`} label="Full name" error={fieldErrors?.fullName?.[0]} required>
            <Input
              id={`${formId}-full-name`}
              name="fullName"
              autoComplete="name"
              placeholder="As printed on your ID"
              required
              aria-invalid={fieldErrors?.fullName ? true : undefined}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id={`${formId}-email`} label="Email" error={fieldErrors?.email?.[0]} required>
              <Input
                id={`${formId}-email`}
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                aria-invalid={fieldErrors?.email ? true : undefined}
              />
            </Field>

            <Field id={`${formId}-mobile`} label="Mobile number" error={fieldErrors?.mobile?.[0]} required>
              <Input
                id={`${formId}-mobile`}
                name="mobile"
                type="tel"
                autoComplete="tel"
                placeholder="+91 98450 12093"
                required
                aria-invalid={fieldErrors?.mobile ? true : undefined}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <Field id={`${formId}-password`} label="Password" error={fieldErrors?.password?.[0]} required>
              <div className="relative">
                <Lock aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={`${formId}-password`}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 10 characters"
                  className="pr-11 pl-10"
                  required
                  aria-invalid={fieldErrors?.password ? true : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                </button>
              </div>
            </Field>
            <div id={`${formId}-password-strength`} className="flex items-center gap-3">
              <Progress
                value={(score / 4) * 100}
                className={cn("h-1.5 flex-1", score === 0 && "opacity-60")}
                indicatorClassName={strengthBars[score]}
                aria-hidden
              />
              <p aria-live="polite" className="w-28 shrink-0 text-xs text-muted-foreground">
                {strengthLabels[score]}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              At least 10 characters with a letter and a number. Avoid your email address and commonly used passwords.
            </p>
          </div>

          <Field id={`${formId}-confirm`} label="Confirm password" error={fieldErrors?.confirmPassword?.[0]} required>
            <Input
              id={`${formId}-confirm`}
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              required
              aria-invalid={fieldErrors?.confirmPassword ? true : undefined}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id={`${formId}-dob`} label="Date of birth" error={fieldErrors?.dateOfBirth?.[0]}>
              <Input id={`${formId}-dob`} name="dateOfBirth" type="date" max={maxDob || undefined} autoComplete="bday" />
            </Field>

            <Field id={`${formId}-city`} label="City" error={fieldErrors?.city?.[0]}>
              <Select id={`${formId}-city`} name="city" defaultValue="">
                <option value="">Select your city</option>
                {cityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id={`${formId}-consent`}
                checked={consent}
                onCheckedChange={(value) => setConsent(value === true)}
                aria-describedby={`${formId}-consent-help`}
                className="mt-0.5"
              />
              <Label htmlFor={`${formId}-consent`} className="text-sm leading-relaxed font-normal text-muted-foreground">
                I agree to the{" "}
                <Link href="/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
                  privacy policy
                </Link>{" "}
                and{" "}
                <Link href="/terms" className="font-medium text-primary underline-offset-4 hover:underline">
                  terms of service
                </Link>
                , including how ORVEXA stores and shares my health records. Required.
              </Label>
            </div>
            <p id={`${formId}-consent-help`} className="sr-only">
              You must accept the privacy policy and terms of service to create an account.
            </p>
          </div>

          <Button type="submit" variant="gradient" size="lg" disabled={pending || !consent}>
            {pending ? (
              <>
                <Loader2 aria-hidden className="animate-spin" />
                Creating your account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
        <a
          href="tel:108"
          className="inline-flex items-center gap-2 rounded-full border border-emergency/30 bg-emergency-soft px-3.5 py-2 text-sm font-semibold text-emergency transition-colors hover:border-emergency/60 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <PhoneCall aria-hidden className="size-4" />
          Medical emergency? Call 108
        </a>
      </div>
    </div>
  );
}

export { RegisterForm };
