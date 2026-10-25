import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Ban, Building2, CircleCheckBig, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

import { RequestDialog, type RequestField } from "@/components/forms/request-dialog";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { partnershipBenefits, providerOnboarding, trustMetrics } from "@/data/content";
import { healthImage } from "@/lib/images";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "About ORVEXA",
  description:
    "About the ORVEXA healthcare project, its current service limitations, supplied Patna provider listings and planned safeguards.",
  alternates: { canonical: "/about" },
};

const missionImage = healthImage(
  "An Indian doctor and a care coordinator reviewing a patient's digital health timeline on a tablet in a bright modern clinic consultation room",
);

/** The three failure modes ORVEXA is designed against. */
const brokenCare = [
  {
    id: "fragmented-records",
    title: "Records live in silos",
    detail:
      "A prescription stays in one hospital's portal, a scan arrives on a CD, a discharge summary sits in a WhatsApp thread. The next doctor starts from zero, and the patient carries the history in their head.",
  },
  {
    id: "opaque-pricing",
    title: "Pricing is opaque until the bill",
    detail:
      "Patients rarely learn what a procedure, a package or a bed costs until the estimate is issued. Comparison shopping is nearly impossible, and surprises arrive at the worst possible moment.",
  },
  {
    id: "insurance-friction",
    title: "Insurance is a paperwork project",
    detail:
      "Pre-authorisation, TPA queries and reimbursement packs consume days of a family's attention while a patient is still recovering. Small documentation errors delay settlement by weeks.",
  },
];

/** How ORVEXA is built in response. */
const approach = [
  {
    id: "connected-record",
    title: "One record, controlled by the patient",
    detail:
      "The product goal is to let patients collect and share their health records. A connected record service is not currently available.",
  },
  {
    id: "coordinated-care",
    title: "Modules that hand off to each other",
    detail:
      "Future integrations may connect consultations, diagnostics, pharmacy and claims. These cross-service workflows are not currently connected.",
  },
  {
    id: "published-standards",
    title: "Standards published, not implied",
    detail:
      "Verification rules, response-time targets and escalation paths should be published before any related service is offered.",
  },
];

/** Explicit boundaries — what ORVEXA is not. */
const boundaries = [
  {
    id: "not-a-hospital",
    title: "Not a hospital, clinic or pharmacy",
    detail:
      "ORVEXA does not own or operate clinical facilities. The supplied Patna directory is unverified and is not a confirmed provider network.",
  },
  {
    id: "not-an-insurer",
    title: "Not an insurer, broker or TPA",
    detail:
      "Policy terms and coverage decisions rest with the insurer. ORVEXA does not currently provide coverage checks or claims-submission services.",
  },
  {
    id: "not-a-clinician",
    title: "Not a replacement for a clinician",
    detail:
      "The AI assistant and health content on ORVEXA are informational. They do not diagnose, prescribe or replace professional judgement. In an emergency, call " +
      siteConfig.emergencyNumber +
      ".",
  },
];

const governancePillars = [
  {
    id: "clinical-review",
    title: "Planned clinical review",
    detail:
      "Clinical review by appropriately qualified professionals should be established before clinical pathways or medicine guidance are offered.",
  },
  {
    id: "verified-providers",
    title: "Provider checks before future listings",
    detail:
      "Provider credentials and registrations need independent verification before any directory is described as verified.",
  },
  {
    id: "escalation-first",
    title: "Escalation for clinical risk",
    detail:
      "Any future clinical workflow needs a tested escalation path; the current AI assistant is informational and is not a substitute for a clinician.",
  },
  {
    id: "protection-by-design",
    title: "Data protection controls",
    detail:
      "Security, privacy and consent controls must be tested and reviewed before real health-record workflows are enabled.",
  },
];

const leadershipRoles = [
  {
    id: "cmo",
    title: "Chief Medical Officer",
    detail:
      "Accountable for clinical safety, pathway review and the escalation policy that decides when ORVEXA refuses to answer automatically.",
  },
  {
    id: "clinical-quality",
    title: "Head of Clinical Quality",
    detail:
      "Owns provider credentialing, incident review and the audit trail behind every listing shown to a patient.",
  },
  {
    id: "data-protection",
    title: "Head of Data Protection",
    detail:
      "Owns consent design, retention schedules, breach response and the grievance process under the Digital Personal Data Protection Act 2023.",
  },
];

