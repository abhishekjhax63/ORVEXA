"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheckBig, Loader2, Mail, MailWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/actions/auth";
import { idleFormState } from "@/lib/actions/form-state";

type ForgotPasswordFormProps = {
  /** Whether an email transport exists, so the copy stays truthful. */
  emailDeliveryConfigured: boolean;
  /** Shared limitation copy shown when delivery is not configured. */
  deliveryNotice: string;
};

/**
 * Password reset request.
 *
 * The success message is deliberately identical whether or not the address has
 * an account, so this form never becomes an account-existence oracle. When no
 * email transport exists the action reports that plainly instead of pretending a
 * message was queued.
 */
function ForgotPasswordForm({ emailDeliveryConfigured, deliveryNotice }: ForgotPasswordFormProps) {
  const formId = useId();
  const [state, formAction, pending] = useActionState(requestPasswordReset, idleFormState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Account recovery
        </span>
        <h1 className="text-2xl font-semibold sm:text-3xl">Reset your password</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Enter the email address on your account and we’ll send instructions to choose a new password.
        </p>
      </header>

      {!emailDeliveryConfigured ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
          <MailWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {deliveryNotice} You can still ask support to help you regain access to your account.
          </span>
        </p>
      ) : null}

      {state.status === "success" ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success"
        >
          <CircleCheckBig aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{state.message}</span>
        </p>
      ) : null}

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
        <Field id={`${formId}-email`} label="Email address" error={fieldErrors?.email?.[0]} required>
          <div className="relative">
            <Mail aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`${formId}-email`}
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="pl-10"
              required
              aria-invalid={fieldErrors?.email ? true : undefined}
            />
          </div>
        </Field>

        <Button type="submit" variant="gradient" size="lg" disabled={pending}>
          {pending ? (
            <>
              <Loader2 aria-hidden className="animate-spin" />
              Requesting…
            </>
          ) : (
            "Send reset instructions"
          )}
        </Button>
      </form>

      <p className="border-t border-border pt-5 text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export { ForgotPasswordForm };
