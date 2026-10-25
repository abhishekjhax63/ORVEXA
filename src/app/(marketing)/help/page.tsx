import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, PhoneCall, Pill, Siren } from "lucide-react";

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
    "Read project help content about ORVEXA's current integrations and sample catalogues. This site does not provide pharmacy, diagnostics, insurance or patient-record services.",
  alternates: { canonical: "/help" },
};

const supportTel = `tel:${siteConfig.supportPhone.replace(/\s/g, "")}`;
const emergencyTel = `tel:${siteConfig.emergencyNumber}`;
const supportMailto = `mailto:${siteConfig.supportEmail}`;

/** Self-serve destination for each help topic. */
const topicRoutes: Record<string, { href: string; label: string }> = {
  "getting-started": { href: "/register", label: "Create an account" },
  appointments: { href: "/hospitals", label: "Browse provider directory" },
  pharmacy: { href: "/pharmacy", label: "Browse sample catalogue" },
  diagnostics: { href: "/diagnostics", label: "Browse sample packages" },
  insurance: { href: "/insurance", label: "View insurance information" },
  "account-privacy": { href: "#search", label: "Review project information" },
};

const fallbackRoute = { href: "/contact", label: "View contact details" };

const pharmacyAnswers = faqs.filter((faq) => faq.category === "pharmacy");

/** Service availability notices shown before the sample pharmacy Q&A. */
const pharmacyRules = [
  {
    id: "prescription",
    title: "Prescription processing is unavailable",
    detail: "This sample catalogue does not accept prescriptions or connect users with a pharmacist.",
  },
  {
    id: "schedule-h",
    title: "No medicine sales",
    detail: "ORVEXA does not sell, dispense or ship medicines. Ask a licensed pharmacist about prescription requirements.",
  },
  {
    id: "delivery",
    title: "No delivery service",
    detail: "The product listings are samples. No delivery areas, timings or order tracking are connected.",
  },
  {
    id: "returns",
    title: "No returns or refunds workflow",
    detail: "No orders or payments are processed by ORVEXA, so there is no medicine returns or refund service here.",
  },
  {
    id: "cold-chain",
    title: "No cold-chain service",
    detail: "ORVEXA does not transport or store medicines. Contact the licensed dispensing pharmacy if you have a storage concern.",
  },
];

const escalationPaths = [
  {
    id: "care-desk",
    title: "No connected support ticket",
    detail: "The site has no support-ticket or account-context integration. Use the provided contact details for general enquiries.",
  },
  {
    id: "written-complaint",
    title: "No web request form",
    detail: "This site does not transmit or store form submissions. Do not enter sensitive information into unconnected forms.",
  },
  {
    id: "grievance",
    title: "No verified grievance process",
    detail: "A grievance officer, escalation route and response timeline have not been verified for this project.",
  },
];

export default function HelpPage() {
  return (
    <>
      <PageHero
        eyebrow="Help centre"
        title="Project help and service availability"
        description="Search the current help content and check which services are or are not connected. Sample pages are not a substitute for care from a qualified professional."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Help", href: "/help" },
        ]}
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href="/contact">View contact details</Link>
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
            title={<span id="topics-heading">Help topics</span>}
            description="Each link opens a related page; it does not initiate a booking or support request."
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
          This help content is informational and does not represent a staffed support or clinical service.
        </DemoNotice>
      </Section>

      <Section id="pharmacy" spacing="default" aria-labelledby="pharmacy-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Sample pharmacy catalogue"
            title={<span id="pharmacy-heading">No pharmacy service is connected</span>}
            description="ORVEXA does not accept prescriptions, sell medicines, provide pharmacist advice or arrange delivery."
            actions={
              <Button asChild variant="outline">
                <Link href="/pharmacy">
                  <Pill aria-hidden />
                  Browse sample catalogue
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
              Sample questions about the pharmacy page.
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
              the sample pharmacy page
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
                  <p className="text-base font-semibold">Pharmacist support unavailable</p>
                  <p className="text-xs text-muted-foreground">
                    No pharmacist is connected through this application.
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                For advice about a medicine, contact a licensed pharmacist or clinician directly. Do not send a
                prescription or health information through ORVEXA.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                This is not a medical advice line. If you feel unwell after taking a medicine, seek clinical care
                immediately.
              </p>
            </div>
          </Reveal>
        </div>

        <DemoNotice className="mt-8">
          All pharmacy listings and information on this site are illustrative. ORVEXA does not sell, dispense or
          deliver medicines.
        </DemoNotice>
      </Section>

      <Section id="escalate" tone="muted" spacing="default" aria-labelledby="escalate-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Contact information"
            title={<span id="escalate-heading">No support-ticket or grievance workflow</span>}
            description="This build does not route enquiries to a coordinator or provide response and resolution targets."
          />
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <div className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6">
              <h3 className="text-base font-semibold">Provided contact details</h3>
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
                  <Link href="/contact">View contact details</Link>
                </Button>
              </div>
              <dl className="flex flex-col gap-4 border-t border-border pt-5">
                <div>
                  <dt className="text-sm font-medium text-foreground">Availability</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Phone and email availability and response times are not verified.
                  </dd>
                </div>
              </dl>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6">
              <h3 className="text-base font-semibold">What is not available</h3>
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
                A grievance officer, formal escalation address and complaint-resolution timeline have not been
                verified for this project.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal className="mt-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-emergency/40 bg-emergency-soft p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-emergency">
              <Siren aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">The help centre is not for emergencies.</span> Call{" "}
                {siteConfig.emergencyNumber} directly. ORVEXA cannot dispatch an ambulance or alert a hospital.
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
          Contact information is presented as supplied. No support response time or resolution service is promised.
        </DemoNotice>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Need more information?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Use the provided contact details for general enquiries. For emergencies, call 108 directly.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/contact">View contact details</Link>
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