const facilityFields: RequestField[] = [
  {
    name: "facilityName",
    label: "Facility name",
    type: "text",
    placeholder: "As registered with the licensing authority",
    required: true,
    autoComplete: "organization",
  },
  {
    name: "facilityType",
    label: "Facility type",
    type: "select",
    options: ["Hospital", "Clinic", "Diagnostic lab", "Pharmacy", "Home-care agency"],
    description: "Onboarding requirements differ by type; this routes your application to the right team.",
  },
  {
    name: "city",
    label: "City",
    type: "text",
    placeholder: "e.g. Bengaluru",
    required: true,
    autoComplete: "address-level2",
  },
  {
    name: "contactPerson",
    label: "Contact person",
    type: "text",
    placeholder: "Full name of the person we should speak to",
    required: true,
    autoComplete: "name",
  },
  {
    name: "role",
    label: "Role at facility",
    type: "text",
    placeholder: "e.g. Hospital administrator, Medical director, Owner",
  },
  {
    name: "phone",
    label: "Phone",
    type: "tel",
    placeholder: "+91 80 4000 1234",
    required: true,
    autoComplete: "tel",
  },
  {
    name: "email",
    label: "Work email",
    type: "email",
    placeholder: "name@yourfacility.in",
    required: true,
    autoComplete: "email",
  },
  {
    name: "beds",
    label: "In-patient beds",
    type: "select",
    options: ["0-10", "11-50", "51-150", "151-400", "400+"],
    description: "Skip this if you are not a hospital or nursing facility.",
  },
  {
    name: "modules",
    label: "Interested modules",
    type: "select",
    options: ["Appointments", "Teleconsult", "Diagnostics", "Pharmacy", "Insurance claims", "Emergency"],
    description: "Pick the one you want to go live with first; the rest can follow.",
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    placeholder:
      "Accreditations, existing HIS or EMR, average monthly footfall, and anything that affects integration.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About ORVEXA"
        title="Indian healthcare works. The records that hold it together do not."
        description="ORVEXA's product goal is to make health information easier to manage and share. A connected patient-record service and the other cross-provider workflows are not available in this build."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "About", href: "/about" },
        ]}
        actions={
          <>
            <Button asChild variant="gradient" size="lg">
              <Link href="/register">
                Create a patient account
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/contact">View contact details</Link>
            </Button>
          </>
        }
      />

      <Section id="mission" spacing="default" aria-labelledby="mission-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Why ORVEXA exists"
            title={<span id="mission-heading">Fragmented care is expensive, and it is normal</span>}
            description="Three problems repeat in almost every Indian patient journey we see. None of them is a shortage of doctors — all three are failures of continuity."
          />
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-12">
          <Reveal>
            <div className="overflow-hidden rounded-[1.75rem] border border-border bg-muted shadow-[var(--shadow-lift)]">
              <Image
                src={missionImage}
                alt="A doctor and a care coordinator reviewing a patient's connected health timeline together in a clinic consultation room"
                width={1024}
                height={768}
                sizes="(min-width: 1024px) 46vw, 92vw"
                className="h-full w-full object-cover"
              />
            </div>
          </Reveal>

          <RevealGroup as="ul" className="flex flex-col gap-4">
            {brokenCare.map((problem) => (
              <RevealItem as="li" key={problem.id}>
                <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
                  <p className="text-sm font-semibold">{problem.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{problem.detail}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>

        <Reveal className="mt-14">
          <h3 className="text-xl font-semibold sm:text-2xl">How ORVEXA is designed to respond</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            These are product goals, not a claim that all modules or integrations are currently available.
          </p>
        </Reveal>

        <RevealGroup as="ul" className="mt-6 grid gap-5 lg:grid-cols-3">
          {approach.map((item) => (
            <RevealItem as="li" key={item.id} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                <span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"
                >
                  <CircleCheckBig className="size-5" />
                </span>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal className="mt-10">
          <div className="rounded-[1.75rem] border border-border bg-muted/50 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-card text-primary">
                <Ban className="size-5" />
              </span>
              <h3 className="text-lg font-semibold sm:text-xl">What ORVEXA deliberately does not do</h3>
            </div>
            <ul className="mt-5 grid gap-5 sm:grid-cols-3">
              {boundaries.map((boundary) => (
                <li key={boundary.id}>
                  <p className="text-sm font-semibold">{boundary.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{boundary.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </Section>

      <Section id="pillars" tone="muted" spacing="default" aria-labelledby="pillars-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Current status"
            title={<span id="pillars-heading">Provider and integration status</span>}
            description="These statements reflect the current implementation and supplied directory, not audited operating metrics."
          />
        </Reveal>

        <RevealGroup
          as="ul"
          className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4"
        >
          {trustMetrics.map((metric) => (
            <RevealItem as="li" key={metric.id} className="h-full bg-card">
              <div className="flex h-full flex-col gap-2 p-6">
                <p className="text-3xl font-semibold tracking-tight text-gradient-brand">{metric.value}</p>
                <p className="text-sm font-semibold">{metric.label}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{metric.detail}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          These status labels are not claims of provider endorsement, medical outcome, or regulatory compliance.
        </p>

        <Reveal className="mt-12">
          <SectionHeading
            eyebrow="Planned safeguards"
            title="Safety principles for future service launches"
            description="These are intended commitments, not evidence of an existing clinical review board, provider-verification operation, or independent security assessment."
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-6 grid gap-5 md:grid-cols-2">
          {governancePillars.map((pillar) => (
            <RevealItem as="li" key={pillar.id} className="h-full">
              <div className="flex h-full gap-4 rounded-2xl border border-border bg-card p-6">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
                >
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{pillar.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{pillar.detail}</p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal className="mt-8">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            The clinical advisory board is being constituted during this phase. Its structure, review cadence and the
            names of its members will be published before general availability.
          </p>
        </Reveal>
      </Section>

      <Section id="stories" spacing="default" aria-labelledby="stories-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Patient stories"
            title={<span id="stories-heading">No verified patient stories published yet</span>}
            description="We will publish patient or provider experiences only when they are real, attributable and shared with consent."
          />
        </Reveal>

        <Reveal className="mt-8">
          <div className="rounded-2xl border border-border bg-card p-6 text-sm leading-relaxed text-muted-foreground">
            No patient or provider testimonials are displayed because none have been independently verified and
            approved for publication.
          </div>
        </Reveal>

        <Reveal className="mt-6">
          <p className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            Looking for practical answers instead?
            <Button asChild variant="link" className="px-0">
              <Link href="/help">
                Visit the help centre
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </p>
        </Reveal>
      </Section>

      <Section id="providers" tone="muted" spacing="default" aria-labelledby="providers-heading">
        <Reveal>
          <SectionHeading
            eyebrow="For providers"
            title={<span id="providers-heading">Provider onboarding is not connected yet</span>}
            description="The form below is a local demonstration only. No facility application is transmitted, stored or reviewed."
            actions={
              <RequestDialog
                triggerLabel="Preview provider onboarding form"
                triggerVariant="gradient"
                triggerSize="lg"
                title="Apply to list your facility"
                description="Enter sample facility details to preview the form. Do not submit patient or confidential information."
                fields={facilityFields}
                footnote="Do not enter real or confidential facility information. This browser-only preview does not transmit or store an application."
              />
            }
          />
        </Reveal>

        <Reveal className="mt-10">
          <h3 className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">Proposed onboarding outline</h3>
        </Reveal>

        <RevealGroup as="ol" className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {providerOnboarding.map((step) => (
            <RevealItem as="li" key={step.id} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-9 place-items-center rounded-xl bg-primary-soft text-xs font-semibold text-primary"
                  >
                    {step.step}
                  </span>
                  <step.icon aria-hidden className="size-4.5 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal className="mt-12">
          <h3 className="text-xl font-semibold sm:text-2xl">Potential future provider capabilities</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            These are roadmap ideas, not available provider services. Booking, claims, pharmacy and records integrations
            are not currently connected.
          </p>
        </Reveal>

        <RevealGroup as="ul" className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {partnershipBenefits.map((benefit) => (
            <RevealItem as="li" key={benefit.id} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6">
                <span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"
                >
                  <benefit.icon className="size-5" />
                </span>
                <p className="text-sm font-semibold">{benefit.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{benefit.description}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <DemoNotice className="mt-8">
          The onboarding steps and provider benefits are illustrative plans only; ORVEXA is not currently accepting or
          processing provider applications.
        </DemoNotice>

        <Reveal className="mt-8">
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
              <Building2 aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
              Prefer to talk it through before applying? Partnerships can walk your team through credentialing,
              tariff bands and integration options.
            </p>
            <Button asChild variant="outline">
              <Link href="/contact">Talk to partnerships</Link>
            </Button>
          </div>
        </Reveal>
      </Section>

      <Section id="leadership" spacing="default" aria-labelledby="leadership-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Planned governance"
            title={<span id="leadership-heading">Roles to establish before service launch</span>}
            description="These are proposed responsibilities, not a statement that named clinical or data-protection officers are currently in post."
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-3">
          {leadershipRoles.map((role) => (
            <RevealItem as="li" key={role.id} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                <p className="text-sm font-semibold">{role.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{role.detail}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal className="mt-8">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            No named profiles are published yet. When ORVEXA reaches general availability, each of these roles will
            list the holder&apos;s name, qualifications and registration details. Until then, questions about clinical
            governance, credentialing or data protection can be routed through the care desk and will be answered in
            writing.
          </p>
        </Reveal>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Start with one record, or one question</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Create a patient account to bring your reports and prescriptions together, see what the platform
                covers today, or ask the care desk anything you are unsure about.
              </p>
              <address className="mt-5 flex flex-col gap-2 text-sm not-italic text-muted-foreground">
                <a
                  href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-2 hover:text-foreground"
                >
                  <Phone aria-hidden className="size-4 shrink-0" />
                  {siteConfig.supportPhone}
                </a>
                <a
                  href={`mailto:${siteConfig.supportEmail}`}
                  className="inline-flex items-center gap-2 hover:text-foreground"
                >
                  <Mail aria-hidden className="size-4 shrink-0" />
                  {siteConfig.supportEmail}
                </a>
                <span className="inline-flex items-start gap-2">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {siteConfig.address}
                </span>
              </address>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/contact">Contact ORVEXA</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/services">Explore services</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/help">Help centre</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
