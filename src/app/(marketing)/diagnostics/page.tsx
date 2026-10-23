import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BadgeIndianRupee,
  CalendarClock,
  Check,
  ClipboardList,
  FlaskConical,
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
    "Book NABL-accredited pathology and radiology tests with certified home sample collection in serviceable areas. Digital reports are filed inside your ORVEXA health record.",
  alternates: { canonical: "/diagnostics" },
};

/** Both figures come from the catalogue so the hero can never contradict it. */
const fastestReportHours = Math.min(
  ...diagnosticPackages.map((item) => Number(item.reportTime.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER)),
);
const homeCollectionCount = diagnosticPackages.filter((item) => item.homeCollection).length;

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
    title: "Choose a package or a single test",
    description:
      "Pick from the catalogue or ask the care desk to build a panel. Price, fasting window and report timing are confirmed before you pay.",
    meta: "2 minutes",
  },
  {
    icon: Home,
    title: "A certified phlebotomist reaches you",
    description:
      "In serviceable pin codes a background-verified phlebotomist arrives within 60 minutes of your slot, carrying single-use, pre-barcoded vials.",
    meta: "Within 60 minutes",
  },
  {
    icon: FlaskConical,
    title: "Samples processed at an accredited lab",
    description:
      "Cold-chain transport to the nearest NABL-accredited laboratory, where a pathologist verifies every result before it is released.",
    meta: "Same day",
  },
  {
    icon: ClipboardList,
    title: "Report filed in your ORVEXA record",
    description:
      "The digital report is stored against your patient record and can be shared with any doctor you consult next — no forwarding, no scanning.",
    meta: "In 8–24 hours",
    href: "/dashboard/records",
    hrefLabel: "Open health records",
  },
];

export default function DiagnosticsPage() {
  return (
    <>
      <PageHero
        eyebrow="Diagnostics"
        title="NABL-accredited lab tests with home sample collection"
        description="Every package is processed at a laboratory that holds current NABL accreditation, and in serviceable pin codes a certified phlebotomist reaches you within 60 minutes of your chosen slot. Reports are filed as digital records inside your ORVEXA account, not left as a PDF in an inbox."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Diagnostics", href: "/diagnostics" },
        ]}
        actions={
          <>
            <Button asChild variant="gradient" size="lg">
              <a href="#packages">
                Browse health packages
                <ArrowRight aria-hidden />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#process">How collection works</a>
            </Button>
          </>
        }
        aside={
          <div className="rounded-[1.75rem] border border-border bg-card/85 p-6 shadow-[var(--shadow-panel)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Collection facts</p>
              <Badge variant="demo">Demo</Badge>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground">Laboratory standard</dt>
                <dd className="mt-1 text-2xl font-semibold">NABL</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fastest report</dt>
                <dd className="mt-1 text-2xl font-semibold">{fastestReportHours} hrs</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Packages with home collection</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {homeCollectionCount}/{diagnosticPackages.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tests on platform</dt>
                <dd className="mt-1 text-2xl font-semibold">1,200+</dd>
              </div>
            </dl>
            <ul className="mt-6 space-y-2.5 border-t border-border pt-5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                Accreditation checked and re-verified every year
              </li>
              <li className="flex items-start gap-2">
                <Microscope aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Pathologist sign-off on every released report
              </li>
              <li className="flex items-start gap-2">
                <Timer aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                95% of bookings reported inside the promised window
              </li>
            </ul>
          </div>
        }
      />

      <Section id="packages" spacing="default" aria-labelledby="packages-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Health packages"
            title={<span id="packages-heading">Find the right panel, then book a collection</span>}
            description="Filter by concern, search the tests inside each package and compare prices, fasting requirements and report windows. Discounts are calculated from the listed price and MRP."
            actions={
              <Button asChild variant="outline">
                <a href="#process">
                  What happens after booking
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
          Package prices, test counts and report timings are illustrative samples for Phase 1 reviews. No collection
          request leaves your browser until the laboratory APIs are connected.
        </DemoNotice>
      </Section>

      <Section id="process" tone="muted" spacing="default" aria-labelledby="process-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Sample collection"
            title={<span id="process-heading">From booking to a signed report</span>}
            description="Four steps, each one recorded so you always know where your sample is and who is handling it."
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
            Fasting packages are scheduled in the early slots. Pay only after the collection is confirmed, and
            reschedule free of charge up to two hours before the visit.
          </p>
        </Reveal>
      </Section>

      <Section id="tests" spacing="default" aria-labelledby="tests-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Test reference"
            title={<span id="tests-heading">What each package actually tests</span>}
            description="A quick reference of the headline markers in every package. The complete assay list is shared before collection, and you can ask for a single test instead of a panel."
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
                    Headline markers only. This panel runs {pkg.testCount} analytes in total.
                  </p>
                  <Button asChild variant="link" size="sm" className="mt-1 px-0">
                    <a href="#packages">
                      See price and book this package
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
            Why the report can be trusted
          </span>
          <h2 id="trust-heading" className="mt-4 text-3xl font-semibold text-white sm:text-4xl lg:text-[2.6rem]">
            Accreditation, chain of custody and a second read on imaging
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
            A laboratory result is only useful if you can rely on it later, in front of another doctor. These are the
            controls behind every ORVEXA diagnostics order.
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
              <h2 className="text-2xl font-semibold sm:text-3xl">A result you don&apos;t understand is not a result</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Talk the report through with a specialist, keep every past report in one place, and reach the care desk
                if a value needs a second opinion.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/hospitals?view=doctors">
                  <Stethoscope aria-hidden />
                  Discuss results with a specialist
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/dashboard/records">
                  <ClipboardList aria-hidden />
                  Open health records
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
