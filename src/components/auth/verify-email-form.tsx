"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheckBig, Loader2, MailCheck, MailWarning, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { resendVerification, verifyEmail } from "@/lib/actions/auth";
import { idleFormState } from "@/lib/actions/form-state";

type VerifyEmailFormProps = {
  /** Present when the visitor arrived from a verification link. */
  token?: string;
  /** Whether an email transport exists at all, so the copy stays truthful. */
  emailDeliveryConfigured: boolean;
  /** Shared limitation copy shown when delivery is not configured. */
  deliveryNotice: string;
};

/**
 * Email verification surface.
 *
 * The link token is consumed by an explicit submit rather than automatically on
 * load: a GET to this page must not change account state, because chat clients
 * and link previews fetch URLs on the visitor's behalf. The token is single-use
 * and expired links are reported plainly.
 */
function VerifyEmailForm({ token, emailDeliveryConfigured, deliveryNotice }: VerifyEmailFormProps) {
  const formId = useId();
  const [verifyState, verifyAction, verifying] = useActionState(verifyEmail, idleFormState);
  const [resendState, resendAction, resending] = useActionState(resendVerification, idleFormState);

  const resendErrors = resendState.status === "error" ? resendState.fieldErrors : undefined;

  if (verifyState.status === "success") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-success-soft text-success">
          <CircleCheckBig className="size-7" />
        </span>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold sm:text-2xl">Email verified</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{verifyState.message}</p>
        </div>
        <Button asChild variant="gradient">
          <Link href={verifyState.redirectTo ?? "/login"}>Continue to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 eyebrow text-primary">
          Email verification
        </span>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          {token ? "Confirm your email address" : "Verify your email"}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {token
            ? "Confirm this address to finish securing your ORVEXA account."
            : "Open the verification link we issued for your address, or request a fresh one below."}
        </p>
      </header>

      {verifyState.status === "error" ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-emergency/30 bg-emergency-soft px-4 py-3 text-sm text-emergency"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{verifyState.message}</span>
        </p>
      ) : null}

      {token ? (
        <form action={verifyAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <Button type="submit" variant="gradient" size="lg" disabled={verifying}>
            {verifying ? (
              <>
                <Loader2 aria-hidden className="animate-spin" />
                Verifying…
              </>
            ) : (
              <>
                <MailCheck aria-hidden />
                Verify my email address
              </>
            )}
          </Button>
        </form>
      ) : (
        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          <MailWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            This page has no verification link in it. Use the link from your verification email, or request a new one
            below.
          </span>
        </p>
      )}

      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Didn’t get the link?</h2>
          {emailDeliveryConfigured ? (
            <p className="text-xs text-muted-foreground">
              Enter your address and we’ll issue a fresh verification link.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{deliveryNotice}</p>
          )}
        </div>

        {emailDeliveryConfigured ? (
          <form action={resendAction} className="flex flex-col gap-4">
            {resendState.status === "success" ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success"
              >
                <CircleCheckBig aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>{resendState.message}</span>
              </p>
            ) : null}
            {resendState.status === "error" ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-emergency/30 bg-emergency-soft px-4 py-3 text-sm text-emergency"
              >
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>{resendState.message}</span>
              </p>
            ) : null}

            <Field id={`${formId}-email`} label="Email address" error={resendErrors?.email?.[0]} required>
              <Input
                id={`${formId}-email`}
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                aria-invalid={resendErrors?.email ? true : undefined}
              />
            </Field>

            <Button type="submit" variant="outline" disabled={resending}>
              {resending ? (
                <>
                  <Loader2 aria-hidden className="animate-spin" />
                  Requesting…
                </>
              ) : (
                <>
                  <Send aria-hidden />
                  Send a new link
                </>
              )}
            </Button>
          </form>
        ) : (
          <Button asChild variant="outline" className="w-fit">
            <Link href="/contact">Contact support to verify your address</Link>
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Already verified?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export { VerifyEmailForm };
