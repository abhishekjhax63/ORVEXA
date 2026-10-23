import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, PhoneCall, Pill, Siren } from "lucide-react";

import { RequestDialog, type RequestField } from "@/components/forms/request-dialog";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { HelpSearch } from "@/components/support/help-search";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { faqs, helpTopics } from "@/data/support";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Help centre",
  description:
    "Search ORVEXA help articles on appointments, prescriptions, diagnostics, insurance and privacy. Pharmacy guidance on Schedule H medicines, delivery windows, returns and cold-chain items, plus how to escalate to the care desk.",
  alternates: { canonical: "/help" },
};

const supportTel = `tel:${siteConfig.supportPhone.replace(/\s/g, "")}`;
const emergencyTel = `tel:${siteConfig.emergencyNumber}`;
const supportMailto = `mailto:${siteConfig.supportEmail}`;

/** Self-serve destination for each help topic. */
const topicRoutes: Record<string, { href: string; label: string }> = {
  "getting-started": { href: "/register", label: "Create an account" },
  appointments: { href: "/hospitals", label: "Manage appointments" },
  pharmacy: { href: "/pharmacy", label: "Open MediCare pharmacy" },
  diagnostics: { href: "/diagnostics", label: "Browse diagnostics" },
  insurance: { href: "/insurance", label: "Compare insurance plans" },
  "account-privacy": { href: "/dashboard/records", label: "Review your records" },
};

const fallbackRoute = { href: "/contact#chat", label: "Ask the care desk" };

const pharmacyAnswers = faqs.filter((faq) => faq.category === "pharmacy");

/** Process guidance that sits in front of the pharmacy Q&A. */
const pharmacyRules = [
  {
    id: "prescription",
    title: "Uploading and verifying a prescription",
    detail:
      "Photograph the whole prescription: prescriber name, registration number, date and dosage must all be legible. A licensed pharmacist verifies every line against your order before dispatch and calls you if something is unclear, illegible or expired.",
  },
  {
    id: "schedule-h",
    title: "Schedule H and H1 rules",
    detail:
      "Antibiotics, cardiac and psychiatric medicines and most injections are Schedule H or H1. They are dispensed only against a valid prescription, and Schedule H1 supply is entered in the statutory register with the prescription retained for the period the rules require.",
  },
  {
    id: "delivery",
    title: "Delivery timelines and pin codes",
    detail:
      "Express delivery in metro pin codes is typically 90 minutes, with same-day delivery elsewhere in the cities we cover. Enter your pin code before paying to see the window that applies to your address; prescriptions still need verification first.",
  },
  {
    id: "returns",
    title: "Returns and refunds of medicines",
    detail:
      "Correctly supplied medicines cannot be taken back once they leave the pharmacy, because their storage conditions can no longer be verified. Damaged, expired, short-supplied or wrongly dispensed items are replaced or refunded in full — raise it with a photograph of the pack.",
  },
  {
    id: "cold-chain",
    title: "Cold-chain handling",
    detail:
      "Insulin, vaccines and biologicals travel in validated temperature-controlled packaging with a temperature log inside the box. If the log shows an excursion, do not use the medicine; contact the pharmacy desk for a replacement.",
  },
];

const pharmacistFields: RequestField[] = [
  {
    name: "fullName",
    label: "Full name",
    type: "text",
    placeholder: "The name your order or prescription is under",
    required: true,
    autoComplete: "name",
  },
  {
    name: "phone",
    label: "Phone",
    type: "tel",
    placeholder: "+91 98450 12093",
    required: true,
    autoComplete: "tel",
    description: "A pharmacist may call to clarify a dosage or substitution.",
  },
  {
    name: "reference",
    label: "Order or prescription reference",
    type: "text",
    placeholder: "e.g. MC-48219",
    description: "Leave this blank if your question is not about a specific order.",
  },
  {
    name: "question",
    label: "Your question",
    type: "textarea",
    placeholder: "Ask about dosage, storage, interactions, substitutions, a delayed order or a return.",
    required: true,
  },
];

