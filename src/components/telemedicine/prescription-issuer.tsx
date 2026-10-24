"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, FileSignature, LoaderCircle, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { formatConsultDate } from "@/lib/telemedicine/format";
import {
  CONSULTATION_PRESCRIPTION_CONSENT_POLICY_VERSION,
  CONSULTATION_PRESCRIPTION_CONSENT_STATEMENT,
} from "@/lib/telemedicine/labels";

/**
 * Issuing a prescription from a consultation.
 *
 * ## The clinician writes the medicines, not the platform
 *
 * Every line below is exactly what the clinician typed. Nothing here looks a
 * medicine up, suggests a strength, completes a dose or offers a substitute —
 * the request carries a written line and the platform records it verbatim.
 *
 * ## The record is the server's
 *
 * The prescriber's name and registration number are stamped on the prescription
 * from the clinician's own profile by the server, never from this form. When the
 * server refuses — because the clinician is not verified, is not treating this
 * consultation, or the appointment is not in a state a prescription may be
 * issued from — the refusal is shown as the server worded it, and the list is
 * left untouched.
 */

export type IssuedPrescription = {
  id: string;
  reference: string;
  status: string;
  issuedOn: string | Date | null;
  validUntil: string | Date | null;
  prescriberName: string | null;
  prescriberRegistrationNumber: string | null;
  patientNotes: string | null;
  items: {
    id: string;
    prescribedName: string;
    strengthLabel: string | null;
    dosageForm: string | null;
    frequency: string | null;
    durationDays: number | null;
    quantity: number | null;
    instructions: string | null;
  }[];
};

type LineFields = {
  prescribedName: string;
  strengthLabel: string;
  dosageForm: string;
  frequency: string;
  durationDays: string;
  quantity: string;
  instructions: string;
};

function emptyLine(): LineFields {
  return {
    prescribedName: "",
    strengthLabel: "",
    dosageForm: "",
    frequency: "",
    durationDays: "",
    quantity: "",
    instructions: "",
  };
}

/** An integer field, or `undefined` when left blank. */
function optionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
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

