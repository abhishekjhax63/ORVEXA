import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  CircleX,
  ClipboardList,
  Compass,
  LifeBuoy,
  ListChecks,
  LockKeyhole,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Siren,
  Sparkles,
  Stethoscope,
  UserCheck,
} from "lucide-react";

import { AssistantDemo } from "@/components/ai/assistant-demo";
import { MedicalAnalysisPanel } from "@/components/ai/medical-analysis-panel";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { aiCapabilities } from "@/data/content";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "AI assistant demo",
  description:
    "Explore a scripted assistant demo or open ORVEXA's AI workspace. Live symptom and image analysis depends on deployment configuration and is not a diagnosis.",
  alternates: { canonical: "/ai-assistant" },
};

const safetyPromise = [
  {
    id: "promise-1",
    title: "Not a diagnosis",
    detail: "This demo is scripted. The live workspace can provide informational AI output, not a confirmed diagnosis or prescription.",
    icon: ShieldCheck,
  },
  {
    id: "promise-2",
    title: "No live handoff",
    detail: "This demo does not contact a clinician, create an appointment or send an emergency request.",
    icon: UserCheck,
  },
  {
    id: "promise-3",
    title: "Demo data stays in the browser",
    detail: "The scripted demo uses local page state. The separate live workspace sends data to configured services when you submit it.",
    icon: LockKeyhole,
  },
];

const howItWorks = [
  {
    id: "step-1",
    title: "Describe symptoms or add an image",
    detail:
      "The live workspace accepts symptom text and image uploads when its AI provider, sign-in, private storage and malware scanning are configured.",
    icon: ClipboardList,
    link: { label: "Try the guided demo", href: "#demo" },
  },
  {
    id: "step-2",
    title: "Review the response",
    detail:
      "Configured AI responses may be incomplete or wrong. They are not a substitute for a clinician's assessment.",
    icon: ListChecks,
  },
  {
    id: "step-3",
    title: "Treat output as informational",
    detail:
      "Do not use an AI-generated response to rule out an emergency or decide to delay care.",
    icon: Compass,
  },
  {
    id: "step-4",
    title: "Contact providers directly",
    detail:
      "The directory is a static, unverified list. It does not create appointments or pass your conversation to a provider.",
    icon: UserCheck,
    link: { label: "Browse the supplied directory", href: "/hospitals?view=doctors" },
  },
];

const canDo = [
  "Show a fixed sample conversation in this browser-only demo",
  "Accept symptoms and images in the live workspace when required services are configured",
  "Display an AI-generated informational response when the configured provider is available",
  "Link to the supplied Patna directory for independent follow-up",
];

const neverDo = [
  "Provide a confirmed diagnosis or prescribe treatment",
  "Book an appointment or contact a clinician for you",
  "Verify the supplied provider records, credentials, contacts or schedules",
  "Replace emergency services or a clinician's assessment",
];

const faqs = [
  {
    id: "faq-1",
    question: "How accurate is the triage guidance?",
    answer:
      "The conversation on this page is scripted and does not assess anyone. Responses from the live workspace depend on the configured AI provider, may be wrong, and have not been presented as clinically validated guidance.",
  },
  {
    id: "faq-2",
    question: "Is my health information private?",
    answer:
      "Text entered in this scripted demo stays in page state and is not sent to an AI model. The live workspace sends submitted data to the services configured by the operator; review the privacy policy and consent prompts before using it.",
  },
  {
    id: "faq-3",
    question: "Is the assistant a registered medical device?",
    answer:
      "No registration or clinical validation is claimed here. Neither the scripted demo nor AI-generated responses should replace professional medical advice.",
  },
  {
    id: "faq-4",
    question: "Does it replace a doctor?",
    answer:
      "No. The demo has no clinician handoff, and the live workspace does not book care. Contact a licensed clinician directly.",
  },
  {
    id: "faq-5",
    question: "What does it cost to use?",
    answer:
      "This page is a demo and does not charge for care. ORVEXA does not publish live pricing or book services through the supplied provider directory; confirm prices directly with providers.",
  },
  {
    id: "faq-6",
    question: "What happens in an emergency?",
    answer:
      "Neither the demo nor the live AI workspace should be used for emergency triage. Call 108 or go to the nearest emergency department.",
  },
];

