import Link from "next/link";
import {
  Activity,
  CircleAlert,
  Clock,
  Compass,
  FileWarning,
  Info,
  PhoneCall,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssessmentView, RedFlagView, UnavailableStateView } from "@/lib/ai/view";
import { cn } from "@/lib/utils";

/**
 * The one renderer for an assessment.
 *
 * Used by the live turn, the history page and the page behind a clinician share
 * link, so the three can never describe the same assessment differently. It is
 * server-safe as well as client-safe: it holds no hooks and reads nothing but
 * its props.
 *
 * Two rules it exists to enforce:
 *
 *  - The limitations notice and the safety line are always rendered, never
 *    conditional on tone. An assessment that reads reassuring must still carry
 *    the sentence that says it is not a diagnosis.
 *  - Nothing here is inferred. If a field is empty the section is absent rather
 *    than filled with a plausible default.
 */

const TIMEFRAME_LABELS: Record<string, string> = {
  now: "Now",
  today: "Today",
  within_48_hours: "Within 48 hours",
  if_worse: "If it gets worse",
};

const LIKELIHOOD_LABELS: Record<string, string> = {
  common: "Common",
  possible: "Possible",
  uncommon: "Uncommon",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  low: "low confidence",
  medium: "moderate confidence",
  high: "reasonably clear",
};

