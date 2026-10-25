import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  LifeBuoy,
  PhoneCall,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { RequestDialog, type RequestField } from "@/components/forms/request-dialog";
import { PlanComparison } from "@/components/insurance/plan-comparison";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { claimSteps, insuranceGuides, insurancePlans } from "@/data/insurance";
import { hospitals } from "@/data/providers";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Health insurance",
  description:
    "Browse sample insurance information. ORVEXA has no connected insurer, quote, eligibility, cashless-network or claim-submission integration.",
  alternates: { canonical: "/insurance" },
};

/** Derived from the plan and provider data so the forms can never drift from it. */
const insurers = Array.from(new Set(insurancePlans.map((plan) => plan.provider))).sort();
const hospitalCities = Array.from(new Set(hospitals.map((hospital) => hospital.city))).sort();
const eligibilityFactors = [
  {
    title: "Is the hospital in the insurer's network?",
    detail: "Cashless admission only works at hospitals that have a live agreement with your insurer or its TPA.",
  },
  {
    title: "Is the procedure covered, and is the waiting period served?",
    detail: "Initial, pre-existing and specific-disease waiting periods are counted differently by every policy.",
  },
  {
    title: "Does the room category match the policy cap?",
    detail: "Choosing a room above the eligible category can turn a cashless claim into a partial reimbursement.",
  },
  {
    title: "Has pre-authorisation been approved before admission?",
    detail: "Approval requirements and timelines vary by insurer and policy. Confirm them directly with the insurer or TPA.",
  },
];

const claimTypeOptions = ["Cashless admission", "Reimbursement"];

const claimFields: RequestField[] = [
  {
    name: "policyHolderName",
    label: "Policy holder name",
    placeholder: "Full name as on the policy",
    required: true,
    autoComplete: "name",
  },
  {
    name: "phone",
    label: "Mobile number",
    type: "tel",
    placeholder: "+91 98450 12093",
    required: true,
    autoComplete: "tel",
    description: "This preview does not submit or transmit claim information.",
  },
  { name: "insurer", label: "Insurer", type: "select", options: insurers, required: true },
  {
    name: "policyNumber",
    label: "Policy number",
    placeholder: "e.g. BA/HLTH/2026/018421",
    required: true,
  },
  { name: "hospitalName", label: "Hospital", placeholder: "Hospital or clinic name", required: true },
  {
    name: "treatmentDate",
    label: "Treatment or admission date",
    placeholder: "e.g. 12/09/2026",
    required: true,
    description:
      "Enter any date, past or future. Past dates are the normal case for reimbursement claims, so this is a text field rather than a date picker in Phase 1.",
  },
  {
    name: "claimAmount",
    label: "Claim amount",
    placeholder: "e.g. 185000",
    required: true,
    description: "The hospital estimate for a planned admission, or the billed amount for reimbursement.",
  },
  {
    name: "claimType",
    label: "Claim type",
    type: "select",
    options: claimTypeOptions,
    defaultValue: claimTypeOptions[0],
    required: true,
  },
  {
    name: "notes",
    label: "What are you claiming for?",
    type: "textarea",
    placeholder: "Diagnosis, procedure, admission date and any document already submitted",
  },
];

const eligibilityFields: RequestField[] = [
  { name: "insurer", label: "Insurer", type: "select", options: insurers, required: true },
  {
    name: "policyNumber",
    label: "Policy number",
    placeholder: "e.g. SG/FF/2026/004417",
    required: true,
  },
  {
    name: "hospitalName",
    label: "Hospital you plan to use",
    placeholder: "Hospital or clinic name",
    required: true,
  },
  { name: "city", label: "City", type: "select", options: hospitalCities, required: true },
  {
    name: "phone",
    label: "Mobile number",
    type: "tel",
    placeholder: "+91 98450 12093",
    required: true,
    autoComplete: "tel",
  },
];

