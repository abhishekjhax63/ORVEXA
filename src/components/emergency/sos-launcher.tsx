"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CircleAlert,
  Crosshair,
  LoaderCircle,
  MapPin,
  ShieldAlert,
  Siren,
  TriangleAlert,
  X,
} from "lucide-react";

import { DialActions } from "@/components/emergency/dial-actions";
import { geoAccuracyBand, useGeolocation } from "@/components/emergency/geolocation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { raiseEmergencyIncident } from "@/lib/emergency/actions";
import { EMPTY_EMERGENCY_STATE } from "@/lib/emergency/form-state";
import { EMERGENCY_INCIDENT_TYPE_LABELS, EMERGENCY_INCIDENT_TYPES } from "@/lib/validation/emergency";
import { cn } from "@/lib/utils";

/**
 * The SOS launcher.
 *
 * The design constraint that shapes everything here: the action must be hard to
 * trigger by accident and still be one deliberate press away. So the first press
 * never sends anything — it opens a confirmation step that is already filled in
 * with the minimum needed to route help, and the second press is the send.
 *
 * Two things this component deliberately does NOT do:
 *
 *  - It never claims help is coming. The moment a request is created the user is
 *    taken to the incident page, whose copy is driven by the incident's real
 *    status — which starts as "nobody has accepted yet".
 *  - It never sends a location the user did not switch on for this incident. The
 *    fix is captured only from a press of "Use my location", and the consent
 *    checkbox that accompanies it is visible and can be turned off.
 */

type Stage = "idle" | "confirming";

const SIGN_IN_HREF = "/login?next=%2Femergency";