function AssessmentReport({
  assessment,
  className,
  actions,
  title = "Preliminary assessment",
}: {
  assessment: AssessmentView;
  className?: string;
  actions?: React.ReactNode;
  title?: string;
}) {
  const urgency = assessment.urgencyTone;

  return (
    <article className={cn("space-y-6", className)} aria-labelledby="assessment-heading">
      <Card className={cn(urgency === "emergency" && "border-emergency/50")}>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={urgency === "neutral" ? "neutral" : urgency}>{assessment.urgencyLabel}</Badge>
            {assessment.isDegraded ? (
              <Badge variant="warning">
                <TriangleAlert aria-hidden />
                Fixed rules, not a model
              </Badge>
            ) : null}
            {assessment.savedAt ? <Badge variant="success">Saved</Badge> : null}
            <Badge variant="neutral">{assessment.languageLabel}</Badge>
          </div>
          <CardTitle id="assessment-heading" className="pt-2 text-2xl">
            {title}
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed">{assessment.urgencySummary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-relaxed font-medium">{assessment.urgencyAction}</p>

          {assessment.modelUrgency && assessment.modelUrgency !== assessment.urgency ? (
            <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-xs leading-relaxed text-warning">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                The assistant suggested <strong className="font-semibold">{assessment.modelUrgency}</strong>; ORVEXA&apos;s
                safety rules set this to <strong className="font-semibold">{assessment.urgencyLabel}</strong>.
                {assessment.overrideReason ? ` ${assessment.overrideReason}` : ""}
              </span>
            </p>
          ) : null}

          {assessment.redFlags.length > 0 ? <RedFlags flags={assessment.redFlags} /> : null}

          {assessment.emergencyRecommended ? (
            <div className="space-y-3 rounded-2xl border-2 border-emergency/50 bg-emergency-soft p-4 sm:p-5">
              <p className="flex items-start gap-2 text-sm leading-relaxed font-semibold text-emergency">
                <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
                This needs emergency care now. Do not wait for a reply on this page.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="emergency">
                  <Link href="/emergency">
                    <PhoneCall aria-hidden />
                    Emergency help and the numbers to call
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/emergency/nearby">
                    <Compass aria-hidden />
                    Hospitals near me
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}

          {actions ? <div className="flex flex-wrap gap-3 border-t border-border pt-5">{actions}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles aria-hidden className="size-4 text-primary" />
            What this describes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-relaxed">{assessment.summary}</p>

          {assessment.possibleCauses.length > 0 ? (
            <section aria-labelledby="causes-heading" className="space-y-3">
              <h3 id="causes-heading" className="text-sm font-semibold">
                Possible explanations
              </h3>
              <ul className="space-y-2.5">
                {assessment.possibleCauses.map((cause) => (
                  <li key={cause.label} className="rounded-xl border border-border bg-muted/30 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{cause.label}</span>
                      <Badge variant="outline">{LIKELIHOOD_LABELS[cause.likelihood] ?? cause.likelihood}</Badge>
                    </div>
                    {cause.note ? <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{cause.note}</p> : null}
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-muted-foreground">
                These are possibilities to discuss with a clinician, not a diagnosis. Only a clinician who examines you can
                narrow them down.
              </p>
            </section>
          ) : null}

          {assessment.warningSigns.length > 0 ? (
            <section aria-labelledby="warning-heading" className="space-y-3">
              <h3 id="warning-heading" className="flex items-center gap-2 text-sm font-semibold">
                <TriangleAlert aria-hidden className="size-4 text-warning" />
                Warning signs to watch for
              </h3>
              <ul className="space-y-2.5">
                {assessment.warningSigns.map((sign) => (
                  <li key={sign.label} className="rounded-xl border border-warning/35 bg-warning-soft/60 p-3.5">
                    <p className="text-sm font-medium">{sign.label}</p>
                    {sign.detail ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{sign.detail}</p> : null}
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-muted-foreground">
                If any of these appear, treat them as more important than anything reassuring on this page.
              </p>
            </section>
          ) : null}

          {assessment.recommendedSteps.length > 0 ? (
            <section aria-labelledby="steps-heading" className="space-y-3">
              <h3 id="steps-heading" className="flex items-center gap-2 text-sm font-semibold">
                <Stethoscope aria-hidden className="size-4 text-primary" />
                Suggested next steps
              </h3>
              <ol className="space-y-2.5">
                {assessment.recommendedSteps.map((step) => (
                  <li key={step.title} className="rounded-xl border border-border p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{step.title}</span>
                      <Badge variant="neutral">
                        <Clock aria-hidden />
                        {TIMEFRAME_LABELS[step.timeframe] ?? step.timeframe}
                      </Badge>
                    </div>
                    {step.detail ? <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.detail}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {assessment.clarifyingQuestions.length > 0 ? (
            <section aria-labelledby="questions-heading" className="space-y-3">
              <h3 id="questions-heading" className="text-sm font-semibold">
                Worth answering in a follow-up
              </h3>
              <ul className="space-y-2.5">
                {assessment.clarifyingQuestions.map((question) => (
                  <li key={question.question} className="rounded-xl border border-dashed border-border p-3.5">
                    <p className="text-sm font-medium">{question.question}</p>
                    {question.why ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{question.why}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {assessment.selfCareGuidance ? (
            <section aria-labelledby="selfcare-heading" className="space-y-2">
              <h3 id="selfcare-heading" className="text-sm font-semibold">
                General self-care
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{assessment.selfCareGuidance}</p>
            </section>
          ) : null}
        </CardContent>
      </Card>

      {assessment.mediaObservations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What was read from your files</CardTitle>
            <CardDescription>
              Limited to what the model reported seeing, with its own stated confidence. It is not a reading of the image
              or scan itself.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {assessment.mediaObservations.map((observation) => (
                <li key={`${observation.label}-${observation.observation}`} className="rounded-xl border border-border p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{observation.label}</span>
                    <Badge variant="outline">{CONFIDENCE_LABELS[observation.confidence] ?? observation.confidence}</Badge>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{observation.observation}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {assessment.withheld.length > 0 ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileWarning aria-hidden className="size-4 text-warning" />
              Files that were not analysed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {assessment.withheld.map((file) => (
                <li key={file.fileName} className="rounded-xl border border-warning/35 bg-warning-soft/60 p-3.5">
                  <p className="text-sm font-medium">{file.fileName}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{file.reason}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {assessment.medicationRefused ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Pill aria-hidden className="size-4 text-warning" />
              About medicines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">
              This assistant does not choose medicines, doses or regimens, and it will not start, stop or change a
              treatment. That decision belongs to a clinician who knows your history, your other medicines and your
              allergies.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              If you are already taking something prescribed, do not change it based on this page. If you think a
              medicine is causing a problem, contact the prescriber or a pharmacist.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info aria-hidden className="size-4 text-muted-foreground" />
            What this is and is not
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {assessment.uncertaintyNotes ? (
            <p className="text-sm leading-relaxed">
              <span className="font-medium">Uncertainty. </span>
              {assessment.uncertaintyNotes}
            </p>
          ) : null}
          <p className="text-sm leading-relaxed text-muted-foreground">{assessment.limitationsNotice}</p>
          {assessment.safetyLine ? (
            <p className="flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency-soft px-4 py-3 text-sm leading-relaxed font-medium text-emergency">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {assessment.safetyLine}
            </p>
          ) : null}
          {assessment.clinicalReviewRequired ? (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              This assessment is flagged for clinician review.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Activity aria-hidden className="size-3.5" />
          {assessment.provider ?? "no provider"}
        </span>
        {assessment.model ? <span className="font-mono">{assessment.model}</span> : null}
        {assessment.promptVersion ? <span className="font-mono">{assessment.promptVersion}</span> : null}
        {assessment.safetyPolicyVersion ? <span className="font-mono">{assessment.safetyPolicyVersion}</span> : null}
      </p>
    </article>
  );
}

function RedFlags({ flags }: { flags: RedFlagView[] }) {
  return (
    <section
      aria-labelledby="redflags-heading"
      className="space-y-3 rounded-2xl border border-emergency/50 bg-emergency-soft p-4 sm:p-5"
    >
      <h3 id="redflags-heading" className="flex items-center gap-2 text-sm font-semibold text-emergency">
        <TriangleAlert aria-hidden className="size-4" />
        Emergency warning signs were detected
      </h3>
      <ul className="space-y-2">
        {flags.map((flag) => (
          <li key={flag.code} className="text-sm leading-relaxed">
            <span className="font-medium">{flag.label}</span>
            {flag.rationale ? <span className="text-emergency/90"> — {flag.rationale}</span> : null}
            {flag.evidence ? <span className="block text-xs text-muted-foreground">{flag.evidence}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The honest state for an assistant that cannot run.
 *
 * Deliberately not an error toast. With no provider configured there is no
 * assistant, and a chat box that looks like it is thinking would be a lie. This
 * panel says which capabilities are available on this deployment and which are
 * not, and it never shows sample medical content.
 */
const CAPABILITY_LABELS: Record<string, string> = {
  TEXT: "Reading a typed description",
  VISION_IMAGE: "Reading photos",
  VIDEO: "Reading video",
  AUDIO_TRANSCRIPTION: "Transcribing voice notes",
  DOCUMENT: "Reading reports and documents",
};

function UnavailablePanel({ state, className }: { state: UnavailableStateView; className?: string }) {
  return (
    <Card className={cn("border-warning/45", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TriangleAlert aria-hidden className="size-4 text-warning" />
          The health assistant is not available
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed">{state.message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="rounded-xl border border-dashed border-warning/40 bg-warning-soft px-4 py-3 text-xs leading-relaxed text-warning">
          Nothing you wrote or uploaded here was analysed, and no assessment was produced. This is not a result — it is the
          absence of one.
        </p>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-3.5">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Available</dt>
            <dd className="mt-1.5 text-sm">
              {state.available.length === 0 ? (
                <span className="text-muted-foreground">Nothing on this deployment.</span>
              ) : (
                <ul className="space-y-1">
                  {state.available.map((capability) => (
                    <li key={capability}>{CAPABILITY_LABELS[capability] ?? capability}</li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div className="rounded-xl border border-border p-3.5">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Not available</dt>
            <dd className="mt-1.5 space-y-1 text-sm">
              {state.unavailable.length === 0 ? (
                <span className="text-muted-foreground">Nothing excluded.</span>
              ) : (
                <ul className="space-y-2">
                  {state.unavailable.map((entry) => (
                    <li key={entry.capability}>
                      <span className="font-medium">{CAPABILITY_LABELS[entry.capability] ?? entry.capability}</span>
                      <span className="block text-xs text-muted-foreground">{entry.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>

        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm leading-relaxed">
            If this is happening now, or gets worse, do not wait for an assistant to come back. Call emergency services or
            go to the nearest emergency department.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="emergency">
              <Link href="/emergency">
                <PhoneCall aria-hidden />
                Emergency help
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/hospitals">
                <Compass aria-hidden />
                Find care nearby
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { AssessmentReport, UnavailablePanel };
