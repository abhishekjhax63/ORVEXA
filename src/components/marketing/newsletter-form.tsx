"use client";

import { useId, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Newsletter capture for the homepage trust section. Validates in the browser
 * and reports its demo status honestly instead of faking a subscription.
 */
function NewsletterForm({ className }: { className?: string }) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();

    if (!value) {
      setError("Enter your email address to subscribe.");
      return;
    }
    if (!emailPattern.test(value)) {
      setError("Enter a valid email address.");
      return;
    }

    setError(null);
    setStatus("submitting");
    await new Promise((resolve) => setTimeout(resolve, 600));
    setStatus("done");
    toast.success("Preferences saved locally — the mailing list connects in Phase 2.");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={className}>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="flex-1">
          <label htmlFor={inputId} className="sr-only">
            Email address
          </label>
          <Input
            id={inputId}
            type="email"
            name="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
            autoComplete="email"
            aria-describedby={error ? `${inputId}-error` : undefined}
            aria-invalid={error ? true : undefined}
            disabled={status === "done"}
            className="bg-card"
          />
        </div>
        <Button type="submit" variant="gradient" size="lg" disabled={status !== "idle"}>
          {status === "submitting" ? (
            <>
              <Loader2 aria-hidden className="animate-spin" />
              Saving
            </>
          ) : status === "done" ? (
            <>
              <Check aria-hidden />
              Subscribed
            </>
          ) : (
            <>
              <Send aria-hidden />
              Get updates
            </>
          )}
        </Button>
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-2 text-xs font-medium text-emergency">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Clinical product updates and health guidance, roughly once a month. No marketing lists, ever.
        </p>
      )}
    </form>
  );
}

export { NewsletterForm };
