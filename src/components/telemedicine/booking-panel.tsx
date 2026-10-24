"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Languages,
  LoaderCircle,
  ShieldCheck,
  Stethoscope,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { istDateKey, istDayHeading, istTodayKey } from "@/lib/telemedicine/format";
import {
  TELEMEDICINE_CONSENT_POLICY_VERSION,
  TELEMEDICINE_CONSENT_STATEMENT,
} from "@/lib/telemedicine/labels";
import { cn } from "@/lib/utils";

/**
 * Find a clinician and request a virtual consultation.
 *
 * Two rules shape the interaction. The fee is never entered here — it is taken
 * from the clinician's own published price when the booking is written, so the
 * figure shown is the one the server will charge. And no time is "held": the
 * list is what the clinician's schedule currently offers, and the booking
 * transaction is the only thing that can actually claim a slot.
 */

export type BookableDoctor = {
  id: string;
  fullName: string;
  specialties: string[];
  languages: string[];
  yearsOfExperience: number | null;
  headline: string | null;
  teleconsultFeeInr: number | null;
  registrationNumber: string;
  verified: boolean;
  hasPublishedClinic: boolean;
};

type Slot = {
  startAt: string;
  endAt: string;
  scheduleId: string;
  label: string;
};

function rupee(value: number | null): string {
  if (value === null) return "Fee not published";
  return `₹${value.toLocaleString("en-IN")}`;
}