export function PrescriptionIssuer({
  appointmentId,
  canPrescribe,
  prescriptions,
}: {
  appointmentId: string;
  canPrescribe: boolean;
  prescriptions: IssuedPrescription[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<LineFields[]>([emptyLine()]);
  const [patientNotes, setPatientNotes] = useState("");
  const [validForDays, setValidForDays] = useState("30");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedPrescription[]>(prescriptions);
  const [status, setStatus] = useState<string | null>(null);

  const filledLines = lines.filter((line) => line.prescribedName.trim().length >= 2);
  const canIssue = canPrescribe && consent && filledLines.length > 0 && !busy;

  function setLine<K extends keyof LineFields>(index: number, key: K, value: LineFields[K]) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
    setStatus(null);
  }

  async function issue() {
    setBusy(true);
    setError(null);
    setStatus(null);
    const { response, payload } = await postJson(
      `/api/provider/telemedicine/consultations/${encodeURIComponent(appointmentId)}/prescriptions`,
      {
        appointmentId,
        items: filledLines.map((line) => ({
          prescribedName: line.prescribedName.trim(),
          strengthLabel: line.strengthLabel.trim() || undefined,
          dosageForm: line.dosageForm.trim() || undefined,
          frequency: line.frequency.trim() || undefined,
          durationDays: optionalInt(line.durationDays),
          quantity: optionalInt(line.quantity),
          instructions: line.instructions.trim() || undefined,
        })),
        patientNotes: patientNotes.trim() || undefined,
        validForDays: optionalInt(validForDays) ?? 30,
        consentAcknowledged: consent,
        consentPolicyVersion: CONSULTATION_PRESCRIPTION_CONSENT_POLICY_VERSION,
      },
    );
    setBusy(false);
    if (!response.ok || payload?.ok !== true) {
      setError((payload?.error as string | undefined) ?? "That prescription could not be issued.");
      return;
    }
    const created = payload.prescription as IssuedPrescription | undefined;
    if (created) setIssued((current) => [created, ...current]);
    setLines([emptyLine()]);
    setPatientNotes("");
    setConsent(false);
    setStatus((payload.notice as string | undefined) ?? "The prescription was issued.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {canPrescribe ? (
        <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileSignature aria-hidden className="size-4 text-primary" />
            Issue a prescription
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Write each medicine as you intend it to be dispensed. ORVEXA records the line exactly as written, stamps your
            name and registration number on the prescription, and never substitutes or changes a medicine on its own.
          </p>

          <ul className="space-y-4">
            {lines.map((line, index) => (
              <li key={index} className="space-y-4 rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Medicine {index + 1}
                  </span>
                  {lines.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove medicine ${index + 1}`}
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id={`rx-name-${index}`} label="Medicine as written" required>
                    <Input
                      id={`rx-name-${index}`}
                      value={line.prescribedName}
                      onChange={(event) => setLine(index, "prescribedName", event.target.value)}
                      maxLength={200}
                    />
                  </Field>
                  <Field id={`rx-strength-${index}`} label="Strength">
                    <Input
                      id={`rx-strength-${index}`}
                      value={line.strengthLabel}
                      onChange={(event) => setLine(index, "strengthLabel", event.target.value)}
                      maxLength={80}
                      placeholder="e.g. 500 mg"
                    />
                  </Field>
                  <Field id={`rx-form-${index}`} label="Form">
                    <Input
                      id={`rx-form-${index}`}
                      value={line.dosageForm}
                      onChange={(event) => setLine(index, "dosageForm", event.target.value)}
                      maxLength={80}
                      placeholder="e.g. tablet"
                    />
                  </Field>
                  <Field id={`rx-frequency-${index}`} label="Frequency">
                    <Input
                      id={`rx-frequency-${index}`}
                      value={line.frequency}
                      onChange={(event) => setLine(index, "frequency", event.target.value)}
                      maxLength={120}
                      placeholder="e.g. twice a day after food"
                    />
                  </Field>
                  <Field id={`rx-days-${index}`} label="Duration (days)">
                    <Input
                      id={`rx-days-${index}`}
                      type="number"
                      min={1}
                      max={365}
                      value={line.durationDays}
                      onChange={(event) => setLine(index, "durationDays", event.target.value)}
                    />
                  </Field>
                  <Field id={`rx-quantity-${index}`} label="Quantity to dispense">
                    <Input
                      id={`rx-quantity-${index}`}
                      type="number"
                      min={1}
                      max={100000}
                      value={line.quantity}
                      onChange={(event) => setLine(index, "quantity", event.target.value)}
                    />
                  </Field>
                </div>

                <Field id={`rx-instructions-${index}`} label="Instructions for the patient">
                  <Textarea
                    id={`rx-instructions-${index}`}
                    value={line.instructions}
                    onChange={(event) => setLine(index, "instructions", event.target.value)}
                    maxLength={500}
                    className="min-h-20"
                  />
                </Field>
              </li>
            ))}
          </ul>

          <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, emptyLine()])}>
            <Plus aria-hidden />
            Add another medicine
          </Button>

          <Field id="rx-patient-notes" label="Notes that appear on the prescription">
            <Textarea
              id="rx-patient-notes"
              value={patientNotes}
              onChange={(event) => setPatientNotes(event.target.value)}
              maxLength={2000}
            />
          </Field>

          <Field id="rx-valid-days" label="Valid for (days)">
            <Input
              id="rx-valid-days"
              type="number"
              min={1}
              max={365}
              value={validForDays}
              onChange={(event) => setValidForDays(event.target.value)}
            />
          </Field>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
            <Checkbox
              id="rx-consent"
              checked={consent}
              onCheckedChange={(value) => setConsent(value === true)}
            />
            <Label htmlFor="rx-consent" className="text-xs leading-relaxed font-normal">
              {CONSULTATION_PRESCRIPTION_CONSENT_STATEMENT}
            </Label>
          </div>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm font-medium text-emergency">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}
          {status ? (
            <p role="status" className="flex items-start gap-2 text-sm text-success">
              <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              {status}
            </p>
          ) : null}

          <Button type="button" disabled={!canIssue} onClick={() => void issue()}>
            {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : <FileSignature aria-hidden />}
            Issue the prescription
          </Button>
        </div>
      ) : (
        <p className="rounded-2xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          Your account does not hold the prescribing permission, so a prescription cannot be issued from here. Only a
          verified clinician treating this consultation may issue one.
        </p>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Prescriptions issued here
        </h3>
        {issued.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prescription has been issued from this consultation.</p>
        ) : (
          <ul className="space-y-4">
            {issued.map((prescription) => (
              <li key={prescription.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="success">Issued</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{prescription.reference}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatConsultDate(prescription.issuedOn) ?? "—"}
                    {formatConsultDate(prescription.validUntil)
                      ? ` · valid until ${formatConsultDate(prescription.validUntil)}`
                      : ""}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Prescriber: {prescription.prescriberName ?? "Not recorded"}
                  {prescription.prescriberRegistrationNumber
                    ? ` · Reg. ${prescription.prescriberRegistrationNumber}`
                    : ""}
                </p>
                <ul className="mt-3 space-y-2 border-t border-border pt-3">
                  {prescription.items.map((item) => (
                    <li key={item.id} className="text-sm">
                      <span className="font-medium">{item.prescribedName}</span>
                      {item.strengthLabel ? ` ${item.strengthLabel}` : ""}
                      {item.dosageForm ? ` · ${item.dosageForm}` : ""}
                      <span className="block text-xs text-muted-foreground">
                        {[
                          item.frequency,
                          item.durationDays ? `${item.durationDays} day(s)` : null,
                          item.quantity ? `qty ${item.quantity}` : null,
                          item.instructions,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No further directions recorded"}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
