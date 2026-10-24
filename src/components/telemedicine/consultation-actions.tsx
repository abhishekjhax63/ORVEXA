"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CircleAlert, CircleCheck, LoaderCircle, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Label, Textarea } from "@/components/ui/input";
import { istDateKey, istDayHeading, istTodayKey } from "@/lib/telemedicine/format";
import {
  TELEMEDICINE_CONSENT_POLICY_VERSION,
  TELEMEDICINE_CONSENT_STATEMENT,
} from "@/lib/telemedicine/labels";
import { cn } from "@/lib/utils";

/**
 * The patient's controls over one virtual consultation: move it, cancel it, or
 * book a follow-up to it.
 *
 * Nothing here decides what is allowed. Whether a consultation can still be
 * moved, cancelled or followed up is answered by the server, and a refusal is
 * shown as the server worded it — the buttons are only a convenience. A
 * reschedule is submitted as a request for a time, never as a claim on it: the
 * booking transaction is what actually claims the slot.
 */

type Slot = { startAt: string; endAt: string; scheduleId: string; label: string };

type Panel = "none" | "reschedule" | "cancel" | "follow-up";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `orvexa-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, payload };
}

/** The clinician's published telemedicine times, grouped by Indian calendar day. */
function SlotPicker({
  doctorProfileId,
  chosen,
  onChoose,
  disabled,
}: {
  doctorProfileId: string;
  chosen: Slot | null;
  onChoose: (slot: Slot) => void;
  disabled?: boolean;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A change of clinician puts the picker back into its loading state during
  // render; the fetch below is what resolves it.
  const [lastDoctorProfileId, setLastDoctorProfileId] = useState(doctorProfileId);
  if (lastDoctorProfileId !== doctorProfileId) {
    setLastDoctorProfileId(doctorProfileId);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/telemedicine/availability", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ doctorProfileId, fromDate: istTodayKey(), days: 14 }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; slots?: Slot[]; error?: string }
          | null;
        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          setError(payload?.error ?? "Times could not be loaded. Try again in a moment.");
          return;
        }
        setSlots(Array.isArray(payload.slots) ? payload.slots : []);
      } catch {
        if (!cancelled) setError("Times could not be loaded. Check your connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doctorProfileId]);

  const grouped = (() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = istDateKey(slot.startAt) ?? slot.startAt.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(slot);
      else map.set(key, [slot]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        Checking the clinician&apos;s published clinic…
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-emergency">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        {error}
      </p>
    );
  }

  if (grouped.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This clinician has published no open times in the next fortnight. Their clinic may be fully booked, or they have
        not published a virtual clinic yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([date, daySlots]) => (
        <div key={date}>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{istDayHeading(date)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {daySlots.map((slot) => {
              const active = chosen?.startAt === slot.startAt;
              return (
                <button
                  key={slot.startAt}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChoose(slot)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/40 hover:text-primary",
                  )}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConsultationActions({
  appointmentId,
  reference,
  doctorProfileId,
  status,
}: {
  appointmentId: string;
  reference: string;
  doctorProfileId: string;
  status: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "rescheduled" | "cancelled" | "follow-up">(null);

  const [chosenSlot, setChosenSlot] = useState<Slot | null>(null);
  const [moveReason, setMoveReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [followUpConsent, setFollowUpConsent] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // A fresh key for the next attempt, issued after a failed one so a retry is
  // not mistaken for a repeat of the request that just failed.
  const refreshKey = useCallback(() => setIdempotencyKey(newIdempotencyKey()), []);

  const canMove = status === "PENDING" || status === "CONFIRMED";
  const canFollowUp = status === "COMPLETED";

  function open(next: Panel) {
    setPanel(next);
    setError(null);
    setDone(null);
    setChosenSlot(null);
  }

  async function submitReschedule() {
    if (!chosenSlot) return;
    setBusy(true);
    setError(null);
    const { response, payload } = await postJson(
      `/api/telemedicine/bookings/${encodeURIComponent(reference)}/reschedule`,
      {
        appointmentId,
        scheduledAt: chosenSlot.startAt,
        reason: moveReason.trim() || undefined,
      },
    );
    setBusy(false);
    if (!response.ok || payload?.ok !== true) {
      setError((payload?.error as string | undefined) ?? "That consultation could not be moved.");
      return;
    }
    setDone("rescheduled");
    setPanel("none");
    router.refresh();
  }

  async function submitCancel() {
    setBusy(true);
    setError(null);
    const { response, payload } = await postJson(
      `/api/telemedicine/bookings/${encodeURIComponent(reference)}/cancel`,
      { appointmentId, reason: cancelReason.trim() },
    );
    setBusy(false);
    if (!response.ok || payload?.ok !== true) {
      setError((payload?.error as string | undefined) ?? "That consultation could not be cancelled.");
      return;
    }
    setDone("cancelled");
    setPanel("none");
    router.refresh();
  }

  async function submitFollowUp() {
    if (!chosenSlot) return;
    setBusy(true);
    setError(null);
    const { response, payload } = await postJson(
      `/api/telemedicine/${encodeURIComponent(appointmentId)}/follow-up`,
      {
        parentAppointmentId: appointmentId,
        doctorProfileId,
        scheduledAt: chosenSlot.startAt,
        patientNotes: followUpNotes.trim() || undefined,
        consentAcknowledged: followUpConsent,
        consentPolicyVersion: TELEMEDICINE_CONSENT_POLICY_VERSION,
        idempotencyKey,
      },
    );
    setBusy(false);
    if (!response.ok || payload?.ok !== true) {
      setError((payload?.error as string | undefined) ?? "That follow-up could not be requested.");
      refreshKey();
      return;
    }
    const created = payload.appointment as { reference?: string } | undefined;
    setDone("follow-up");
    setPanel("none");
    if (created?.reference) setFollowUpNotes("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {done ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-success/40 bg-success-soft px-4 py-3 text-sm font-medium text-success"
        >
          <CircleCheck aria-hidden className="size-4" />
          {done === "rescheduled"
            ? "This consultation has been moved. The clinician will see the new time."
            : done === "cancelled"
              ? "This consultation has been cancelled. Any join link issued for it no longer works."
              : "A follow-up consultation has been requested and now appears in your consultations."}
        </p>
      ) : null}

      {panel === "none" ? (
        <div className="flex flex-wrap gap-3">
          {canMove ? (
            <>
              <Button type="button" variant="outline" onClick={() => open("reschedule")}>
                <CalendarClock aria-hidden />
                Move to another time
              </Button>
              <Button type="button" variant="ghost" onClick={() => open("cancel")}>
                <X aria-hidden />
                Cancel this consultation
              </Button>
            </>
          ) : null}
          {canFollowUp ? (
            <Button type="button" variant="outline" onClick={() => open("follow-up")}>
              <CalendarClock aria-hidden />
              Book a follow-up
            </Button>
          ) : null}
          {!canMove && !canFollowUp ? (
            <p className="text-sm text-muted-foreground">
              This consultation can no longer be moved or cancelled from here. Contact the clinician or the hospital if
              something needs to change.
            </p>
          ) : null}
        </div>
      ) : null}

      {panel === "reschedule" ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold">Choose a new time (IST)</p>
          <SlotPicker doctorProfileId={doctorProfileId} chosen={chosenSlot} onChoose={setChosenSlot} disabled={busy} />
          <Field
            id="reschedule-reason"
            label="Why you are moving it"
            description="Optional. Recorded on the consultation history."
          >
            <Textarea
              id="reschedule-reason"
              value={moveReason}
              onChange={(event) => setMoveReason(event.target.value)}
              maxLength={500}
              aria-describedby="reschedule-reason-description"
            />
          </Field>
          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm font-medium text-emergency">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={!chosenSlot || busy} onClick={() => void submitReschedule()}>
              {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
              Move the consultation
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPanel("none")}>
              Keep the current time
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "cancel" ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <p className="flex items-start gap-2 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Cancelling frees the time for somebody else and stops any join link already issued for this consultation.
            </span>
          </p>
          <Field
            id="cancel-reason"
            label="Reason for cancelling"
            description="Required. Recorded on the consultation and shown to the clinician."
          >
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              maxLength={500}
              required
              aria-describedby="cancel-reason-description"
            />
          </Field>
          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm font-medium text-emergency">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="emergency"
              disabled={cancelReason.trim().length < 4 || busy}
              onClick={() => void submitCancel()}
            >
              {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
              Cancel the consultation
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPanel("none")}>
              Keep the consultation
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "follow-up" ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold">A further consultation with the same clinician (IST)</p>
          <SlotPicker doctorProfileId={doctorProfileId} chosen={chosenSlot} onChoose={setChosenSlot} disabled={busy} />
          <Field
            id="follow-up-notes"
            label="What has changed since the last consultation"
            description="Optional. Do not include information you would not want stored in your health record."
          >
            <Textarea
              id="follow-up-notes"
              value={followUpNotes}
              onChange={(event) => setFollowUpNotes(event.target.value)}
              maxLength={1000}
              aria-describedby="follow-up-notes-description"
            />
          </Field>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
            <Checkbox
              id="follow-up-consent"
              checked={followUpConsent}
              onCheckedChange={(value) => setFollowUpConsent(value === true)}
            />
            <Label htmlFor="follow-up-consent" className="text-xs leading-relaxed font-normal">
              {TELEMEDICINE_CONSENT_STATEMENT}
            </Label>
          </div>
          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm font-medium text-emergency">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={!chosenSlot || !followUpConsent || busy}
              onClick={() => void submitFollowUp()}
            >
              {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
              Request the follow-up
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPanel("none")}>
              Not now
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