export default function AiAssistantPage() {
  return (
    <>
      <PageHero
        eyebrow="AI assistant demo"
        title="A scripted preview and a separate AI workspace"
        description="This page is a browser-only scripted walkthrough, not an AI assessment. Open the live workspace for symptom and image analysis when its AI provider, account, private storage and safety services are configured. AI output is not a diagnosis."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "AI Health Assistant", href: "/ai-assistant" },
        ]}
        actions={
          <>
            <Button asChild variant="gradient" size="lg">
              <Link href="/assistant">
                <Sparkles aria-hidden />
                Open the AI workspace
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#demo">View the scripted demo</a>
            </Button>
          </>
        }
        aside={
          <div className="rounded-[1.75rem] border border-border bg-card/85 p-6 shadow-[var(--shadow-panel)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow text-primary">Important limits</p>
              <Badge variant="demo">Demo</Badge>
            </div>
            <ul className="mt-5 space-y-4">
              {safetyPromise.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <item.icon className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        }
      />

      <Section id="demo" spacing="default" aria-labelledby="demo-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Scripted demo"
            title={<span id="demo-heading">Walk through a sample conversation</span>}
            description="This fixed transcript does not call an AI model or assess your symptoms. Pick a suggested reply or type into the demo to see its preset sample response."
          />
        </Reveal>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <Reveal>
            <AssistantDemo />
          </Reveal>

          <Reveal delay={0.06}>
            <div className="flex flex-col gap-5 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-2 eyebrow text-primary">
                <MessageSquare aria-hidden className="size-4" />
                What this demonstrates
              </div>
              <ul className="space-y-4 text-sm">
                <li>
                  <p className="font-semibold">Interactive sample state</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Messages are held in local state, the transcript scrolls, the progress bar advances and Enter sends a
                    reply — all in the browser.
                  </p>
                </li>
                <li>
                  <p className="font-semibold">Preset sample reasoning</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    The sample shows which scripted inputs lead to its fixed outcome; it is not generated reasoning.
                  </p>
                </li>
                <li>
                  <p className="font-semibold">No live handoff</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    The sample suggests a care route but does not contact a clinician, book care or assess emergencies.
                  </p>
                </li>
              </ul>
              <p className="rounded-xl border border-dashed border-warning/40 bg-warning-soft px-3.5 py-3 text-xs leading-relaxed text-warning">
                No model, no network request and no data storage are involved. The reply delay is a local timer that
                simply makes the transcript readable.
              </p>
            </div>
          </Reveal>
        </div>

        <DemoNotice className="mt-8">
          The transcript and outcome are scripted and are not a real assessment. The live workspace is available at{" "}
          <Link href="/assistant" className="font-semibold text-primary underline">
            /assistant
          </Link>
          ; its AI and image features depend on deployment configuration.
        </DemoNotice>
      </Section>

      <Section id="medical-analysis" spacing="default" aria-labelledby="analysis-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Clinical Vision & Diagnostics"
            title={<span id="analysis-heading">OpenAI Lab Report & Wound Visual Inspector</span>}
            description="Extract biomarkers from lab reports or perform an observational visual assessment of wounds and burns. Includes diagnostic limitation warnings and emergency triage escalation."
          />
        </Reveal>
        <div className="mt-8">
          <MedicalAnalysisPanel />
        </div>
      </Section>

      <Section id="how-it-works" tone="muted" spacing="default" aria-labelledby="how-it-works-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Live workspace"
            title={<span id="how-it-works-heading">Using symptom and image analysis</span>}
            description="The live workspace depends on configured AI and upload services. Its responses are informational, may be wrong, and do not replace a clinician."
          />
        </Reveal>

        <RevealGroup as="ol" className="mt-10 grid gap-5 md:grid-cols-2">
          {howItWorks.map((step, index) => (
            <RevealItem as="li" key={step.id} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-9 place-items-center rounded-xl bg-primary-soft text-xs font-semibold text-primary"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <step.icon aria-hidden className="size-4.5 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                {step.link ? (
                  <Link
                    href={step.link.href}
                    className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                  >
                    {step.link.label}
                    <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section id="capabilities" spacing="default" aria-labelledby="capabilities-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Capabilities"
            title={<span id="capabilities-heading">What the workspace can support</span>}
            description="Support varies by the configured provider and upload services. Unavailable features are reported rather than simulated."
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {aiCapabilities.map((capability) => (
            <RevealItem as="li" key={capability.id} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
                <span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"
                >
                  <capability.icon className="size-5" />
                </span>
                <p className="text-sm font-semibold">{capability.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{capability.detail}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section id="safety" tone="navy" spacing="default" aria-labelledby="safety-heading">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(38rem_24rem_at_12%_0%,rgba(184,243,107,0.16),transparent_62%),radial-gradient(34rem_22rem_at_88%_100%,rgba(46,125,79,0.28),transparent_60%)]"
        />
        <div className="relative">
          <Reveal className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 eyebrow text-lime-200">
              Safety and limits
            </span>
            <h2
              id="safety-heading"
              className="mt-4 text-3xl font-semibold text-white sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]"
            >
              What it will do, and what it will never do
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
              A health assistant is only trustworthy if its limits are as clear as its features. These are non-negotiable.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <Reveal>
              <div className="flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <CircleCheck aria-hidden className="size-4.5 text-lime-200" />
                  What the assistant can do
                </div>
                <ul className="mt-5 space-y-3.5">
                  {canDo.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white/75">
                      <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-lime-200" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={0.07}>
              <div className="flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <CircleX aria-hidden className="size-4.5 text-emergency" />
                  What it will never do
                </div>
                <ul className="mt-5 space-y-3.5">
                  {neverDo.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white/75">
                      <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-emergency" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>

          <Reveal className="mt-6" delay={0.05}>
            <div className="flex flex-col items-start gap-5 rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <p className="text-sm font-semibold text-white">If this is an emergency, do not use the assistant.</p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                  Call {siteConfig.emergencyNumber} or go to the nearest emergency department. Do not rely on the demo or
                  AI workspace for emergency assistance.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="emergency" size="lg">
                  <a href={`tel:${siteConfig.emergencyNumber}`}>
                    <PhoneCall aria-hidden />
                    Call {siteConfig.emergencyNumber}
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/emergency">
                    <Siren aria-hidden />
                    Emergency SOS
                  </Link>
                </Button>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-6" delay={0.08}>
            <div className="rounded-[1.75rem] border border-white/10 bg-forest-950/40 p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <LockKeyhole aria-hidden className="size-4.5 text-lime-200" />
                Live workspace requirements
              </div>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                The live workspace sends submitted information to its configured AI and storage services. Review the
                privacy policy and consent prompts before submitting health information.
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold text-lime-200 uppercase">AI provider</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/65">
                    Text analysis requires an operator-configured provider and credentials.
                  </p>
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold text-lime-200 uppercase">Image uploads</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/65">
                    Require a signed-in account, private storage, a compatible model and malware scanning.
                  </p>
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold text-lime-200 uppercase">No clinician handoff</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/65">
                    The directory does not create appointments or share your conversation with providers.
                  </p>
                </li>
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-white/60">
                This scripted demo keeps typed replies in page state and does not send them to an AI model.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section id="faq" spacing="default" aria-labelledby="faq-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Questions"
            title={<span id="faq-heading">Straight answers before you start</span>}
            description="Accuracy, privacy, regulation and cost — the questions people actually ask about an AI health assistant."
          />
        </Reveal>

        <Reveal className="mt-8" delay={0.05}>
          <Accordion type="single" collapsible defaultValue="faq-1" className="flex flex-col gap-3">
            {faqs.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Find provider information</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                The supplied Patna directory is static and unverified. Contact providers directly to confirm current
                details and availability; the directory does not book consultations.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/hospitals?view=doctors">
                  <Stethoscope aria-hidden />
                  Browse unverified listings
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/contact">Contact ORVEXA</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/help">
                  <LifeBuoy aria-hidden />
                  Visit the help centre
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
