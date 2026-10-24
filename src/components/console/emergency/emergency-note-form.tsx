"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { postConsoleJson } from "@/lib/platform/client";

/**
 * An operator's note on one emergency incident.
 *
 * The note is appended to the incident's own timeline as a `NOTE` event and
 * changes nothing else: it cannot move the status, acknowledge a request or
 * dispatch anything. The copy below says so explicitly, because recording "I
 * called the control room" is not the same act as the control room answering.
 */
export function EmergencyNoteForm({ incidentId, reference }: { incidentId: string; reference: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldError(undefined);
    setDone(false);

    const result = await postConsoleJson<{ incidentId: string; noteId: string }>(
      `/api/admin/emergency/incidents/${encodeURIComponent(incidentId)}/notes`,
      { note },
    );

    setPending(false);
    if (!result.ok) {
      const noteError = result.fieldErrors?.note;
      setFieldError(noteError);
      setError(noteError ? null : result.error);
      return;
    }

    setNote("");
    setDone(true);
    // The note is part of the incident's timeline, so the timeline is re-read
    // from the server rather than patched in the browser.
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field
        id="emergency-operator-note"
        label="Operator note"
        required
        description={`Appended to ${reference}'s timeline as a note. It cannot change this incident's status or dispatch state, and it does not acknowledge or dispatch anything.`}
        error={fieldError}
      >
        <Textarea
          id="emergency-operator-note"
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-describedby="emergency-operator-note-description"
          required
          minLength={3}
          maxLength={2000}
          placeholder="e.g. Called the ambulance control room at 14:20; they are sending a unit."
        />
      </Field>
      {error ? (
        <p role="alert" className="text-xs font-medium text-emergency">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-xs font-medium text-success">
          Note added to the incident timeline.
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pending || note.trim().length < 3}>
          {pending ? "Adding…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
