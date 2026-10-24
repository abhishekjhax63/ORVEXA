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
  title: "AI Health Assistant",
  description:
    "Describe how you feel and get a clear next step. The ORVEXA Health Assistant guides symptom triage, suggests an urgency band and the right speciality, then hands you off to a licensed clinician — it never diagnoses or prescribes.",
  alternates: { canonical: "/ai-assistant" },
};

const safetyPromise = [
  {
    id: "promise-1",
    title: "Not a diagnosis",
    detail: "It suggests an urgency band and where to go. It never names a condition or tells you what to take.",
    icon: ShieldCheck,
  },
  {
    id: "promise-2",
    title: "Human handoff",
    detail: "Every path ends with a licensed clinician — a teleconsult, a clinic visit, or emergency care.",
    icon: UserCheck,
  },
  {
    id: "promise-3",
    title: "Data stays with you",
    detail: "In Phase 1 nothing you type leaves your browser. Sharing with a doctor is always your choice.",
    icon: LockKeyhole,
  },
];

const howItWorks = [
  {
    id: "step-1",
    title: "Describe your symptoms",
    detail:
      "Write it the way you would tell a friend — in English, Hindi, Tamil or any of 11 supported languages. No medical vocabulary required.",
    icon: ClipboardList,
    link: { label: "Try the guided demo", href: "#demo" },
  },
  {
    id: "step-2",
    title: "Answer structured follow-ups",
    detail:
      "The assistant asks the same clarifying questions a triage nurse would: onset, severity, red-flag signs and existing conditions.",
    icon: ListChecks,
  },
  {
    id: "step-3",
    title: "Get an urgency band and a route",
    detail:
      "You receive one of four bands — self-care, teleconsult, clinic visit within 24 hours, or emergency — with the reasoning shown, not hidden.",
    icon: Compass,
  },
  {
    id: "step-4",
    title: "Hand off to a real clinician",
    detail:
      "The summary becomes an appointment request for the recommended speciality, so the doctor starts with your context already in front of them.",
    icon: UserCheck,
    link: { label: "Find a specialist", href: "/hospitals?view=doctors" },
  },
];

const canDo = [
  "Explain a symptom pattern in plain language",
  "Suggest an urgency band and the right speciality",
  "Point you to a hospital, a teleconsult or emergency services",
  "Prepare a summary you can choose to share with a clinician",
];

const neverDo = [
  "Diagnose a condition or rule one out",
  "Prescribe medicines or adjust an existing dose",
  "Replace emergency services when you need an ambulance",
  "Replace clinical judgement or an in-person examination",
];

const faqs = [
  {
    id: "faq-1",
    question: "How accurate is the triage guidance?",
    answer:
      "The assistant follows reviewed routing protocols to decide how urgently you should be seen and which speciality should see you. It is not a diagnosis and it cannot examine you, so treat every recommendation as a starting point that a clinician confirms.",
  },
  {
    id: "faq-2",
    question: "Is my health information private?",
    answer:
      "In Phase 1 the walkthrough runs entirely in your browser — nothing you type is transmitted or stored. In Phase 2, anything you choose to share with the assistant will be encrypted at rest, used only to generate your guidance, and handed to a clinician only with your explicit consent, which you can revoke at any time.",
  },
  {
    id: "faq-3",
    question: "Is the assistant a registered medical device?",
    answer:
      "No. The ORVEXA Health Assistant is a telehealth guidance and navigation tool, not a registered medical device, and it is not a substitute for professional medical advice. Regulatory registration and clinical validation of the triage model are part of the Phase 2 roadmap.",
  },
  {
    id: "faq-4",
    question: "Does it replace a doctor?",
    answer:
      "Never. The assistant exists to shorten the time between feeling unwell and talking to the right clinician. Every conversation is designed to end with a handoff to a licensed doctor, a teleconsult or emergency care.",
  },
  {
    id: "faq-5",
    question: "What does it cost to use?",
    answer:
      "Guidance and routing are free to use on ORVEXA. You only pay for the care you then choose — a consultation, a diagnostic test, medicines or a hospital visit — and every price is shown before you commit.",
  },
  {
    id: "faq-6",
    question: "What happens in an emergency?",
    answer:
      "The assistant does not try to keep you in a chat. Red-flag symptoms such as chest pain, breathlessness, stroke signs or heavy bleeding escalate immediately to emergency guidance, with a one-tap call to 108 and the Emergency SOS module.",
  },
];

