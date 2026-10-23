"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { cancelIncident, retryIncidentDispatch } from "@/lib/emergency/actions";
import { EMPTY_EMERGENCY_STATE } from "@/lib/emergency/form-state";

/**
 * Incident mutations available to the reporter.
 *
 * Neither form can move the incident past "seeking responders" — that is a
 * responder's own callback. These only let the reporter try again or stand the
 * incident down.
 */

/** A fresh key per attempt so a double submission resolves to one fan-out. */
function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `retry-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function CancelIncidentForm({ incidentId, className }: { incidentId: string; className?: string }) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [state, formAction, pending] = useActionState(cancelIncident, EMPTY_EMERGENCY_STATE);

  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
    if (state.status === "error" && state.message) toast.error(state.message);
  }, [state]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <Button type="button" variant="outline" className={className} onClick={() => setOpen(true)}>
        <XCircle aria-hidden />
        Cancel this incident
      </Button>
    );
  }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="group"
      aria-labelledby={`${formId}-heading`}
      className={className}
    >
      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] focus-visible:outline-none">
        <h3 id={`${formId}-heading`} className="font-semibold">
          Stand this incident down
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Every outstanding request is closed and any location link you sent to a contact stops working immediately.
          This cannot be undone — raising help again creates a new incident.
        </p>

        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="incidentId" value={incidentId} />
          <Field
            id={`${formId}-reason`}
            label="Reason (optional)"
            description="Recorded in the incident history so the audit trail explains the cancellation."
          >
            <Textarea
              id={`${formId}-reason`}
              name="reason"
              maxLength={300}
              placeholder="Help arrived by another route"
            />
          </Field>

          {state.status === "error" && state.message ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency-soft p-3 text-sm text-emergency">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="emergency" disabled={pending}>
              {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
              Yes, cancel the incident
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Keep it open
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RetryDispatchForm({ incidentId, className }: { incidentId: string; className?: string }) {
  const [key, setKey] = useState(newIdempotencyKey);
  const [state, formAction, pending] = useActionState(retryIncidentDispatch, EMPTY_EMERGENCY_STATE);

  useEffect(() => {
    if (state.status === "success") {
      if (state.message) toast.success(state.message);
      // A new key for the next attempt; the previous one already resolved.
      setKey(newIdempotencyKey());
    } else if (state.status === "error" && state.message) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="incidentId" value={incidentId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <Button type="submit" variant="soft" disabled={pending}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
        {pending ? "Sending another request…" : "Ask the nearest responders again"}
      </Button>
      {state.status === "error" && state.message ? (
        <p role="alert" className="mt-2 text-xs font-medium text-emergency">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export { CancelIncidentForm, RetryDispatchForm };
