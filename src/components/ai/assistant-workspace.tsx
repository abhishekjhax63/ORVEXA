"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  Camera,
  CircleAlert,
  FileText,
  ImageIcon,
  Info,
  LoaderCircle,
  Mic,
  Paperclip,
  Printer,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  Video,
} from "lucide-react";

import { AssessmentReport, UnavailablePanel } from "@/components/ai/assessment-report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  AI_CONSENT_POLICY_VERSION,
  AI_LANGUAGES,
  AI_LIMITATIONS_NOTICE,
  AI_SCOPE_STATEMENT,
  EXTRACTION_COPY,
  MALWARE_SCAN_COPY,
  MIME_TO_UPLOAD_KIND,
  UPLOAD_KIND_HELP,
  UPLOAD_KIND_LABELS,
  UPLOAD_LIMITS,
  uploadAcceptAttribute,
} from "@/lib/ai/capabilities";
import { deleteAi, postAiForm, postAiJson } from "@/lib/ai/client";
import { formatBytes } from "@/lib/ai/validation";
import type { AssessmentView, UnavailableStateView, UploadView } from "@/lib/ai/view";
import { cn } from "@/lib/utils";

/**
 * The AI health workspace.
 *
 * The whole component is built around one rule: it may only ever display what
 * the server returned. There is no local scoring, no fallback urgency and no
 * canned assessment — a failed turn shows the failure, and an unconfigured
 * deployment shows the honesty panel instead of an empty chat box.
 *
 * Storage is the user's decision, not a default. The consent switch creates a
 * stored conversation, and turning it back off deletes that conversation and
 * everything derived from it, so the switch means what it says in both
 * directions.
 */

type TurnPayload = {
  assessment: AssessmentView;
  conversationId: string | null;
  ephemeral: boolean;
};

type ClinicalContext = {
  ageRange: string;
  sexAtBirth: string;
  symptomDuration: string;
  symptomOnset: string;
  historyNotes: string;
  currentMedications: string;
  allergies: string;
};

const EMPTY_CONTEXT: ClinicalContext = {
  ageRange: "",
  sexAtBirth: "",
  symptomDuration: "",
  symptomOnset: "",
  historyNotes: "",
  currentMedications: "",
  allergies: "",
};

const AGE_RANGES = [
  "Under 1 year",
  "1–4 years",
  "5–12 years",
  "13–17 years",
  "18–39 years",
  "40–64 years",
  "65 years or older",
];

const DURATIONS = [
  "Started today",
  "1–2 days",
  "3–7 days",
  "1–4 weeks",
  "More than a month",
  "Comes and goes",
];

const EPHEMERAL_NOTICE =
  "This assessment is not being stored. Nothing you wrote was kept, and follow-up questions need a stored conversation.";

const KIND_ICONS = { IMAGE: ImageIcon, VIDEO: Video, DOCUMENT: FileText, AUDIO: AudioLines } as const;

