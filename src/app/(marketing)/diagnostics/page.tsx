import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BadgeIndianRupee,
  CalendarClock,
  Check,
  ClipboardList,
  Home,
  LifeBuoy,
  Microscope,
  ShieldCheck,
  Stethoscope,
  Timer,
} from "lucide-react";

import { PackageBrowser } from "@/components/diagnostics/package-browser";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { diagnosticPackages, diagnosticsTrust } from "@/data/diagnostics";

export const metadata: Metadata = {
  title: "Diagnostics and lab tests",
  description:
    "Browse sample diagnostic packages. ORVEXA has no connected laboratory, booking, sample collection or report-delivery service.",
  alternates: { canonical: "/diagnostics" },
};

type CollectionStep = {
  icon: LucideIcon;
  title: string;
  description: string;
  meta: string;
  href?: string;
  hrefLabel?: string;
};

const collectionSteps: CollectionStep[] = [
  {
    icon: CalendarClock,
    title: "Browse the sample catalogue",
    description:
      "Package names, prices, fasting details and report times are illustrative only and have not been confirmed by a lab.",
    meta: "Sample information",
  },
  {
    icon: Home,
    title: "No home collection service",
    description:
      "ORVEXA is not connected to phlebotomists or collection centres. Contact a licensed laboratory directly.",
    meta: "Not available",
  },
  {
    icon: Microscope,
    title: "No laboratory integration",
    description:
      "No partner laboratory, accreditation record, sample tracking or result-verification workflow is connected.",
    meta: "Not available",
  },
  {
    icon: ClipboardList,
    title: "No report delivery",
    description:
      "This page cannot receive or store diagnostic reports. Do not enter personal or medical information into a sample booking flow.",
    meta: "Not available",
  },
];

export default function DiagnosticsPage() {
  return (
    <>
      <PageHero
        eyebrow="Diagnostics"
        title="Sample diagnostic packages"
        description="This is a sample catalogue for demonstration only. ORVEXA does not book tests, arrange sample collection, verify laboratory accreditation or deliver reports."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Diagnostics", href: "/diagnostics" },
        ]}
        actions={
          <>
            <Button asChild variant="gradient" size="lg">
              <a href="#packages">
                Browse sample packages
                <ArrowRight aria-hidden />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#process">Service availability</a>
            </Button>
          </>
        }
        aside={
          <div className="rounded-[1.75rem] border border-border bg-card/85 p-6 shadow-[var(--shadow-panel)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Service status</p>
              <Badge variant="demo">Demo</Badge>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground">Lab integration</dt>
                <dd className="mt-1 text-2xl font-semibold">None</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Accreditation</dt>
                <dd className="mt-1 text-2xl font-semibold">Unverified</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Home collection</dt>
                <dd className="mt-1 text-2xl font-semibold">Unavailable</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Report delivery</dt>
                <dd className="mt-1 text-2xl font-semibold">Unavailable</dd>
              </div>
            </dl>
            <ul className="mt-6 space-y-2.5 border-t border-border pt-5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                No laboratory accreditation has been verified
              </li>
              <li className="flex items-start gap-2">
                <Microscope aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                No report review workflow is connected
              </li>
              <li className="flex items-start gap-2">
                <Timer aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                No booking or turnaround-time service is connected
              </li>
            </ul>
          </div>
        }
      />

      <Section id="packages" spacing="default" aria-labelledby="packages-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Health packages"
            title={<span id="packages-heading">Explore the sample catalogue</span>}
            description="Filter the illustrative package list and review its sample test names and prices. None of the packages, discounts, report times or collection options are confirmed offers."
            actions={
              <Button asChild variant="outline">
                <a href="#process">
                  What is and is not available
                  <ArrowRight aria-hidden />
                </a>
              </Button>
            }
          />
        </Reveal>
        <div className="mt-8">
          <PackageBrowser />
        </div>
        <DemoNotice className="mt-8">
          All package details are sample data. Booking is unavailable; do not submit personal, contact or medical
          information here.
        </DemoNotice>
      </Section>

      <Section id="process" tone="muted" spacing="default" aria-labelledby="process-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Service status"
            title={<span id="process-heading">No live diagnostics workflow</span>}
            description="These status cards explain which laboratory services are not connected to ORVEXA."
          />
        </Reveal>

        <RevealGroup as="ol" className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {collectionSteps.map((step, index) => (
            <RevealItem as="li" key={step.title} className="h-full">
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
                <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                <div className="mt-auto flex flex-col gap-3 pt-2">
                  <Badge variant="neutral">{step.meta}</Badge>
                  {step.href ? (
                    <Button asChild variant="link" size="sm" className="justify-start px-0">
                      <Link href={step.href}>
                        {step.hrefLabel}
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal className="mt-8">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <BadgeIndianRupee aria-hidden className="size-4 text-primary" />
            This sample page does not accept payment, schedule collection or confirm a laboratory appointment.
          </p>
        </Reveal>
      </Section>

      <Section id="tests" spacing="default" aria-labelledby="tests-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Test reference"
            title={<span id="tests-heading">What each package actually tests</span>}
            description="Sample test names only. They are not a confirmed assay list or a medical recommendation; contact a licensed laboratory for current details."
          />
        </Reveal>

        <Reveal className="mt-8">
          <Accordion type="multiple" className="flex flex-col gap-3">
            {diagnosticPackages.map((pkg) => (
              <AccordionItem key={pkg.id} value={pkg.id}>
                <AccordionTrigger>
                  <span className="flex flex-col gap-1">
                    <span>{pkg.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {pkg.testCount} tests · {pkg.reportTime}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p>{pkg.description}</p>
                  <ul className="mt-3.5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    {pkg.includes.map((test) => (
                      <li key={test} className="flex items-start gap-2 text-foreground/85">
                        <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                        {test}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs">
                    Sample information only. The actual test panel and analytes have not been verified.
                  </p>
                  <Button asChild variant="link" size="sm" className="mt-1 px-0">
                    <a href="#packages">
                      See sample package
                      <ArrowRight aria-hidden />
                    </a>
                  </Button>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </Section>

      <Section id="trust" tone="navy" spacing="default" aria-labelledby="trust-heading">
        <Reveal className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-teal-200 uppercase">
            No connected laboratory service
          </span>
          <h2 id="trust-heading" className="mt-4 text-3xl font-semibold text-white sm:text-4xl lg:text-[2.6rem]">
            Accreditation, sample handling and report review are not provided
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
            ORVEXA does not currently integrate with laboratories or process diagnostic orders. No quality, collection
            or reporting controls are available through this page.
          </p>
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 sm:grid-cols-2">
          {diagnosticsTrust.map((entry) => (
            <RevealItem as="li" key={entry.label} className="h-full">
              <div className="flex h-full gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-teal-200"
                >
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{entry.label}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/65">{entry.detail}</p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Discuss health questions with a clinician</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                ORVEXA cannot interpret sample diagnostic-package data as a real result. For care, contact a qualified
                clinician directly.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/hospitals?view=doctors">
                  <Stethoscope aria-hidden />
                  Discuss results with a specialist
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/help">
                  <LifeBuoy aria-hidden />
                  Help centre
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
