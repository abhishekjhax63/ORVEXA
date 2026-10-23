"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { ArrowRight, CircleAlert, RotateCcw, Send, ShieldCheck, Siren, Stethoscope } from "lucide-react";

import { LogoMark } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { aiConversation } from "@/data/content";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

type Sender = "patient" | "assistant";

type Message = { id: string; from: Sender; text: string };

type Turn = { id: string; text: string; suggestions: string[]; final?: boolean };

function textOf(id: string) {
  return aiConversation.find((message) => message.id === id)?.text ?? "";
}

/**
 * The scripted walkthrough re-uses the canonical transcript from `content.ts`
 * so the demo and the homepage showcase can never drift apart. Only the opening
 * greeting and the reply suggestions are added here as UI chrome.
 */
const patientOpener = textOf("msg-1");
const assistantFollowUp = textOf("msg-2");
const patientFollowUp = textOf("msg-3");
const assistantOutcome = textOf("msg-4");

const turns: Turn[] = [
  {
    id: "turn-intro",
    text: "Hello. I am the ORVEXA Health Assistant. I help you decide where to go for care: self-care, a teleconsult, a clinic visit or emergency. I am not a doctor and I do not diagnose. What is going on today?",
    suggestions: [patientOpener, "I have had a dull headache since Monday morning, worse in the sun"],
  },
  {
    id: "turn-followup",
    text: assistantFollowUp,
    suggestions: [patientFollowUp, "It is worse when I lean forward. No blurred vision and no neck stiffness."],
  },
  {
    id: "turn-outcome",
    text: assistantOutcome,
    suggestions: [],
    final: true,
  },
];

const totalSteps = turns.length;

const outcomeReasons = [
  "No red-flag signs were reported: no fever, no blurred vision, no neck stiffness",
  "Pain worsens when bending forward, which narrows the likely speciality",
];

const introMessage: Message = { id: "m-0", from: "assistant", text: turns[0].text };

/** Deterministic, fully client-side triage walkthrough. No network calls. */
function AssistantDemo() {
  const reduceMotion = useReducedMotion();
  const inputId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const [messages, setMessages] = useState<Message[]>([introMessage]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, composing]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function sendReply(raw: string) {
    const text = raw.trim();
    if (!text || composing || done || timerRef.current !== null) return;

    setChoice(text);
    setDraft("");
    setMessages((current) => [...current, { id: `p-${current.length}`, from: "patient", text }]);
    setComposing(true);

    timerRef.current = window.setTimeout(() => {
      const next = turnIndex + 1;
      setMessages((current) => [...current, { id: `a-${current.length}`, from: "assistant", text: turns[next].text }]);
      setTurnIndex(next);
      setChoice(null);
      setComposing(false);
      if (turns[next].final) setDone(true);
      timerRef.current = null;
    }, 650);
  }

  function reset() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMessages([introMessage]);
    setTurnIndex(0);
    setDraft("");
    setComposing(false);
    setChoice(null);
    setDone(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      sendReply(draft);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendReply(draft);
  }

  const deliveredSteps = turnIndex + 1;
  const progressValue = Math.round((deliveredSteps / totalSteps) * 100);
  const suggestions = turns[turnIndex].suggestions;
  const showSuggestions = !done && suggestions.length > 0;

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-[var(--shadow-panel)]">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <LogoMark className="size-9" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">ORVEXA Assistant</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            Scripted walkthrough · English, Hindi, Tamil and more
          </p>
        </div>
        <Badge variant="demo" className="ml-auto shrink-0">
          Scripted
        </Badge>
      </div>

      <div className="border-b border-border bg-warning-soft px-5 py-3">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-warning">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Scripted demo — no AI model is contacted and nothing you type is sent anywhere in Phase 1.
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-2 border-b border-border px-5 py-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Step {deliveredSteps} of {totalSteps}
          </span>
          <span>{done ? "Conversation complete" : "Answer to continue"}</span>
        </div>
        <Progress value={progressValue} aria-label={`Conversation progress: step ${deliveredSteps} of ${totalSteps}`} />
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Assistant conversation"
        tabIndex={0}
        className="max-h-[22rem] min-h-[16rem] overflow-y-auto px-5 py-5 focus-visible:ring-2 focus-visible:ring-ring/40 sm:max-h-[26rem]"
      >
        <ol className="flex flex-col gap-3.5">
          {messages.map((message) => {
            const fromPatient = message.from === "patient";
            return (
              <li
                key={message.id}
                className={cn(
                  "flex animate-fade-in flex-col gap-1.5",
                  fromPatient ? "items-end" : "items-start",
                )}
              >
                <span className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">
                  {fromPatient ? "Patient" : "Assistant"}
                </span>
                <p
                  className={cn(
                    "max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    fromPatient
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md border border-border bg-muted text-foreground",
                  )}
                >
                  {message.text}
                </p>
              </li>
            );
          })}

          {composing ? (
            <li className="flex flex-col gap-1.5 items-start">
              <span className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">Assistant</span>
              <p className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                <span aria-hidden className="flex items-center gap-1">
                  {reduceMotion ? (
                    <span className="text-muted-foreground">…</span>
                  ) : (
                    [0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                        style={{ animationDelay: `${dot * 120}ms` }}
                      />
                    ))
                  )}
                </span>
                <span className="sr-only">Assistant is composing a scripted reply</span>
              </p>
            </li>
          ) : null}
        </ol>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
        {showSuggestions ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested replies">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                aria-pressed={choice === suggestion}
                onClick={() => sendReply(suggestion)}
                disabled={composing}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed",
                  choice === suggestion
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/45 hover:text-primary",
                  composing && choice !== suggestion ? "opacity-55" : "",
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <label htmlFor={inputId} className="sr-only">
            Describe your symptoms or reply
          </label>
          <Input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={composing || done}
            placeholder={done ? "Demo complete — start over to try again" : "Type your reply and press Enter"}
            aria-describedby={`${inputId}-hint`}
            autoComplete="off"
          />
          <Button
            type="submit"
            size="icon"
            variant="gradient"
            disabled={!draft.trim() || composing || done}
            aria-label="Send reply"
          >
            <Send aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={reset}
            aria-label="Start over"
            title="Start over"
          >
            <RotateCcw aria-hidden />
          </Button>
        </form>
        <p id={`${inputId}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          Every reply is stored in this tab only. Refreshing or starting over clears the transcript.
        </p>
      </div>

      {done ? (
        <div className="border-t border-border bg-muted/50 px-5 py-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="warning">See a doctor within 24 hours</Badge>
              <span className="text-xs text-muted-foreground">Routine-urgent, not an emergency</span>
            </div>
            <div>
              <p className="text-sm font-semibold">Triage summary</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {outcomeReasons.map((reason) => (
                  <li key={reason} className="flex items-start gap-2">
                    <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    {reason}
                  </li>
                ))}
                <li className="flex items-start gap-2">
                  <Stethoscope aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  Suggested route: Neurology, or General medicine for the earliest slot
                </li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="gradient" size="sm">
                <Link href="/hospitals?view=doctors">
                  Find a specialist
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="emergency" size="sm">
                <a href={`tel:${siteConfig.emergencyNumber}`}>
                  <Siren aria-hidden />
                  Emergency? Call {siteConfig.emergencyNumber}
                </a>
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={reset}>
                <RotateCcw aria-hidden />
                Start over
              </Button>
            </div>
            <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              This is routing guidance, not a diagnosis. A licensed clinician decides what is actually going on and what
              treatment, if any, you need.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { AssistantDemo };
