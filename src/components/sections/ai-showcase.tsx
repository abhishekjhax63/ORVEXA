import Link from "next/link";
import { ArrowRight, Brain, MessageSquare, Sparkles } from "lucide-react";

import { DemoNotice } from "@/components/layout/demo-notice";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/layout/logo";
import { aiCapabilities, aiConversation } from "@/data/content";
import { cn } from "@/lib/utils";

/** Homepage AI Health Assistant showcase with a scripted triage preview. */
function AiShowcaseSection() {
  return (
    <Section id="ai-assistant" spacing="default">
      <div className="grid gap-12 lg:grid-cols-[1fr_0.92fr] lg:items-start lg:gap-16">
        <div>
          <Reveal>
            <SectionHeading
              eyebrow="AI Health Assistant"
              title="Describe symptoms or add a medical image."
              description="Open the AI workspace for symptom and image analysis when this deployment has its AI and upload services configured. It provides guidance, not a diagnosis; the transcript shown here is only a scripted preview."
            />
          </Reveal>

          <RevealGroup as="ul" className="mt-8 grid gap-4 sm:grid-cols-2">
            {aiCapabilities.map((capability) => (
              <RevealItem as="li" key={capability.id}>
                <div className="flex h-full gap-3 rounded-2xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-soft)] hover:border-primary/30 hover:shadow-[var(--shadow-soft)]">
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
                  >
                    <capability.icon className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{capability.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{capability.detail}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>

          <Reveal className="mt-8" delay={0.05}>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/assistant">
                  <Sparkles aria-hidden />
                  Open the AI workspace
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/ai-assistant#demo">
                  <Brain aria-hidden />
                  View the scripted demo
                </Link>
              </Button>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-relaxed text-muted-foreground">
              The assistant offers guidance and routing — it does not diagnose or prescribe. Any red-flag symptom is
              escalated to emergency care instead of a chat reply.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="rounded-[1.75rem] border border-border bg-card shadow-[var(--shadow-lift)]">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <LogoMark className="size-9" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">ORVEXA Assistant</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden className="size-1.5 rounded-full bg-success" />
                  Scripted preview · English, Hindi, Tamil +
                </p>
              </div>
              <Badge variant="demo" className="ml-auto shrink-0">
                Demo
              </Badge>
            </div>

            <ol className="flex flex-col gap-3.5 px-5 py-5">
              {aiConversation.map((message) => {
                const fromPatient = message.from === "patient";
                return (
                  <li
                    key={message.id}
                    className={cn("flex flex-col gap-1.5", fromPatient ? "items-end" : "items-start")}
                  >
                    <span className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">
                      {fromPatient ? "Patient" : "Assistant"}
                    </span>
                    <p
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
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
            </ol>

            <div className="border-t border-border px-5 py-4">
              <Link
                href="/assistant"
                className="flex items-center gap-3 rounded-xl border border-input bg-muted/60 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <MessageSquare aria-hidden className="size-4" />
                Ask about your symptoms…
                <ArrowRight aria-hidden className="ml-auto size-4" />
                <span className="sr-only">Open the AI Health Assistant page</span>
              </Link>
            </div>
          </div>

          <DemoNotice className="mt-4">
            The conversation above is a fixed sample transcript used to demonstrate the triage flow.
          </DemoNotice>
        </Reveal>
      </div>
    </Section>
  );
}

export { AiShowcaseSection };