export function BookingPanel({
  doctors,
  initialDoctorId,
}: {
  doctors: BookableDoctor[];
  initialDoctorId?: string;
}) {
  const router = useRouter();
  const [doctorId, setDoctorId] = useState<string | null>(initialDoctorId ?? doctors[0]?.id ?? null);
  const selectedDoctor = doctors.find((doctor) => doctor.id === doctorId) ?? null;

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const newIdempotencyKey = useCallback(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `orvexa-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }, []);

  const [chosenSlot, setChosenSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState("");
  const [patientNotes, setPatientNotes] = useState("");
  const [consent, setConsent] = useState(false);
  // The key is generated once, when this panel first renders, and reused for
  // every retry of that first attempt so a repeat is never mistaken for a new
  // request.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bookedReference, setBookedReference] = useState<string | null>(null);

  // The slot list is emptied and put into its loading state during render when
  // the chosen clinician changes; the fetch below is what fills it.
  const [lastDoctorId, setLastDoctorId] = useState<string | null>(null);
  if (lastDoctorId !== doctorId) {
    setLastDoctorId(doctorId);
    setSlots([]);
    setSlotsError(null);
    setSlotsLoading(true);
    setChosenSlot(null);
  }

  useEffect(() => {
    if (!doctorId) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/telemedicine/availability", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ doctorProfileId: doctorId, fromDate: istTodayKey(), days: 14 }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; slots?: Slot[]; error?: string }
          | null;
        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          setSlotsError(payload?.error ?? "Times could not be loaded. Try again in a moment.");
          return;
        }
        setSlots(Array.isArray(payload.slots) ? payload.slots : []);
      } catch {
        if (!cancelled) setSlotsError("Times could not be loaded. Check your connection and try again.");
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doctorId]);

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

  async function submit() {
    if (!selectedDoctor || !chosenSlot) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch("/api/telemedicine/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          doctorProfileId: selectedDoctor.id,
          scheduledAt: chosenSlot.startAt,
          reason: reason.trim() || undefined,
          patientNotes: patientNotes.trim() || undefined,
          consentAcknowledged: consent,
          consentPolicyVersion: TELEMEDICINE_CONSENT_POLICY_VERSION,
          idempotencyKey,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; appointment?: { reference: string }; error?: string; code?: string }
        | null;
      if (!response.ok || !payload?.ok || !payload.appointment) {
        setFormError(payload?.error ?? "The consultation could not be requested.");
        setIdempotencyKey(newIdempotencyKey());
        return;
      }
      setBookedReference(payload.appointment.reference);
      router.refresh();
    } catch {
      setFormError("The consultation could not be requested. Check your connection and try again.");
      setIdempotencyKey(newIdempotencyKey());
    } finally {
      setSubmitting(false);
    }
  }

  if (doctors.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
        <p className="font-semibold">No clinician offers virtual consultations for that search</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Try a different speciality or clear the search. Clinicians appear here only after their registration is
          verified and they have switched virtual consultations on.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Clinicians</h3>
        <ul className="space-y-2.5">
          {doctors.map((doctor) => {
            const active = doctor.id === doctorId;
            return (
              <li key={doctor.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDoctorId(doctor.id);
                    setBookedReference(null);
                    setFormError(null);
                  }}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
                    active ? "border-primary/50 bg-primary-soft" : "border-border bg-card hover:border-primary/35",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{doctor.fullName}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {doctor.specialties.length > 0 ? doctor.specialties.join(", ") : "General practice"}
                      </p>
                    </div>
                    {doctor.verified ? (
                      <Badge variant="success" aria-label="Verified registration">
                        <ShieldCheck aria-hidden />
                        Verified
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {doctor.headline ?? "Virtual consultation"}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="neutral">{rupee(doctor.teleconsultFeeInr)}</Badge>
                    {doctor.hasPublishedClinic ? (
                      <Badge variant="outline">
                        <Video aria-hidden />
                        Online times
                      </Badge>
                    ) : (
                      <Badge variant="warning">No times published</Badge>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-5">
        {selectedDoctor ? (
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{selectedDoctor.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  Reg. {selectedDoctor.registrationNumber}
                  {selectedDoctor.yearsOfExperience !== null
                    ? ` · ${selectedDoctor.yearsOfExperience} yrs experience`
                    : ""}
                </p>
              </div>
              <Badge variant="neutral">{rupee(selectedDoctor.teleconsultFeeInr)}</Badge>
            </div>
            {selectedDoctor.languages.length > 0 ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Languages aria-hidden className="size-3.5" />
                {selectedDoctor.languages.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock aria-hidden className="size-4 text-primary" />
              Available times (next 14 days, IST)
            </h3>
          </div>

          {slotsLoading ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              Checking the clinician&apos;s published clinic…
            </p>
          ) : slotsError ? (
            <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-emergency">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {slotsError}
            </p>
          ) : grouped.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              This clinician has published no open times in the next fortnight. They may be fully booked, or they have
              not published a virtual clinic yet. Choose another clinician, or book an in-person visit.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {grouped.map(([date, daySlots]) => (
                <div key={date}>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {istDayHeading(date)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {daySlots.map((slot) => {
                      const active = chosenSlot?.startAt === slot.startAt;
                      return (
                        <button
                          key={slot.startAt}
                          type="button"
                          onClick={() => {
                            setChosenSlot(slot);
                            setBookedReference(null);
                            setFormError(null);
                          }}
                          aria-pressed={active}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
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
          )}
        </div>

        {chosenSlot ? (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm">
              <span className="font-semibold">Requested time:</span>{" "}
              {istDayHeading(istDateKey(chosenSlot.startAt) ?? "")} at {chosenSlot.label} IST
            </p>

            <Field id="teleconsult-reason" label="Reason for the consultation" description="Optional. Shared with the clinician before the call.">
              <Input
                id="teleconsult-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder="e.g. recurring headache for two weeks"
                aria-describedby="teleconsult-reason-description"
              />
            </Field>

            <Field
              id="teleconsult-notes"
              label="Anything the clinician should know beforehand"
              description="Optional. Do not include information you would not want stored in your health record."
            >
              <Textarea
                id="teleconsult-notes"
                value={patientNotes}
                onChange={(event) => setPatientNotes(event.target.value)}
                maxLength={1000}
                aria-describedby="teleconsult-notes-description"
              />
            </Field>

            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
              <Checkbox
                id="teleconsult-consent"
                checked={consent}
                onCheckedChange={(value) => setConsent(value === true)}
              />
              <Label htmlFor="teleconsult-consent" className="text-xs leading-relaxed font-normal">
                {TELEMEDICINE_CONSENT_STATEMENT}
              </Label>
            </div>

            {formError ? (
              <p role="alert" className="flex items-start gap-2 text-sm font-medium text-emergency">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {formError}
              </p>
            ) : null}

            <Button
              type="button"
              variant="gradient"
              disabled={!consent || submitting}
              onClick={() => void submit()}
            >
              {submitting ? <LoaderCircle aria-hidden className="animate-spin" /> : <Video aria-hidden />}
              Request this consultation
            </Button>
            {!consent ? (
              <p className="text-xs text-muted-foreground">
                The consultation can be requested once the consent statement above is accepted.
              </p>
            ) : null}
          </div>
        ) : null}

        {bookedReference ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/40 bg-success-soft p-5"
          >
            <p className="flex items-center gap-2 text-sm font-medium text-success">
              <CircleCheck aria-hidden className="size-4" />
              Consultation requested — reference {bookedReference}
            </p>
            <Button asChild size="sm">
              <a href={`/dashboard/consultations/${bookedReference}`}>Open the consultation</a>
            </Button>
          </div>
        ) : null}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Stethoscope aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
          A virtual consultation is not a substitute for emergency care. If you have severe or worsening symptoms, call
          emergency services instead of waiting for an appointment.
        </p>
      </div>
    </div>
  );
}
