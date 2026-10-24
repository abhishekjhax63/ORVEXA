"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, FileSignature, LoaderCircle, PenLine, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { formatConsultInstant } from "@/lib/telemedicine/format";
import { CONSULTATION_NOTE_STATUS_COPY } from "@/lib/telemedicine/labels";

/**
 * The clinician's note, from working draft to signed record.
 *
 * Three things this component deliberately cannot do: it cannot finalise a note
 * that has not been saved, it cannot edit a finalised note in place, and it
 * cannot claim a note is signed. Finalising is the server's act, and the copy
 * here repeats what the server returned — including a refusal.
 */

export type ClinicianNote = {
  id: string;
  status: string;
  authorLabel: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  diagnosisSummary: string | null;
  followUpInstructions: string | null;
  followUpAfterDays: number | null;
  postConsultationInstructions: string | null;
  finalizedByLabel: string | null;
  finalizedAt: string | Date | null;
  amendmentReason: string | null;
  createdAt: string | Date;
};

type DraftFields = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnosisSummary: string;
  followUpInstructions: string;
  followUpAfterDays: string;
  postConsultationInstructions: string;
};

function emptyDraft(): DraftFields {
  return {
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    diagnosisSummary: "",
    followUpInstructions: "",
    followUpAfterDays: "",
    postConsultationInstructions: "",
  };
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

export function ConsultationNoteEditor({
  appointmentId,
  notes,
  canWrite,
}: {
  appointmentId: string;
  notes: ClinicianNote[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const draft = notes.find((note) => note.status === "DRAFT") ?? null;

  const [fields, setFields] = useState<DraftFields>(() =>
    draft
      ? {
          subjective: draft.subjective ?? "",
          objective: draft.objective ?? "",
          assessment: draft.assessment ?? "",
          plan: draft.plan ?? "",
          diagnosisSummary: draft.diagnosisSummary ?? "",
          followUpInstructions: draft.followUpInstructions ?? "",
          followUpAfterDays: draft.followUpAfterDays === null ? "" : String(draft.followUpAfterDays),
          postConsultationInstructions: draft.postConsultationInstructions ?? "",
        }
      : emptyDraft(),
  );
  const [noteId, setNoteId] = useState<string | null>(draft?.id ?? null);
  const [busy, setBusy] = useState<null | "save" | "finalize" | "amend">(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [amendTarget, setAmendTarget] = useState<ClinicianNote | null>(null);
  const [amendReason, setAmendReason] = useState("");
  const [amendAssessment, setAmendAssessment] = useState("");
  const [amendPlan, setAmendPlan] = useState("");

  const signedNotes = notes.filter((note) => note.status !== "DRAFT");

  function set<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    setStatus(null);
  }

  async function saveDraft() {
    setBusy("save");
    setError(null);
    setStatus(null);
    const { response, payload } = await postJson(
      `/api/provider/telemedicine/consultations/${encodeURIComponent(appointmentId)}/notes`,
      {
        appointmentId,
        noteId: noteId ?? undefined,
        subjective: fields.subjective.trim() || undefined,
        objective: fields.objective.trim() || undefined,
        assessment: fields.assessment.trim() || undefined,
        plan: fields.plan.trim() || undefined,
        diagnosisSummary: fields.diagnosisSummary.trim() || undefined,
        followUpInstructions: fields.followUpInstructions.trim() || undefined,
        followUpAfterDays: fields.followUpAfterDays === "" ? undefined : Number(fields.followUpAfterDays),
        postConsultationInstructions: fields.postConsultationInstructions.trim() || undefined,
      },
    );
    setBusy(null);
    if (!response.ok || payload?.ok !== true) {
      setError((payload?.error as string | undefined) ?? "That draft could not be saved.");
      return;
    }
    const saved = payload.note as { id?: string } | undefined;
    if (saved?.id) setNoteId(saved.id);
    setStatus("Draft saved. It stays your working text and is not shown to the patient.");
    router.refresh();
  }

  async function finalize() {
    if (!noteId) return;
    setBusy("finalize");
    setError(null);
    setStatus(null);
    const { response, payload } = await postJson(
      `/api/provider/telemedicine/consultations/${encodeURIComponent(appointmentId)}/notes/finalize`,
      { appointmentId, noteId },
    );
    setBusy(null);
    if (!response.ok || payload?.ok !== true) {
      setError((payload?.error as string | undefined) ?? "That note could not be finalised.");
      return;
    }
    setStatus("The note is finalised and now readable by the patient.");
    router.refresh();
  }

  async function amend() {
    if (!amendTarget) return;
    setBusy("amend");
    setError(null);
    const { response, payload } = await postJson(
      `/api/provider/telemedicine/consultations/${encodeURIComponent(appointmentId)}/notes/amend`,
      {
        appointmentId,
        noteId: amendTarget.id,
        reason: amendReason.trim(),
        assessment: amendAssessment.trim() || undefined,
        plan: amendPlan.trim() || undefined,
      },
    );
    setBusy(null);
    if (!response.ok || payload?.ok !== true) {
      setError((payload?.error as string | undefined) ?? "That amendment could not be recorded.");
      return;
    }
    setAmendTarget(null);
    setAmendReason("");
    setAmendAssessment("");
    setAmendPlan("");
    setStatus("The amendment was recorded. The original note is unchanged.");
    router.refresh();
  }

  if (!canWrite) {
    return (
      <p className="rounded-2xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        Your account does not hold the clinical-note permission, so a note cannot be written from here. Only a verified
        clinician treating this consultation may sign one.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <PenLine aria-hidden className="size-4 text-primary" />
            {noteId ? "Your draft" : "A new note"}
          </h3>
          {draft ? <Badge variant={CONSULTATION_NOTE_STATUS_COPY.DRAFT.tone}>Draft</Badge> : null}
        </div>

        <Field id="note-subjective" label="Subjective" description="What the patient reported.">
          <Textarea
            id="note-subjective"
            value={fields.subjective}
            onChange={(event) => set("subjective", event.target.value)}
            maxLength={8000}
            aria-describedby="note-subjective-description"
          />
        </Field>

        <Field id="note-objective" label="Objective" description="What you observed, including anything shared in the consultation.">
          <Textarea
            id="note-objective"
            value={fields.objective}
            onChange={(event) => set("objective", event.target.value)}
            maxLength={8000}
            aria-describedby="note-objective-description"
          />
        </Field>

        <Field id="note-assessment" label="Assessment" description="At least an assessment or a plan is required before finalising.">
          <Textarea
            id="note-assessment"
            value={fields.assessment}
            onChange={(event) => set("assessment", event.target.value)}
            maxLength={8000}
            aria-describedby="note-assessment-description"
          />
        </Field>

        <Field id="note-plan" label="Plan">
          <Textarea
            id="note-plan"
            value={fields.plan}
            onChange={(event) => set("plan", event.target.value)}
            maxLength={8000}
          />
        </Field>

        <Field id="note-summary" label="Summary shared with the patient">
          <Input
            id="note-summary"
            value={fields.diagnosisSummary}
            onChange={(event) => set("diagnosisSummary", event.target.value)}
            maxLength={2000}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field id="note-follow-up" label="Follow-up instructions">
            <Textarea
              id="note-follow-up"
              value={fields.followUpInstructions}
              onChange={(event) => set("followUpInstructions", event.target.value)}
              maxLength={4000}
            />
          </Field>
          <Field id="note-follow-up-days" label="After (days)">
            <Input
              id="note-follow-up-days"
              type="number"
              min={0}
              max={3650}
              value={fields.followUpAfterDays}
              onChange={(event) => set("followUpAfterDays", event.target.value)}
            />
          </Field>
        </div>

        <Field id="note-post" label="Post-consultation instructions">
          <Textarea
            id="note-post"
            value={fields.postConsultationInstructions}
            onChange={(event) => set("postConsultationInstructions", event.target.value)}
            maxLength={4000}
          />
        </Field>

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

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void saveDraft()}>
            {busy === "save" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Save aria-hidden />}
            Save draft
          </Button>
          <Button
            type="button"
            disabled={!noteId || busy !== null}
            onClick={() => void finalize()}
            title={noteId ? undefined : "Save the draft before finalising it."}
          >
            {busy === "finalize" ? <LoaderCircle aria-hidden className="animate-spin" /> : <FileSignature aria-hidden />}
            Finalise & sign
          </Button>
        </div>
        {!noteId ? (
          <p className="text-xs text-muted-foreground">
            A note is finalised by signing the saved draft — an empty note is not a clinical record, so the draft has to
            exist first.
          </p>
        ) : null}
      </div>

      {signedNotes.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Signed notes</h3>
          <ul className="space-y-3">
            {signedNotes.map((note) => {
              const copy = CONSULTATION_NOTE_STATUS_COPY[note.status as keyof typeof CONSULTATION_NOTE_STATUS_COPY];
              return (
                <li key={note.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {copy ? <Badge variant={copy.tone}>{copy.label}</Badge> : null}
                      <span className="text-xs text-muted-foreground">
                        {note.finalizedByLabel ?? note.authorLabel ?? "Clinician"}
                        {formatConsultInstant(note.finalizedAt)
                          ? ` · ${formatConsultInstant(note.finalizedAt)}`
                          : ""}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAmendTarget(note);
                        setAmendReason("");
                        setAmendAssessment(note.assessment ?? "");
                        setAmendPlan(note.plan ?? "");
                      }}
                    >
                      <PenLine aria-hidden />
                      Amend
                    </Button>
                  </div>
                  {note.amendmentReason ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Corrects an earlier note. Reason: {note.amendmentReason}
                    </p>
                  ) : null}
                  {note.assessment ? (
                    <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{note.assessment}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {amendTarget ? (
        <div className="space-y-4 rounded-2xl border border-warning/40 bg-warning-soft p-5">
          <p className="text-sm font-semibold">Amend a signed note</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The signed note is never edited. This records a new note that points back at it, and the reason you give is
            shown alongside both.
          </p>
          <Field id="amend-reason" label="Reason for the correction" required>
            <Textarea
              id="amend-reason"
              value={amendReason}
              onChange={(event) => setAmendReason(event.target.value)}
              maxLength={500}
              required
            />
          </Field>
          <Field id="amend-assessment" label="Corrected assessment">
            <Textarea
              id="amend-assessment"
              value={amendAssessment}
              onChange={(event) => setAmendAssessment(event.target.value)}
              maxLength={8000}
            />
          </Field>
          <Field id="amend-plan" label="Corrected plan">
            <Textarea
              id="amend-plan"
              value={amendPlan}
              onChange={(event) => setAmendPlan(event.target.value)}
              maxLength={8000}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={amendReason.trim().length < 4 || busy !== null}
              onClick={() => void amend()}
            >
              {busy === "amend" ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
              Record the amendment
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAmendTarget(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