/** A random, unguessable key so a double tap resolves to one incident. */
function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function SosLauncher({ signedIn, className }: { signedIn: boolean; className?: string }) {
  const formId = useId();
  const [stage, setStage] = useState<Stage>("idle");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [locationConsent, setLocationConsent] = useState(false);
  const [contactShareConsent, setContactShareConsent] = useState(false);
  const [addressText, setAddressText] = useState("");
  const [locality, setLocality] = useState("");
  const [city, setCity] = useState("");
  const geo = useGeolocation();
  const [state, formAction, pending] = useActionState(raiseEmergencyIncident, EMPTY_EMERGENCY_STATE);

  const confirmPanelRef = useRef<HTMLDivElement | null>(null);
  const fix = geo.fix;
  const accuracy = geoAccuracyBand(fix?.accuracyMetres);

  // Move focus into the confirmation step so a keyboard or screen-reader user
  // lands where the decision is, not back at the top of the page.
  useEffect(() => {
    if (stage === "confirming") confirmPanelRef.current?.focus();
  }, [stage]);

  // A declined permission must never leave a stale consent tick behind.
  const [lastGeo, setLastGeo] = useState({ status: geo.status, fix });
  if (lastGeo.status !== geo.status || lastGeo.fix !== fix) {
    setLastGeo({ status: geo.status, fix });
    if (geo.status === "denied" && fix === null) setLocationConsent(false);
  }

  function openConfirmation() {
    setIdempotencyKey(newIdempotencyKey());
    setStage("confirming");
  }

  function closeConfirmation() {
    setStage("idle");
    setLocationConsent(false);
    setContactShareConsent(false);
    setAddressText("");
    setLocality("");
    setCity("");
    geo.clear();
  }

  async function captureLocation() {
    const captured = await geo.request();
    // Capturing a position *is* the consent gesture; the checkbox below records
    // it and can be turned off again, which drops the coordinates.
    if (captured) setLocationConsent(true);
  }

  // A GPS fix only counts as a location when the consent box is ticked — the
  // exact condition under which the hidden coordinate inputs below are emitted.
  // Deriving the address requirement from `!fix` alone would hide the address
  // field while sending no coordinates at all: a request with no location.
  const shareFix = locationConsent ? fix : null;
  const needsAddress = shareFix === null;
  const typedAddress = addressText.trim().length >= 4;
  const addressMissing = needsAddress && !typedAddress;
  const locationGiven = shareFix !== null || typedAddress;

  return (
    <div className={cn("rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-panel)] sm:p-7", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-emergency-soft text-emergency">
            <Siren className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Emergency SOS</h2>
            <p className="text-xs text-muted-foreground">Raise an incident and ask registered responders for help.</p>
          </div>
        </div>
        <Badge variant="emergency">One deliberate press</Badge>
      </div>

      {stage === "idle" ? (
        <div className="mt-6 space-y-5">
          <button
            type="button"
            onClick={openConfirmation}
            aria-describedby={`${formId}-sos-help`}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-emergency bg-emergency px-6 py-8 text-emergency-foreground",
              "shadow-[0_18px_44px_-18px_rgba(220,38,38,0.75)] transition-[transform,filter] duration-150",
              "hover:brightness-110 focus-visible:ring-4 focus-visible:ring-emergency/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:translate-y-px",
            )}
          >
            <Siren aria-hidden className="size-9" />
            <span className="text-2xl font-bold tracking-wide">SOS</span>
            <span className="text-sm font-medium opacity-95">Press once to confirm what will be sent</span>
          </button>

          <p id={`${formId}-sos-help`} className="text-sm leading-relaxed text-muted-foreground">
            Nothing is sent by this press. You will see the exact details, choose the emergency type and confirm.
            {signedIn
              ? " Your account and the time are recorded with the incident."
              : " Raising an incident needs a signed-in account so the record has an owner; you can still call the numbers below right now."}
          </p>

          {!signedIn ? (
            <div className="rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm">
              <p className="flex items-start gap-2 font-medium text-warning">
                <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                You are not signed in, so the SOS form cannot be submitted from this browser.
              </p>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                Sign in to record an incident, or use the numbers below. A phone call does not depend on ORVEXA and is
                usually the fastest route to an ambulance.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={SIGN_IN_HREF}>Sign in to raise an incident</Link>
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="soft" size="lg">
              <Link href="/emergency/nearby">
                <MapPin aria-hidden />
                Find nearby emergency care
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/emergency/contacts">
                <Activity aria-hidden />
                Emergency contacts
              </Link>
            </Button>
          </div>

          <div className="border-t border-border pt-5">
            <p className="mb-3 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Call directly
            </p>
            <DialActions compact />
          </div>
        </div>
      ) : (
        <div
          ref={confirmPanelRef}
          tabIndex={-1}
          role="group"
          aria-labelledby={`${formId}-confirm-heading`}
          className="mt-6 space-y-6 focus-visible:outline-none"
        >
          <div className="rounded-2xl border-2 border-emergency/40 bg-emergency-soft p-4">
            <h3 id={`${formId}-confirm-heading`} className="flex items-center gap-2 text-base font-semibold text-emergency">
              <TriangleAlert aria-hidden className="size-4.5" />
              Confirm the emergency request
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              This records an incident and sends a request to registered hospitals and ambulance partners that cover
              this area. It does <strong className="font-semibold text-foreground">not</strong> guarantee that anyone
              accepts, so keep the phone numbers below within reach and call them if nobody responds.
            </p>
          </div>

          {!signedIn ? (
            <div role="alert" className="rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm">
              <p className="font-medium text-warning">Sign in to send this request.</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={SIGN_IN_HREF}>Sign in to raise an incident</Link>
              </Button>
            </div>
          ) : null}

          <form action={formAction} className="space-y-6">
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            {shareFix ? (
              <>
                <input type="hidden" name="latitude" value={shareFix.latitude} />
                <input type="hidden" name="longitude" value={shareFix.longitude} />
                {Number.isFinite(shareFix.accuracyMetres) ? (
                  <input type="hidden" name="accuracyMetres" value={Math.round(shareFix.accuracyMetres)} />
                ) : null}
              </>
            ) : null}
            <input type="hidden" name="addressText" value={addressText} />
            <input type="hidden" name="locality" value={locality} />
            <input type="hidden" name="city" value={city} />

            <Field id={`${formId}-type`} label="What is happening?" required>
              <Select id={`${formId}-type`} name="incidentType" defaultValue="OTHER" required>
                {EMERGENCY_INCIDENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EMERGENCY_INCIDENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              id={`${formId}-injury`}
              label="Anything the crew should know"
              description="Optional. Injuries, consciousness, age, and the nearest landmark all help. Do not type medical history you would not want a responder to read."
            >
              <Textarea
                id={`${formId}-injury`}
                name="injuryDescription"
                maxLength={500}
                placeholder="Two people, one unconscious, opposite the metro pillar 42"
              />
            </Field>

            <fieldset className="space-y-4 rounded-2xl border border-border p-4">
              <legend className="px-1 text-sm font-semibold">Where should help come to?</legend>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant={fix ? "soft" : "outline"}
                  size="lg"
                  onClick={captureLocation}
                  disabled={geo.status === "requesting" || !geo.canRequest}
                >
                  {geo.status === "requesting" ? (
                    <LoaderCircle aria-hidden className="animate-spin" />
                  ) : (
                    <Crosshair aria-hidden />
                  )}
                  {fix ? "Update my location" : "Use my location"}
                </Button>
                {fix ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { geo.clear(); setLocationConsent(false); }}>
                    <X aria-hidden />
                    Remove GPS fix
                  </Button>
                ) : null}
              </div>

              <p
                aria-live="polite"
                className={cn(
                  "text-xs leading-relaxed",
                  geo.status === "denied" || geo.status === "unavailable" || geo.status === "timeout"
                    ? "text-emergency"
                    : "text-muted-foreground",
                )}
              >
                {geo.message}
              </p>

              {fix ? (
                <div className="space-y-2 rounded-xl bg-muted/60 p-3 text-xs">
                  <p className="flex items-center gap-2 font-medium">
                    <MapPin aria-hidden className="size-3.5" />
                    {fix.latitude.toFixed(4)}, {fix.longitude.toFixed(4)}
                  </p>
                  <p className={accuracy.warning ? "text-warning" : "text-muted-foreground"}>{accuracy.label}</p>
                </div>
              ) : null}

              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <input
                  type="checkbox"
                  name="locationConsent"
                  value="on"
                  checked={locationConsent}
                  onChange={(event) => {
                    setLocationConsent(event.target.checked);
                    if (!event.target.checked) geo.clear();
                  }}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--emergency)]"
                />
                <span>
                  <span className="font-medium">Share my GPS position with the responders for this incident.</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    It is stored against this incident only, is never shown publicly, and is deleted with the incident
                    record when it is purged.
                  </span>
                </span>
              </label>

              {needsAddress ? (
                <div className="space-y-4">
                  <Field
                    id={`${formId}-address`}
                    label="Address or nearest landmark"
                    required
                    error={
                      addressMissing && addressText.trim().length > 0
                        ? "Enter at least four characters so a responder can find the landmark."
                        : undefined
                    }
                    description="Required when no GPS fix is shared. A landmark is more useful than a door number."
                  >
                    <Input
                      id={`${formId}-address`}
                      value={addressText}
                      onChange={(event) => setAddressText(event.target.value)}
                      maxLength={300}
                      placeholder="Opposite Cubbon Park metro gate 2, Kasturba Road"
                      autoComplete="street-address"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id={`${formId}-locality`} label="Area or locality">
                      <Input
                        id={`${formId}-locality`}
                        value={locality}
                        onChange={(event) => setLocality(event.target.value)}
                        maxLength={120}
                        placeholder="Shivaji Nagar"
                      />
                    </Field>
                    <Field id={`${formId}-city`} label="City">
                      <Input
                        id={`${formId}-city`}
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        maxLength={120}
                        placeholder="Bengaluru"
                        autoComplete="address-level2"
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <Field id={`${formId}-address-optional`} label="Landmark or address (optional)" description="Adds context for the crew even when GPS is shared.">
                  <Input
                    id={`${formId}-address-optional`}
                    value={addressText}
                    onChange={(event) => setAddressText(event.target.value)}
                    maxLength={300}
                    placeholder="Nearest junction, gate number or floor"
                  />
                </Field>
              )}
            </fieldset>

            <label className="flex items-start gap-3 rounded-2xl border border-border p-4 text-sm">
              <input
                type="checkbox"
                name="contactShareConsent"
                value="on"
                checked={contactShareConsent}
                onChange={(event) => setContactShareConsent(event.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
              />
              <span>
                <span className="font-medium">
                  Let me send a time-limited location link to my emergency contacts.
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  Off by default. Nothing is sent to anyone automatically — after the incident is raised you choose
                  which contacts receive a link, and it stops working when it expires.
                </span>
              </span>
            </label>

            {state.status === "error" ? (
              <div role="alert" className="space-y-2 rounded-2xl border border-emergency/40 bg-emergency-soft p-4 text-sm">
                <p className="flex items-start gap-2 font-medium text-emergency">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {state.message ?? "The request could not be sent."}
                </p>
                {state.fieldErrors ? (
                  <ul className="ml-6 list-disc space-y-1 text-xs text-muted-foreground">
                    {Object.entries(state.fieldErrors).map(([field, message]) => (
                      <li key={field}>
                        <span className="font-medium text-foreground">{field}</span>: {message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!signedIn ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={SIGN_IN_HREF}>Sign in to raise an incident</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center">
              <Button
                type="submit"
                variant="emergency"
                size="xl"
                disabled={pending || !locationGiven || !signedIn}
                className="w-full sm:w-auto"
              >
                {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Siren aria-hidden />}
                {pending ? "Sending request…" : "Send emergency request"}
              </Button>
              <Button type="button" variant="outline" size="xl" onClick={closeConfirmation} disabled={pending} className="w-full sm:w-auto">
                Cancel — do not send
              </Button>
            </div>

            {!locationGiven ? (
              <p className="text-xs text-warning">
                Add a location before sending: either use your GPS position or type an address or landmark.
              </p>
            ) : null}
          </form>

          <div className="border-t border-border pt-5">
            <p className="mb-3 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Or call now — this does not depend on ORVEXA
            </p>
            <DialActions compact />
          </div>
        </div>
      )}
    </div>
  );
}

export { SosLauncher };