export default function AiAssistantPage() {
  return (
    <>
      <PageHero
        eyebrow="AI Health Assistant"
        title="Guided symptom triage that always ends with a clinician"
        description="Tell the ORVEXA Health Assistant how you feel and it helps you decide where to go — self-care, a teleconsult, a clinic visit or emergency — and then hands you off to a licensed clinician. It never diagnoses and it never prescribes."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "AI Health Assistant", href: "/ai-assistant" },
        ]}
        actions={
          <>
            <Button asChild variant="gradient" size="lg">
              <a href="#demo">
                <Sparkles aria-hidden />
                Try the guided demo
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#how-it-works">
                See how it works
                <ArrowRight aria-hidden />
              </a>
            </Button>
          </>
        }
        aside={
          <div className="rounded-[1.75rem] border border-border bg-card/85 p-6 shadow-[var(--shadow-panel)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">The safety promise</p>
              <Badge variant="outline">Honest by design</Badge>
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
            eyebrow="Guided demo"
            title={<span id="demo-heading">Walk through a triage conversation</span>}
            description="This is a fixed, scripted transcript, not a live model. Pick a suggested reply or type your own and press Enter to see exactly how the assistant narrows a symptom down to a next step."
          />
        </Reveal>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <Reveal>
            <AssistantDemo />
          </Reveal>

          <Reveal delay={0.06}>
            <div className="flex flex-col gap-5 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
                <MessageSquare aria-hidden className="size-4" />
                What this demonstrates
              </div>
              <ul className="space-y-4 text-sm">
                <li>
                  <p className="font-semibold">A real conversation state</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Messages are held in local state, the transcript scrolls, the progress bar advances and Enter sends a
                    reply — all in the browser.
                  </p>
                </li>
                <li>
                  <p className="font-semibold">Reasoning you can read</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    The assistant states which symptoms drove the urgency band instead of returning a black-box answer.
                  </p>
                </li>
                <li>
                  <p className="font-semibold">A handoff, not a verdict</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    The walkthrough ends with a speciality to book and an emergency path, never a diagnosis.
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
          The transcript, suggestions and triage outcome are a scripted walkthrough for Phase 1 review. The live triage
          model arrives in Phase 2 and will be clinically validated before release.
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
            eyebrow="How triage works"
            title={<span id="how-it-works-heading">Four steps from symptom to specialist</span>}
            description="Each step is transparent, and the last one always leaves the decision with a licensed clinician rather than a chatbot."
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
            title={<span id="capabilities-heading">What the assistant helps with</span>}
            description="Six things the assistant is built to do — always as guidance and navigation, with the clinical decision reserved for a doctor."
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
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(38rem_24rem_at_12%_0%,rgba(34,211,238,0.22),transparent_62%),radial-gradient(34rem_22rem_at_88%_100%,rgba(45,212,191,0.2),transparent_60%)]"
        />
        <div className="relative">
          <Reveal className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-teal-200 uppercase">
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
                  <CircleCheck aria-hidden className="size-4.5 text-teal-200" />
                  What the assistant can do
                </div>
                <ul className="mt-5 space-y-3.5">
                  {canDo.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white/75">
                      <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-teal-200" />
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
                  Call {siteConfig.emergencyNumber} for an ambulance or open Emergency SOS, which shares your location with
                  your contacts and pre-alerts the receiving hospital.
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
            <div className="rounded-[1.75rem] border border-white/10 bg-navy-950/40 p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <LockKeyhole aria-hidden className="size-4.5 text-teal-200" />
                Consent and data handling in Phase 2
              </div>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                We are deliberately describing how health data will be handled rather than claiming features that do not
                exist yet. When the assistant moves beyond a walkthrough:
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold text-teal-200 uppercase">Encrypted at rest</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/65">
                    Transcripts and summaries stored with AES-256 encryption and per-access audit trails.
                  </p>
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold text-teal-200 uppercase">Explicit consent</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/65">
                    Nothing is shared with a clinician or provider until you actively choose to share it.
                  </p>
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold text-teal-200 uppercase">Revocable</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/65">
                    Consent and any generated share link can be withdrawn at any time, from your dashboard.
                  </p>
                </li>
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-white/60">
                In the current Phase 1 demo, nothing you type is transmitted or stored at all.
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
              <h2 className="text-2xl font-semibold sm:text-3xl">Turn guidance into an appointment</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Once you know the urgency and the speciality, the next step is a verified clinician. Browse specialists,
                start a teleconsult, or reach the care desk if you are unsure.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/hospitals?view=doctors">
                  <Stethoscope aria-hidden />
                  Talk to a doctor now
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/services#telemedicine">Start a teleconsultation</Link>
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
