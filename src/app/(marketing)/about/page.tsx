import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Ban, Building2, CircleCheckBig, Quote, ShieldCheck, Star } from "lucide-react";

import { RequestDialog, type RequestField } from "@/components/forms/request-dialog";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { partnershipBenefits, providerOnboarding, testimonials, trustMetrics } from "@/data/content";
import { healthImage } from "@/lib/images";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "About ORVEXA",
  description:
    "ORVEXA is an Indian health platform built around one connected, patient-controlled record. Read why fragmented records, opaque pricing and insurance friction hold care back, how we work with hospitals and clinics, and how to list your facility.",
  alternates: { canonical: "/about" },
};

const missionImage = healthImage(
  "An Indian doctor and a care coordinator reviewing a patient's digital health timeline on a tablet in a bright modern clinic consultation room",
  "landscape_4_3",
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
      "Consultations, prescriptions, reports, discharges and invoices accumulate in a single timeline that the patient can share, and stop sharing, whenever they choose.",
  },
  {
    id: "coordinated-care",
    title: "Modules that hand off to each other",
    detail:
      "A consultation can open a lab order, a lab report can open a pharmacy order, and a pharmacy order can open a claim. The patient should not have to be the integration layer.",
  },
  {
    id: "published-standards",
    title: "Standards published, not implied",
    detail:
      "Verification rules, response-time targets and escalation paths are written down where patients and providers can hold us to them, including the parts we have not solved yet.",
  },
];

/** Explicit boundaries — what ORVEXA is not. */
const boundaries = [
  {
    id: "not-a-hospital",
    title: "Not a hospital, clinic or pharmacy",
    detail:
      "ORVEXA does not own or operate clinical facilities. Care is delivered by licensed, independently governed providers on our network.",
  },
  {
    id: "not-an-insurer",
    title: "Not an insurer, broker or TPA",
    detail:
      "Policy terms, coverage decisions and settlement outcomes rest with the insurer. We prepare, submit and track paperwork on the patient's behalf.",
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
    title: "Clinical review before release",
    detail:
      "Care pathways, triage bands and patient-facing medicine guidance are checked against published clinical guidance by practising clinicians before they ship.",
  },
  {
    id: "verified-providers",
    title: "Verification, then re-verification",
    detail:
      "Registration numbers, accreditations and doctor council registrations are validated before a listing goes live, and re-checked when they are due for renewal.",
  },
  {
    id: "escalation-first",
    title: "Escalation over automation",
    detail:
      "Where a question carries clinical risk, the product routes to a person — care desk, pharmacist or doctor — instead of answering. Automation is for logistics, not judgement.",
  },
  {
    id: "protection-by-design",
    title: "Protection by design",
    detail:
      "Health records are encrypted at rest, every share is time-limited and revocable, and each access is written to the patient's own consent history.",
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
        description="A patient in Coimbatore may see three hospitals, two laboratories and four pharmacies in a decade, and not one of them holds the full picture. ORVEXA exists to make that picture portable, legible and controlled by the person it belongs to."
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
              <Link href="/contact">Talk to the care desk</Link>
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
          <h3 className="text-xl font-semibold sm:text-2xl">How ORVEXA responds</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Not with another portal, but with one continuous record and modules that pass work between each other
            instead of handing it back to the patient.
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
            eyebrow="Governance"
            title={<span id="pillars-heading">Accountability behind every module</span>}
            description="The platform measures itself on four commitments. They are written here so patients and provider partners can hold us to them."
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

        <DemoNotice className="mt-6">
          Network sizes, consultation volumes and response metrics shown above are Phase 1 sampling figures used for
          review. They are not audited operating results and will be replaced with verified reporting at launch.
        </DemoNotice>

        <RevealGroup as="ul" className="mt-12 grid gap-5 md:grid-cols-2">
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
            title={<span id="stories-heading">What coordinated care feels like</span>}
            description="Six journeys that show the difference between a platform and a directory: a claim settled before arrival, an ambulance that reached the door, a monthly refill nobody had to remember."
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <RevealItem as="li" key={testimonial.id} className="h-full">
              <figure className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                <Quote aria-hidden className="size-6 text-primary/40" />
                <blockquote className="text-sm leading-relaxed text-foreground/90">{testimonial.quote}</blockquote>
                <figcaption className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
                  <span>
                    <span className="block text-sm font-semibold">{testimonial.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {testimonial.role} · {testimonial.city}
                    </span>
                  </span>
                  <span className="flex items-center gap-0.5" aria-label={`${testimonial.rating} out of 5`}>
                    {Array.from({ length: 5 }).map((_, starIndex) => (
                      <Star
                        key={starIndex}
                        aria-hidden
                        className={
                          starIndex < testimonial.rating
                            ? "size-3.5 fill-amber-400 text-amber-400"
                            : "size-3.5 text-muted-foreground/40"
                        }
                      />
                    ))}
                  </span>
                </figcaption>
              </figure>
            </RevealItem>
          ))}
        </RevealGroup>

        <DemoNotice className="mt-8">
          These stories are illustrative composites written for Phase 1 review. They do not describe named, verified
          customers, and the outcomes in them are not guarantees. Consented, attributable stories will be published with
          the patient&apos;s or provider&apos;s approval after launch.
        </DemoNotice>

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
            title={<span id="providers-heading">List your facility on ORVEXA</span>}
            description="Hospitals, clinics, diagnostic labs, pharmacies and home-care agencies all onboard through the same verification track. Nothing goes live until credentials are checked against the issuing registry."
            actions={
              <RequestDialog
                triggerLabel="Apply to list your facility"
                triggerVariant="gradient"
                triggerSize="lg"
                title="Apply to list your facility"
                description="Share a few details about your facility. Verification usually takes about 72 hours once the licence and accreditation documents are in hand."
                fields={facilityFields}
                submitLabel="Submit application"
                successTitle="Application ready to review"
                successBody="In production, this would reach the partnerships team, who would reply with a document checklist for your facility type within two working days."
                footnote="Phase 1 has no onboarding backend. This form validates your details and shows the confirmation state, but no application is transmitted or stored."
              />
            }
          />
        </Reveal>

        <Reveal className="mt-10">
          <h3 className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">Onboarding track</h3>
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
          <h3 className="text-xl font-semibold sm:text-2xl">What partners get from the platform</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Listing on ORVEXA is not a directory entry. Bookings, pre-authorisation requests, pharmacy orders and
            discharge documents flow through one console with the paperwork already structured.
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
          Verification timelines, slot-fill and claim-desk outcomes described above are Phase 1 commitments in
          progress, not measured results. Provider console access arrives with the provider APIs in Phase 2.
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
            eyebrow="Leadership"
            title={<span id="leadership-heading">The roles accountable for clinical and data safety</span>}
            description="ORVEXA publishes responsibilities now and names at launch. Each function below has a single accountable owner, not a committee."
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
