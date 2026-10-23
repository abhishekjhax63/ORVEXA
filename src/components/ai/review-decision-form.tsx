"use client";

import { useId, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/input";
import { postAiJson } from "@/lib/ai/client";

/**
 * A reviewer's decision on one queued assessment.
 *
 * The notes are a required field rather than an optional comment: a decision
 * without reasoning is a label the user cannot act on, and the notes are the
 * part they actually read. The reviewer's identity is taken from the session on
 * the server, never from this form.
 */

const DECISIONS = [
  { value: "AGREE", label: "Agree with the assessment" },
  { value: "RAISE_URGENCY", label: "Raise the urgency" },
  { value: "LOWER_URGENCY", label: "Lower the urgency" },
  { value: "SEE_CLINICIAN", label: "Advise seeing a clinician" },
  { value: "NEEDS_MORE_INFORMATION", label: "Needs more information" },
];

function ReviewDecisionForm({
  reviewId,
  reference,
  onDecided,
}: {
  reviewId: string;
  reference: string;
  onDecided?: () => void;
}) {
  const ids = { decision: useId(), notes: useId() };
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const result = await postAiJson<{ reviewId: string }>(`/api/assistant/reviews/${reviewId}/decision`, {
      reviewId,
      decision: form.get("decision"),
      reviewNotes: form.get("reviewNotes"),
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    onDecided?.();
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ShieldCheck aria-hidden />
        Record a decision
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-xs text-muted-foreground">
        Deciding on reference <span className="font-mono font-medium text-foreground">{reference}</span>. Your notes are
        shown to the person who asked for the review.
      </p>

      <Field id={ids.decision} label="Decision">
        <Select id={ids.decision} name="decision" defaultValue="AGREE" required>
          {DECISIONS.map((decision) => (
            <option key={decision.value} value={decision.value}>
              {decision.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field id={ids.notes} label="What you reviewed and concluded" required>
        <Textarea
          id={ids.notes}
          name="reviewNotes"
          rows={4}
          minLength={10}
          required
          maxLength={4000}
          placeholder="Describe what you checked and what you would advise."
        />
      </Field>

      {error ? (
        <p role="alert" className="text-xs font-medium text-emergency">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
          Submit decision
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export { ReviewDecisionForm };
