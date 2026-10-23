"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { CircleAlert, Eye, EyeOff, Loader2, Lock, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Label } from "@/components/ui/input";
import { idleFormState } from "@/lib/actions/form-state";
import { login } from "@/lib/actions/auth";

type LoginFormProps = {
  /** Relative path to return to after sign-in, resolved from `?next=`. */
  next?: string;
};

/**
 * Sign-in form.
 *
 * The form posts to the `login` Server Action, which re-checks the password
 * against the stored hash, opens a database-backed session and redirects. Field
 * errors come back from the server in `state.fieldErrors`, so the same message
 * appears however the form is submitted. The only client-side work is the
 * password visibility toggle and the remembered-device checkbox.
 */
function LoginForm({ next }: LoginFormProps) {
  const formId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState(login, idleFormState);

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const formError = state.status === "error" ? state.message : undefined;

  const identifierId = `${formId}-identifier`;
  const passwordId = `${formId}-password`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Patient sign in
        </span>
        <h1 className="text-2xl font-semibold sm:text-3xl">Welcome back to ORVEXA</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sign in to reach your appointments, records, prescriptions and claims.
        </p>
      </header>

      {formError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-emergency/30 bg-emergency-soft px-4 py-3 text-sm text-emergency"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{formError}</span>
        </p>
      ) : null}

      <form action={formAction} className="flex flex-col gap-5">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <Field
          id={identifierId}
          label="Email or mobile number"
          description="Use the email or mobile number linked to your ORVEXA account."
          error={fieldErrors?.identifier?.[0] ?? fieldErrors?.form?.[0]}
          required
        >
          <div className="relative">
            <Smartphone aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={identifierId}
              name="identifier"
              type="text"
              autoComplete="username"
              placeholder="you@example.com or +91 98450 12093"
              className="pl-10"
              required
              aria-invalid={fieldErrors?.identifier ? true : undefined}
            />
          </div>
        </Field>

        <Field id={passwordId} label="Password" error={fieldErrors?.password?.[0]} required>
          <div className="relative">
            <Lock aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Checkbox id={`${formId}-remember`} name="remember" />
            <Label htmlFor={`${formId}-remember`} className="text-sm font-normal text-muted-foreground">
              Remember me on this device
            </Label>
          </div>
          <Link
            href="/forgot-password"
            className="rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="gradient" size="lg" disabled={pending}>
          {pending ? (
            <>
              <Loader2 aria-hidden className="animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="border-t border-border pt-5 text-sm text-muted-foreground">
        New to ORVEXA?{" "}
        <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export { LoginForm };