export default function InsurancePage() {
  return (
    <>
      <PageHero
        eyebrow="Insurance"
        title="Sample insurance information"
        description="Plan details on this page are illustrative and unverified. ORVEXA cannot sell policies, quote premiums, check cashless eligibility, submit claims or track insurer decisions."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Insurance", href: "/insurance" },
        ]}
        actions={
          <>
            <Button asChild variant="gradient" size="lg">
              <a href="#plans">
                Compare plans
                <ArrowRight aria-hidden />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#claims">See how a claim runs</a>
            </Button>
          </>
        }
        aside={
          <div className="rounded-[1.75rem] border border-border bg-card/85 p-6 shadow-[var(--shadow-panel)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow text-primary">Read this first</p>
              <ShieldAlert aria-hidden className="size-4 shrink-0 text-warning" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              ORVEXA is not an insurer, broker or TPA. No insurer or claims integration is connected to this build.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Plan names, premiums, network sizes and settlement ratios are sample data, not verified or current offers.
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5">
              <div>
                <dt className="text-xs text-muted-foreground">Sample plans</dt>
                <dd className="mt-1 text-2xl font-semibold">{insurancePlans.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Network checks</dt>
                <dd className="mt-1 text-2xl font-semibold">Unavailable</dd>
              </div>
            </dl>
          </div>
        }
      />

      <Section id="plans" spacing="default" aria-labelledby="plans-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Sample catalogue"
            title={<span id="plans-heading">Explore illustrative plan entries</span>}
            description="Filter the sample plan data and compare the displayed fields. None of the plans, prices, network sizes or settlement figures are verified or linked to insurers."
          />
        </Reveal>
        <div className="mt-8">
          <PlanComparison />
        </div>
        <DemoNotice className="mt-8">
          Plan names, insurers, premiums, network sizes and settlement ratios are illustrative samples. They are not an
          offer of insurance and are not linked to any insurer&apos;s live pricing.
        </DemoNotice>
      </Section>

      <Section id="claims" tone="muted" spacing="default" aria-labelledby="claims-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Not connected"
            title={<span id="claims-heading">Insurance claims are unavailable</span>}
            description="ORVEXA does not check coverage, file pre-authorisations, assemble claim packs, contact TPAs or track claim decisions."
          />
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <Reveal>
            <ol className="flex flex-col gap-5 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-7">
              {claimSteps.map((step, index) => (
                <li key={step.id} className="flex gap-4">
                  <span className="flex flex-col items-center">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card text-xs font-semibold text-primary"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {index < claimSteps.length - 1 ? <span aria-hidden className="mt-1 w-px flex-1 bg-border" /> : null}
                  </span>
                  <div className="pb-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <step.icon aria-hidden className="size-4 text-muted-foreground" />
                      {step.title}
                      <Badge variant="neutral">{step.duration}</Badge>
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>

          <Reveal delay={0.07}>
            <div className="flex flex-col gap-5 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-7">
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-2xl bg-leaf-soft text-leaf-deep dark:bg-leaf-mid/15 dark:text-leaf-mid"
              >
                <Wallet className="size-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold">No claim service is connected</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Contact your insurer, TPA or hospital directly to confirm coverage and claims requirements.
                </p>
              </div>
              <ul className="flex flex-col gap-2.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                  ORVEXA cannot determine whether a hospital or treatment is covered.
                </li>
                <li className="flex items-start gap-2">
                  <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                  ORVEXA does not create or track reimbursement submissions.
                </li>
                <li className="flex items-start gap-2">
                  <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                  No policy data entered here is sent to an insurer or TPA.
                </li>
              </ul>
              <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-5">
                <RequestDialog
                  triggerLabel="Preview claim form"
                  triggerVariant="gradient"
                  title="Insurance claim form preview"
                  description="Insurance claims are not connected to ORVEXA. This sample form does not submit a claim."
                  fields={claimFields}
                  footnote="Do not enter real policy or medical details. This browser-only preview does not contact an insurer, submit a claim or transmit your information."
                />
                <Button asChild variant="outline">
                  <a href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}>
                    <PhoneCall aria-hidden />
                    Call the provided contact number
                  </a>
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section id="guides" spacing="default" aria-labelledby="guides-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Sample information"
            title={<span id="guides-heading">General insurance information</span>}
            description="These notes are general and unverified. They are not financial, insurance or medical advice; confirm details with your insurer and review policy documents."
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-3">
          {insuranceGuides.map((guide) => (
            <RevealItem as="li" key={guide.id} className="h-full">
              <article className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                <span
                  aria-hidden
                  className="grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary"
                >
                  <guide.icon className="size-5" />
                </span>
                <h3 className="text-lg font-semibold">{guide.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{guide.description}</p>
                <Accordion type="single" collapsible className="mt-auto">
                  <AccordionItem value={guide.id} className="border-0 bg-transparent">
                    <AccordionTrigger className="text-sm">Read guide</AccordionTrigger>
                    <AccordionContent>
                      <ul className="flex flex-col gap-2.5">
                        {guide.points.map((point) => (
                          <li key={point} className="flex items-start gap-2">
                            <BadgeCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                            <span className="text-foreground/85">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section id="eligibility" tone="navy" spacing="default" aria-labelledby="eligibility-heading">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-start">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 eyebrow text-lime-200">
              Eligibility checks unavailable
            </span>
            <h2
              id="eligibility-heading"
              className="mt-4 text-3xl font-semibold text-white sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]"
            >
              ORVEXA cannot check policy eligibility
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
              The sample directory and plan data are not connected to insurer networks or policy terms. Confirm all
              coverage and approval questions directly with your insurer, TPA and hospital.
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {eligibilityFactors.map((factor) => (
                <li key={factor.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <span
                    aria-hidden
                    className="grid size-9 place-items-center rounded-xl bg-white/10 text-lime-200"
                  >
                    <ShieldCheck className="size-4.5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-white">{factor.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/65">{factor.detail}</p>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.07}>
            <div className="rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-panel)] sm:p-7">
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary"
              >
                <Building2 className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">Eligibility form preview</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                This browser-only preview does not check network status or return policy requirements. Do not enter real
                policy or personal information.
              </p>
              <div className="mt-5">
                <RequestDialog
                  triggerLabel="Preview eligibility form"
                  triggerVariant="gradient"
                  title="Eligibility form preview"
                  description="ORVEXA does not verify policy eligibility or hospital network status."
                  fields={eligibilityFields}
                  footnote="Do not enter real policy details. This browser-only preview does not query an insurer or transmit information."
                />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                For emergencies, call 108 directly and follow the dispatcher&apos;s instructions. ORVEXA cannot verify
                coverage or handle the claim.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
            <h2 className="text-xl font-semibold sm:text-2xl">What ORVEXA is, and is not</h2>
            <ul className="mt-5 grid gap-3.5 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
              <li className="flex items-start gap-2.5">
                <Check aria-hidden className="mt-1 size-4 shrink-0 text-primary" />
                ORVEXA is not an insurer and not a third-party administrator. We do not underwrite risk, collect premiums
                or decide claims.
              </li>
              <li className="flex items-start gap-2.5">
                <Check aria-hidden className="mt-1 size-4 shrink-0 text-primary" />
                Plan entries and figures on this page are illustrative and are not linked to insurers or current policy
                documents.
              </li>
              <li className="flex items-start gap-2.5">
                <Check aria-hidden className="mt-1 size-4 shrink-0 text-primary" />
                Whether a treatment is covered, and to what extent, depends only on your policy wording, the insurer and
                its TPA.
              </li>
              <li className="flex items-start gap-2.5">
                <Check aria-hidden className="mt-1 size-4 shrink-0 text-primary" />
                Nothing on this page is financial advice, insurance advice or medical advice. Read the policy document and
                the schedule of benefits before you buy.
              </li>
            </ul>
          </div>
        </Reveal>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Know which hospital will treat you cashless</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                The provider directory has no verified cashless-network or emergency-hours data. Contact each hospital
                and your insurer directly.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/hospitals">
                  <Building2 aria-hidden />
                  Browse provider listings
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/help">
                  <LifeBuoy aria-hidden />
                  Help centre
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/contact">
                  View contact details
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
