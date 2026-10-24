"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DiagnosticBookingStatus } from "@prisma/client";
import { CalendarClock, CircleAlert, CircleCheck, LoaderCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { BOOKING_STATUS_COPY } from "@/lib/diagnostics/labels";

/**
 * The patient's controls over one diagnostic booking: move it or cancel it.
 *
 * Nothing here decides what is allowed. Whether a booking can still be moved or
 * cancelled is answered by the server, and a refusal is shown exactly as the
 * server worded it — the buttons are only a convenience, and the status gate
 * below mirrors the server's own `MANAGEABLE_STATUSES` so a completed booking
 * does not offer a button that would be refused.
 *
 * A reschedule is submitted as a request for a time, never as a claim on it: the
 * server validates and stores the instant.
 */

type Panel = "none" | "reschedule" | "cancel";

/** The two statuses the booking service still allows the patient to change. */
const MANAGEABLE_STATUSES: readonly DiagnosticBookingStatus[] = ["REQUESTED", "CONFIRMED"];

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, payload };
}

/** An instant as the `datetime-local` control expects it, in the viewer's own zone. */
function toLocalInputValue(value: Date | string | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function BookingActions({
  bookingId,
  reference,
  status,
  scheduledAt,
}: {
  bookingId: string;
  reference: string;
  status: DiagnosticBookingStatus;
  scheduledAt: Date | string | null;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [when, setWhen] = useState(() => toLocalInputValue(scheduledAt));
  const [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const manageable = MANAGEABLE_STATUSES.includes(status);

  function open(next: Panel) {
    setPanel((current) => (current === next ? "none" : next));
    setError(null);
    setNotice(null);
  }

  async function reschedule() {
    const instant = when ? new Date(when) : null;
    if (!instant || Number.isNaN(instant.getTime())) {
      setError("Choose the new date and time first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const { response, payload } = await postJson(
      `/api/diagnostics/bookings/${encodeURIComponent(reference)}/reschedule`,
      { bookingId, scheduledAt: instant.toISOString(), reason: reason.trim() || undefined },
    );
    setBusy(false);
    if (!response.ok || payload?.ok !== true) {
      setError((payload?.error as string | undefined) ?? "That change was not accepted. Try again in a moment.");
      return;
    }
    setNotice(`Saved. The server reports this booking as ${String(payload.status ?? status)}.`);
    setPanel("none");
    router.refresh();
  }

  async function cancel() {
    if (cancelReason.trim().length < 4) {
      setError("Give a reason for cancelling — the laboratory needs it, and it must be at least a few words.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const { response, payload } = await postJson(
      `/api/diagnostics/bookings/${encodeURIComponent(reference)}/cancel`,
      { bookingId, reason: cancelReason.trim() },
    );
    setBusy(false);
    if (!response.ok || payload?.ok !== true) {
      setError((payload?.error as string | undefined) ?? "That cancellation was not accepted. Try again in a moment.");
      return;
    }
    setNotice(`Cancelled. The server reports this booking as ${String(payload.status ?? "CANCELLED")}.`);
    setPanel("none");
    router.refresh();
  }

  if (!manageable) {
    return (
      <p className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
        {BOOKING_STATUS_COPY[status].detail} This booking can no longer be moved or cancelled from your account —
        contact the laboratory directly if something needs to change.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={panel === "reschedule"}
          onClick={() => open("reschedule")}
        >
          <CalendarClock aria-hidden />
          Move to another time
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={panel === "cancel"}
          onClick={() => open("cancel")}
        >
          <X aria-hidden />
          Cancel booking
        </Button>
      </div>

      {panel === "reschedule" ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <Field
            id={`reschedule-${reference}`}
            label="New date and time"
            description="Shown in your device's own time zone. The laboratory confirms the new slot."
          >
            <Input
              id={`reschedule-${reference}`}
              type="datetime-local"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
            />
          </Field>
          <Field id={`reschedule-reason-${reference}`} label="Reason (optional)">
            <Textarea
              id={`reschedule-reason-${reference}`}
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-20"
            />
          </Field>
          <Button type="button" disabled={busy} onClick={() => void reschedule()}>
            {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : <CalendarClock aria-hidden />}
            Request the new time
          </Button>
        </div>
      ) : null}

      {panel === "cancel" ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <Field
            id={`cancel-reason-${reference}`}
            label="Why are you cancelling?"
            required
            description="The laboratory is told this. A reason is required."
          >
            <Textarea
              id={`cancel-reason-${reference}`}
              value={cancelReason}
              maxLength={500}
              onChange={(event) => setCancelReason(event.target.value)}
              className="min-h-20"
            />
          </Field>
          <Button type="button" variant="emergency" disabled={busy} onClick={() => void cancel()}>
            {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : <X aria-hidden />}
            Cancel this booking
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-emergency">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="flex items-start gap-2 text-sm text-success">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          {notice}
        </p>
      ) : null}
    </div>
  );
}