const escalationPaths = [
  {
    id: "care-desk",
    title: "Raise it with the care desk",
    detail:
      "Call or write with your reference number. The coordinator handling your case can see the order, booking or claim without you explaining it again.",
  },
  {
    id: "written-complaint",
    title: "Put it in writing",
    detail:
      "Email the care desk with the word Complaint in the subject line, your reference number, dates and the outcome you are asking for. Written records move faster than recollections.",
  },
  {
    id: "grievance",
    title: "Grievance review",
    detail:
      "If a complaint is not resolved to your satisfaction, it is escalated to the grievance officer, who reviews the case file and replies in writing.",
  },
];

export default function HelpPage() {
  return (
    <>
      <PageHero
        eyebrow="Help centre"
        title="Answers first, escalation when answers run out"
        description="Practical guidance on appointments, prescriptions, diagnostics, claims and your data. Search it, or jump to the pharmacy and escalation blocks below if that is what brought you here."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Help", href: "/help" },
        ]}
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href="/contact#chat">Message the care desk</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={supportTel}>
                <PhoneCall aria-hidden />
                {siteConfig.supportPhone}
              </a>
            </Button>
          </>
        }
      />

      <Section id="search" spacing="default" aria-labelledby="search-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Search"
            title={<span id="search-heading">Search the help centre</span>}
            description="Filter by topic or search the question and answer text. Everything below works without an account."
          />
        </Reveal>
        <div className="mt-8">
          <HelpSearch />
        </div>
        <DemoNotice className="mt-8">
          The articles and answers in this help centre are Phase 1 review content written against the current build.
          Policy-specific answers will be replaced by the published operations and legal text at launch.
        </DemoNotice>
      </Section>

      <Section id="topics" tone="muted" spacing="default" aria-labelledby="topics-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Browse by topic"
            title={<span id="topics-heading">Six topics, each with one clear next step</span>}
            description="Pick the area closest to your question and go straight to the page that can resolve it."
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {helpTopics.map((topic) => {
            const route = topicRoutes[topic.id] ?? fallbackRoute;
            return (
              <RevealItem as="li" key={topic.id} className="h-full">
                <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      aria-hidden
                      className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
                    >
                      <topic.icon className="size-5" />
                    </span>
                    <Badge variant="neutral">{topic.articleCount} articles</Badge>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">{topic.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{topic.description}</p>
                  </div>
                  <Button asChild variant="link" className="mt-auto w-fit px-0">
                    <Link href={route.href}>
                      {route.label}
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              </RevealItem>
            );
          })}
        </RevealGroup>

        <DemoNotice className="mt-8">
          Article counts are planning figures, not a live index. Each topic currently resolves to the relevant product
          page while the full article library is written.
        </DemoNotice>
      </Section>

      <Section id="pharmacy" spacing="default" aria-labelledby="pharmacy-heading">
        <Reveal>
          <SectionHeading
            eyebrow="MediCare pharmacy"
            title={<span id="pharmacy-heading">Pharmacy help, with the rules stated plainly</span>}
            description="Medicine is regulated, so the answers here are about verification, timing and what can and cannot be reversed after delivery."
            actions={
              <Button asChild variant="outline">
                <Link href="/pharmacy">
                  <Pill aria-hidden />
                  Open MediCare pharmacy
                </Link>
              </Button>
            }
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-2">
          {pharmacyRules.map((rule) => (
            <RevealItem as="li" key={rule.id} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold">{rule.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{rule.detail}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-12">
          <Reveal>
            <h3 className="text-xl font-semibold sm:text-2xl">Frequently asked in pharmacy</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The two questions the pharmacy desk receives most often, answered in full.
            </p>
            <Accordion type="multiple" className="mt-6 flex flex-col gap-3" defaultValue={["faq-6"]}>
              {pharmacyAnswers.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent>{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              More answers on dosage, refills and substitutions are linked from{" "}
              <Link href="/pharmacy" className="font-medium text-primary underline underline-offset-4">
                the pharmacy page
              </Link>
              .
            </p>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-border bg-muted/40 p-6">
              <div className="flex items-center gap-3">
                <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-card text-primary">
                  <Pill className="size-5" />
                </span>
                <div>
                  <p className="text-base font-semibold">Ask a pharmacist</p>
                  <p className="text-xs text-muted-foreground">
                    Prescription queries, storage, interactions and order problems.
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Questions about a specific medicine are answered by a registered pharmacist rather than a general
                support agent.
              </p>
              <RequestDialog
                triggerLabel="Ask a pharmacist"
                triggerVariant="gradient"
                title="Ask the MediCare pharmacist"
                description="Share your question and, if relevant, the order or prescription reference. A registered pharmacist would answer on your preferred channel."
                fields={pharmacistFields}
                submitLabel="Send to the pharmacist"
                successTitle="Question ready for the pharmacist"
                successBody="In production, a registered pharmacist would review this against your prescription and order history before replying."
                footnote="Phase 1 has no pharmacy backend. This form validates your details and shows the confirmation state, but nothing is transmitted. For anything urgent about a medicine you have already taken, contact a doctor or call 108."
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                This is not a medical advice line. If you feel unwell after taking a medicine, seek clinical care
                immediately.
              </p>
            </div>
          </Reveal>
        </div>

        <DemoNotice className="mt-8">
          Delivery windows, return conditions and retention rules above are Phase 1 review copy pending sign-off from
          the pharmacy operations team. The Schedule H and H1 requirements themselves are statutory.
        </DemoNotice>
      </Section>

      <Section id="escalate" tone="muted" spacing="default" aria-labelledby="escalate-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Escalation"
            title={<span id="escalate-heading">When self-serve is not enough</span>}
            description="Everything above is written so you rarely need to escalate. When you do, here is who takes over and how long it should take."
          />
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <div className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6">
              <h3 className="text-base font-semibold">Reach the care desk</h3>
              <div className="flex flex-col gap-3">
                <Button asChild variant="outline" className="justify-start">
                  <a href={supportTel}>
                    <PhoneCall aria-hidden />
                    {siteConfig.supportPhone}
                  </a>
                </Button>
                <Button asChild variant="outline" className="justify-start">
                  <a href={supportMailto}>
                    <Mail aria-hidden />
                    {siteConfig.supportEmail}
                  </a>
                </Button>
                <Button asChild variant="outline" className="justify-start">
                  <Link href="/contact#chat">Send a written request</Link>
                </Button>
              </div>
              <dl className="flex flex-col gap-4 border-t border-border pt-5">
                <div>
                  <dt className="text-sm font-medium text-foreground">Care desk phone</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Answered 24×7, including public holidays.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-foreground">Email</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Acknowledged within 8 working hours, with a named owner assigned.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-foreground">Written complaint</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Acknowledged within 3 working days; resolution target of 15 working days from acknowledgement.
                  </dd>
                </div>
              </dl>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6">
              <h3 className="text-base font-semibold">Complaint escalation path</h3>
              <ol className="flex flex-col gap-5">
                {escalationPaths.map((step, index) => (
                  <li key={step.id} className="flex gap-4">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-xs font-semibold text-primary"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
                The named grievance officer and the formal grievance email address are published in the privacy policy
                section of this site at launch.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal className="mt-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-emergency/40 bg-emergency-soft p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-emergency">
              <Siren aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">The help centre is not for emergencies.</span> Chest pain, breathing
                difficulty, severe bleeding, a suspected stroke or an unconscious patient need an ambulance, not a
                support ticket. Call {siteConfig.emergencyNumber} immediately.
              </span>
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="emergency" size="sm">
                <a href={emergencyTel}>Call {siteConfig.emergencyNumber}</a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/emergency">Open Emergency SOS</Link>
              </Button>
            </div>
          </div>
        </Reveal>

        <DemoNotice className="mt-6">
          Response-time and resolution targets above are Phase 1 operating plans for review, not measured service
          levels. The statutory emergency number {siteConfig.emergencyNumber} is real and always available.
        </DemoNotice>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Still stuck?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Send a written request with your reference number, open Emergency SOS if the situation is urgent, or
                read how ORVEXA works with providers and protects your data.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/contact#chat">Message the care desk</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/emergency">Emergency SOS</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/about">About ORVEXA</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