function AssistantWorkspace({
  initialUnavailable,
  signedIn,
}: {
  initialUnavailable: UnavailableStateView | null;
  signedIn: boolean;
}) {
  const ids = {
    statement: useId(),
    language: useId(),
    file: useId(),
    camera: useId(),
    context: useId(),
  };

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  const [statement, setStatement] = useState("");
  const [context, setContext] = useState<ClinicalContext>(EMPTY_CONTEXT);
  const [uploads, setUploads] = useState<UploadView[]>([]);
  const [assessment, setAssessment] = useState<AssessmentView | null>(null);
  const [unavailable, setUnavailable] = useState<UnavailableStateView | null>(initialUnavailable);
  const [ephemeralNotice, setEphemeralNotice] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "consent" | "turn" | "upload" | "voice" | "save" | "share" | "review">(
    null,
  );
  const [recording, setRecording] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareResult, setShareResult] = useState<{ url: string; expiresAt: string; recipientLabel: string } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stored = conversationId !== null;
  const followUp = assessment !== null && stored;
  const canSubmit = statement.trim().length >= 3 && busy === null;

  // --- Storage consent ------------------------------------------------------

  async function toggleConsent(next: boolean) {
    setError(null);
    setBusy("consent");

    if (next) {
      const result = await postAiJson<{ conversation: { id: string } }>("/api/assistant/conversations", {
        language,
        consentToStore: true,
        consentPolicyVersion: AI_CONSENT_POLICY_VERSION,
      });
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConversationId(result.data.conversation.id);
      return;
    }

    // Turning storage off has to mean deletion, or the switch would be a lie.
    if (conversationId) {
      const result = await deleteAi<{ removedObjects: number; storageUnavailable: boolean }>(
        `/api/assistant/conversations/${conversationId}`,
        { conversationId, confirm: "delete" },
      );
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.storageUnavailable) {
        setError(
          "The conversation was marked deleted, but the stored files could not be removed because object storage is not configured on this deployment. Nothing further will be read from them.",
        );
      }
    } else {
      setBusy(null);
    }

    setConversationId(null);
    setUploads([]);
    setAssessment(null);
    setShareResult(null);
    setShareOpen(false);
  }

  // --- Voice notes ----------------------------------------------------------

  async function startRecording() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record audio, so no voice note was captured. Type your symptoms instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void finishRecording();
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Microphone access was refused, so nothing was recorded. Type your symptoms instead.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function finishRecording() {
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const blob = new Blob(chunks, { type: "audio/webm" });
    if (blob.size === 0) return;

    setBusy("voice");
    setVoiceNotice(null);
    const form = new FormData();
    form.set("audio", new File([blob], "voice-note.webm", { type: blob.type }));
    form.set("language", language);
    if (conversationId) form.set("conversationId", conversationId);

    const result = await postAiForm<{ transcript: string | null; notice?: string }>("/api/assistant/transcribe", form);
    setBusy(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!result.data.transcript) {
      setVoiceNotice(result.data.notice ?? "A transcript could not be produced. Type your symptoms instead.");
      return;
    }
    const transcript = result.data.transcript;
    setStatement((previous) => (previous.trim() ? `${previous.trim()}\n\n${transcript}` : transcript));
    setVoiceNotice("Voice note transcribed. Read it back and correct anything it got wrong before sending.");
  }

  // --- Attachments ----------------------------------------------------------

  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const kind = MIME_TO_UPLOAD_KIND[file.type];
    if (!kind) {
      setError("That file type is not supported. Choose a JPEG, PNG, or WebP image, PDF or text document, audio, or short video.");
      return;
    }
    const fileLimit = Math.min(UPLOAD_LIMITS.maxFileBytes, UPLOAD_LIMITS.maxPerKindBytes[kind]);
    if (file.size <= 0 || file.size > fileLimit) {
      setError(`That file must be non-empty and no larger than ${formatBytes(fileLimit)}.`);
      return;
    }

    if (!conversationId) {
      setError("Attaching a file needs a stored conversation. Turn on “Store this conversation” first.");
      return;
    }

    setBusy("upload");
    setError(null);
    const form = new FormData();
    form.set("conversationId", conversationId);
    form.set("file", file);

    const result = await postAiForm<{ upload: UploadView }>("/api/assistant/uploads", form);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUploads((previous) => [...previous, result.data.upload]);
  }

  async function removeUpload(uploadId: string) {
    const result = await deleteAi<{ removed: boolean }>(`/api/assistant/uploads?uploadId=${encodeURIComponent(uploadId)}`);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUploads((previous) => previous.filter((upload) => upload.id !== uploadId));
  }

  // --- The turn -------------------------------------------------------------

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy("turn");
    setError(null);
    setVoiceNotice(null);
    setEphemeralNotice(null);

    const result = await postAiJson<TurnPayload>("/api/assistant/turns", {
      conversationId: conversationId ?? undefined,
      statement: statement.trim(),
      language,
      followUp,
      clinical: context,
      uploadIds: uploads.map((upload) => upload.id),
      consentToStore: stored,
      consentPolicyVersion: AI_CONSENT_POLICY_VERSION,
    });

    setBusy(null);

    if (!result.ok) {
      if (result.unavailable) setUnavailable(result.unavailable);
      setError(result.error);
      return;
    }

    setUnavailable(null);
    setAssessment(result.data.assessment);
    if (result.data.conversationId) setConversationId(result.data.conversationId);
    setEphemeralNotice(result.data.ephemeral ? EPHEMERAL_NOTICE : null);
    setStatement("");
    setUploads([]);
    setShareOpen(false);
    setShareResult(null);
  }

  // --- Acting on an assessment ---------------------------------------------

  async function saveAssessment() {
    if (!assessment?.id) return;
    setBusy("save");
    setError(null);
    const result = await postAiJson<{ assessment: AssessmentView }>(
      `/api/assistant/assessments/${assessment.id}/save`,
      { assessmentId: assessment.id, consentToStore: true, consentPolicyVersion: AI_CONSENT_POLICY_VERSION },
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAssessment(result.data.assessment);
  }

  async function requestReview() {
    if (!assessment?.id) return;
    setBusy("review");
    setError(null);
    const result = await postAiJson<{ reviewId: string }>("/api/assistant/reviews", { assessmentId: assessment.id });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAssessment((previous) => (previous ? { ...previous, clinicalReviewRequired: true } : previous));
  }

  async function shareAssessment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assessment?.id) return;
    const form = new FormData(event.currentTarget);
    if (form.get("consentToShare") !== "on") {
      setError("Tick the sharing consent box, or nothing will be sent outside your account.");
      return;
    }

    setBusy("share");
    setError(null);
    const result = await postAiJson<{ share: { url: string; expiresAt: string; recipientLabel: string } }>(
      `/api/assistant/assessments/${assessment.id}/share`,
      {
        assessmentId: assessment.id,
        recipientLabel: form.get("recipientLabel"),
        recipientEmail: form.get("recipientEmail") ?? "",
        consentToShare: true,
        consentPolicyVersion: AI_CONSENT_POLICY_VERSION,
      },
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShareResult(result.data.share);
  }

  // --- Render ---------------------------------------------------------------

  if (unavailable && !assessment) {
    return (
      <div className="space-y-6">
        <ScopeBanner />
        <UnavailablePanel state={unavailable} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ScopeBanner />

      {!signedIn ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-lg">Sign in to use the assistant</CardTitle>
            <CardDescription>
              Assessments are tied to your account so consent, retention and deletion all have an owner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login?next=%2Fassistant">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck aria-hidden className="size-4 text-primary" />
            Storage and consent
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            You choose whether this conversation is kept. Nothing is stored until you switch this on, and switching it off
            deletes the conversation and its files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4",
              busy === "consent" && "opacity-70",
            )}
          >
            <Checkbox
              checked={stored}
              disabled={busy !== null || !signedIn}
              onCheckedChange={(checked) => void toggleConsent(checked === true)}
              className="mt-0.5"
              aria-label="Store this conversation"
            />
            <span className="space-y-1 text-sm">
              <span className="block font-medium">Store this conversation</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                Keeps the description, the files you attach and the assessments so you can come back to them and share a
                report with a clinician. Deleting removes both the rows and the stored files.
              </span>
            </span>
          </label>

          {!stored ? (
            <p className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              Without storage you can still describe symptoms and get an assessment, but you cannot attach a photo or a
              report, and you cannot ask follow-up questions.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles aria-hidden className="size-4 text-primary" />
              {followUp ? "Ask a follow-up" : "Describe what is happening"}
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              {followUp
                ? "The assistant answers with the earlier turns in this conversation in mind."
                : "Write it in your own words. There is no right way to phrase it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field id={ids.statement} label="What is happening?" required>
              <Textarea
                id={ids.statement}
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
                maxLength={4000}
                rows={5}
                placeholder="For example: a burning rash on my forearm for three days, worse in the sun. No fever."
                aria-describedby={ids.statement + "-hint"}
                disabled={!signedIn || busy === "turn"}
              />
              <p id={ids.statement + "-hint"} className="text-xs text-muted-foreground">
                {statement.trim().length}/4000 characters. Include how long it has lasted and anything that makes it better
                or worse.
              </p>
            </Field>

            <div className="flex flex-wrap items-center gap-3">
              {recording ? (
                <Button type="button" variant="emergency" onClick={stopRecording}>
                  <Square aria-hidden />
                  Stop and transcribe
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => void startRecording()} disabled={!signedIn || busy !== null}>
                  {busy === "voice" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Mic aria-hidden />}
                  {busy === "voice" ? "Transcribing…" : "Describe it by voice"}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                A voice note is transcribed into the box above. Read it back before sending.
              </p>
            </div>

            {voiceNotice ? (
              <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                {voiceNotice}
              </p>
            ) : null}

            <Field id={ids.language} label="Language of the explanation">
              <Select
                id={ids.language}
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                disabled={stored}
              >
                {AI_LANGUAGES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label} — {option.endonym}
                    {option.reviewed ? "" : " (not yet clinically reviewed)"}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {stored
                  ? "The language was fixed when the conversation was stored. Turn storage off to change it."
                  : "Only English wording has been through clinical review so far. Other languages are translated by the model and marked as such."}
              </p>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Clinical context</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Optional, but it makes the assessment more relevant. Leave anything you would rather not share blank.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-primary marker:content-none">
                Add age, duration, history and medicines
              </summary>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field id={ids.context + "-age"} label="Age range">
                  <Select
                    id={ids.context + "-age"}
                    value={context.ageRange}
                    onChange={(event) => setContext({ ...context, ageRange: event.target.value })}
                  >
                    <option value="">Prefer not to say</option>
                    {AGE_RANGES.map((range) => (
                      <option key={range} value={range}>
                        {range}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field id={ids.context + "-sex"} label="Sex at birth">
                  <Select
                    id={ids.context + "-sex"}
                    value={context.sexAtBirth}
                    onChange={(event) => setContext({ ...context, sexAtBirth: event.target.value })}
                  >
                    <option value="">Prefer not to say</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Intersex">Intersex</option>
                  </Select>
                </Field>

                <Field id={ids.context + "-duration"} label="How long has this lasted?">
                  <Select
                    id={ids.context + "-duration"}
                    value={context.symptomDuration}
                    onChange={(event) => setContext({ ...context, symptomDuration: event.target.value })}
                  >
                    <option value="">Not sure</option>
                    {DURATIONS.map((duration) => (
                      <option key={duration} value={duration}>
                        {duration}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field id={ids.context + "-onset"} label="How did it start?">
                  <Input
                    id={ids.context + "-onset"}
                    value={context.symptomOnset}
                    onChange={(event) => setContext({ ...context, symptomOnset: event.target.value })}
                    placeholder="Suddenly, gradually, after an injury…"
                    maxLength={120}
                  />
                </Field>

                <Field
                  id={ids.context + "-history"}
                  label="Relevant history"
                  className="sm:col-span-2"
                  description="Conditions a clinician would want to know about."
                >
                  <Textarea
                    id={ids.context + "-history"}
                    value={context.historyNotes}
                    onChange={(event) => setContext({ ...context, historyNotes: event.target.value })}
                    rows={3}
                    maxLength={2000}
                  />
                </Field>

                <Field
                  id={ids.context + "-meds"}
                  label="Current medicines"
                  description="List what you take. The assistant will not change any of it."
                >
                  <Textarea
                    id={ids.context + "-meds"}
                    value={context.currentMedications}
                    onChange={(event) => setContext({ ...context, currentMedications: event.target.value })}
                    rows={3}
                    maxLength={2000}
                  />
                </Field>

                <Field id={ids.context + "-allergies"} label="Allergies">
                  <Textarea
                    id={ids.context + "-allergies"}
                    value={context.allergies}
                    onChange={(event) => setContext({ ...context, allergies: event.target.value })}
                    rows={3}
                    maxLength={1000}
                  />
                </Field>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Photos, reports and short videos</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              {stored
                ? `Up to ${UPLOAD_LIMITS.maxFilesPerTurn} files per question. Images are limited to ${formatBytes(UPLOAD_LIMITS.maxPerKindBytes.IMAGE)}; other file limits vary by type. Remove or replace files before sending.`
                : "Attaching files needs a stored conversation, so storage has to be on first."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" disabled={!stored || busy !== null || !signedIn}>
                <label htmlFor={ids.file} className={cn(!stored && "pointer-events-none opacity-55")}>
                  {busy === "upload" ? <LoaderCircle aria-hidden className="animate-spin" /> : <ImageIcon aria-hidden />}
                  {busy === "upload" ? "Uploading…" : "Upload image or report"}
                </label>
              </Button>
              <input
                id={ids.file}
                type="file"
                className="sr-only"
                accept={uploadAcceptAttribute()}
                onChange={(event) => void chooseFile(event)}
                disabled={!stored || busy !== null || !signedIn}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => cameraInputRef.current?.click()}
                disabled={!stored || busy !== null || !signedIn}
              >
                <Camera aria-hidden />
                Take a photo
              </Button>
              <input
                ref={cameraInputRef}
                id={ids.camera}
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(event) => void chooseFile(event)}
                disabled={!stored || busy !== null || !signedIn}
              />
              <p className="text-xs text-muted-foreground">
                Examples: a skin change, visible cut, burn, swelling, or a medical report. Review the preview and scan status before asking; image output is not a diagnosis. If scanning is not configured, the upload is clearly labeled unscanned.
              </p>
            </div>

            {uploads.length > 0 ? (
              <ul className="space-y-3">
                {uploads.map((upload) => (
                  <UploadRow key={upload.id} upload={upload} onRemove={() => void removeUpload(upload.id)} />
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency-soft px-4 py-3 text-sm leading-relaxed font-medium text-emergency"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={!canSubmit || !signedIn}>
            {busy === "turn" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
            {busy === "turn" ? "Working…" : followUp ? "Ask the follow-up" : "Get a preliminary assessment"}
          </Button>
          <p className="text-xs text-muted-foreground">{AI_SCOPE_STATEMENT}</p>
        </div>
      </form>

      {ephemeralNotice ? (
        <p className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {ephemeralNotice}
        </p>
      ) : null}

      {assessment ? (
        <AssessmentReport
          assessment={assessment}
          title={followUp ? "Follow-up assessment" : "Preliminary assessment"}
          actions={
            <>
              {assessment.id && !assessment.savedAt ? (
                <Button type="button" variant="outline" onClick={() => void saveAssessment()} disabled={busy !== null}>
                  {busy === "save" ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
                  Save this assessment
                </Button>
              ) : null}
              {assessment.id ? (
                <Button type="button" variant="outline" onClick={() => void requestReview()} disabled={busy !== null}>
                  {busy === "review" ? <LoaderCircle aria-hidden className="animate-spin" /> : <ShieldCheck aria-hidden />}
                  Ask a clinician to review this
                </Button>
              ) : null}
              {assessment.id ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShareOpen((open) => !open)}
                  disabled={busy !== null}
                >
                  <Paperclip aria-hidden />
                  Share with a clinician
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => window.print()}>
                <Printer aria-hidden />
                Print or save as PDF
              </Button>
            </>
          }
        />
      ) : null}

      {shareOpen && assessment?.id ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Share this report</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              This creates a link that works without an account, so it is long, expiring and revocable. Only send it to a
              clinician or clinic you intend to share with.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={shareAssessment} className="space-y-5">
              <Field id="share-recipient" label="Who is this for?" required>
                <Input id="share-recipient" name="recipientLabel" maxLength={120} required placeholder="Dr A. Sharma — Sunrise Clinic" />
              </Field>
              <Field id="share-email" label="Their email (optional)">
                <Input id="share-email" name="recipientEmail" type="email" maxLength={200} placeholder="clinician@example.com" />
              </Field>
              <label className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm">
                <input type="checkbox" name="consentToShare" className="mt-0.5 size-4" />
                <span>
                  I agree to send this report, including what I wrote and the observations read from my files, to the person
                  named above.
                </span>
              </label>
              <Button type="submit" disabled={busy !== null}>
                {busy === "share" ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
                Create the link
              </Button>
            </form>

            {shareResult ? (
              <div className="space-y-2 rounded-xl border border-success/40 bg-success-soft p-4">
                <p className="text-sm font-medium text-success">A link for {shareResult.recipientLabel} was created.</p>
                <p className="font-mono text-xs break-all">{shareResult.url}</p>
                <p className="text-xs text-muted-foreground">
                  It stops working on {new Date(shareResult.expiresAt).toLocaleString()}, or as soon as you delete this
                  conversation.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function UploadRow({ upload, onRemove }: { upload: UploadView; onRemove: () => void }) {
  const Icon = KIND_ICONS[upload.kind];
  const scan = MALWARE_SCAN_COPY[upload.malwareScan];
  const extraction = EXTRACTION_COPY[upload.extraction];

  return (
    <li className="flex flex-wrap items-start gap-4 rounded-xl border border-border p-3.5">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{upload.fileName}</span>
          <Badge variant="neutral">{UPLOAD_KIND_LABELS[upload.kind]}</Badge>
          <span className="text-xs text-muted-foreground">{formatBytes(upload.sizeBytes)}</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {UPLOAD_KIND_HELP[upload.kind]} · {scan.label} · {extraction.label}
        </p>
        {scan.tone !== "success" ? <p className="text-xs leading-relaxed text-warning">{scan.detail}</p> : null}
        {upload.extractionNotes ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{upload.extractionNotes}</p>
        ) : null}
        {upload.transcript ? (
          <p className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs leading-relaxed">
            <span className="font-medium">Transcript: </span>
            {upload.transcript}
          </p>
        ) : null}
      </div>

      {upload.previewUrl && upload.kind === "IMAGE" ? (
        // A short-lived signed URL. It is not a public asset: it expires within
        // minutes and only exists for the duration of this preview.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={upload.previewUrl}
          alt={`Preview of ${upload.fileName}`}
          className="size-20 shrink-0 rounded-lg border border-border object-cover"
        />
      ) : null}

      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${upload.fileName}`}>
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}

function ScopeBanner() {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card/70 p-5">
      <p className="flex items-start gap-2 text-sm leading-relaxed font-medium">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        This assistant is not a doctor and cannot diagnose you.
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">{AI_SCOPE_STATEMENT}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{AI_LIMITATIONS_NOTICE}</p>
    </div>
  );
}

export { AssistantWorkspace };
