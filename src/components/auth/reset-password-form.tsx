"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheckBig, Eye, EyeOff, Loader2, Lock, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { confirmPasswordReset } from "@/lib/actions/auth";
import { idleFormState } from "@/lib/actions/form-state";

type ResetPasswordFormProps = {
  /** Reset token recovered from `?token=`. */
  token?: string;
};

/**
 * Password reset completion.
 *
 * A reset invalidates every other session in the action, so this form only has
 * to pick the new password. Without a token there is nothing to confirm, and the
 * page says so rather than rendering a form that cannot succeed.
 */
function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const formId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState(confirmPasswordReset, idleFormState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (!token) {
    return (
      <div className="flex flex-col gap-5">
        <span
          aria-hidden
          className="grid size-14 place-items-center rounded-full bg-warning-soft text-warning"
        >
          <TriangleAlert className="size-7" />
        </span>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold sm:text-2xl">This reset link is incomplete</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The link used to reach this page has no reset token in it, so a new password cannot be set here. Request a
            fresh reset link and open it from the email.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="gradient">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-success-soft text-success">
          <CircleCheckBig className="size-7" />
        </span>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold sm:text-2xl">Password updated</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{state.message}</p>
        </div>
        <Button asChild variant="gradient">
          <Link href={state.redirectTo ?? "/login"}>Sign in with your new password</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Account recovery
        </span>
        <h1 className="text-2xl font-semibold sm:text-3xl">Choose a new password</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Pick a strong password you have not used on ORVEXA before. Signing in on every other device will be ended
          once this is saved.
        </p>
      </header>

      {state.status === "error" ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-emergency/30 bg-emergency-soft px-4 py-3 text-sm text-emergency"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{state.message}</span>
        </p>
      ) : null}

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="token" value={token} />

        <Field id={`${formId}-password`} label="New password" error={fieldErrors?.password?.[0]} required>
          <div className="relative">
            <Lock aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`${formId}-password`}
              name="password"
              type={showPassword ? "text" : "password"}
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

        <Field id={`${formId}-confirm`} label="Confirm new password" error={fieldErrors?.confirmPassword?.[0]} required>
          <Input
            id={`${formId}-confirm`}
            name="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            required
            aria-invalid={fieldErrors?.confirmPassword ? true : undefined}
          />
        </Field>

        <p className="text-xs text-muted-foreground">
          At least 10 characters with a letter and a number. Avoid your email address and commonly used passwords.
        </p>

        <Button type="submit" variant="gradient" size="lg" disabled={pending}>
          {pending ? (
            <>
              <Loader2 aria-hidden className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save new password"
          )}
        </Button>
      </form>

      <p className="border-t border-border pt-5 text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export { ResetPasswordForm };
