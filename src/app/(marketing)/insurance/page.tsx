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
    "Compare health insurance plans side by side, check cashless eligibility at a specific hospital and follow a claim from pre-authorisation to settlement. ORVEXA is a facilitator, not an insurer.",
  alternates: { canonical: "/insurance" },
};

/** Derived from the plan and provider data so the forms can never drift from it. */
const insurers = Array.from(new Set(insurancePlans.map((plan) => plan.provider))).sort();
const hospitalCities = Array.from(new Set(hospitals.map((hospital) => hospital.city))).sort();
const cashlessHospitalCount = hospitals.filter((hospital) => hospital.cashlessInsurance).length;

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
    detail: "Planned admissions need approval first; emergencies are usually reviewed within 24 to 72 hours.",
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
    description: "The claims desk calls this number for any document the insurer asks for.",
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
        title="Understand your cover before the bill arrives"
        description="Compare plans on the numbers that decide a claim, check whether a specific hospital accepts cashless admission under your policy, and follow a claim from pre-authorisation through to settlement — with the paperwork tracked in one place."
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
              <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Read this first</p>
              <ShieldAlert aria-hidden className="size-4 shrink-0 text-warning" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              ORVEXA is a health platform and claims facilitator. We are not an insurer, not a broker and not a TPA, and
              we do not sell policies.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Every premium, network size and settlement ratio on this page is an illustrative sample for Phase 1
              reviews. Your actual cover depends entirely on your policy wording.
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5">
              <div>
                <dt className="text-xs text-muted-foreground">Plans compared</dt>
                <dd className="mt-1 text-2xl font-semibold">{insurancePlans.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Hospitals accepting cashless</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {cashlessHospitalCount}/{hospitals.length}
                </dd>
              </div>
            </dl>
          </div>
        }
      />

      <Section id="plans" spacing="default" aria-labelledby="plans-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Plan comparison"
            title={<span id="plans-heading">Line up the plans that fit your household</span>}
            description="Filter by cover amount, premium and cashless network size, then tick up to three plans to compare cover, waiting periods and the fine print that decides most claims."
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
            eyebrow="Claims desk"
            title={<span id="claims-heading">What actually happens to a claim</span>}
            description="Pre-authorisation, TPA queries, discharge summaries and reimbursement packs — the sequence most people only learn about during an admission."
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
                className="grid size-11 place-items-center rounded-2xl bg-teal-soft text-teal-deep dark:bg-teal-mid/15 dark:text-teal-mid"
              >
                <Wallet className="size-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold">Start a claim with our desk</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Share the policy, hospital and treatment details once. We prepare the pre-authorisation form or the
                  reimbursement pack, then follow the insurer and its TPA until the claim is settled.
                </p>
              </div>
              <ul className="flex flex-col gap-2.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                  Cashless admission: the hospital bills the insurer directly once approval lands.
                </li>
                <li className="flex items-start gap-2">
                  <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                  Reimbursement: discharge summary, investigation reports and original bills in one tracked pack.
                </li>
                <li className="flex items-start gap-2">
                  <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                  Every query raised by the TPA is flagged back to you with the exact document needed.
                </li>
              </ul>
              <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-5">
                <RequestDialog
                  triggerLabel="Start a claim"
                  triggerVariant="gradient"
                  title="Start an insurance claim"
                  description="Tell us about the policy and the treatment. The claims desk uses this to prepare the pre-authorisation form or the reimbursement pack."
                  fields={claimFields}
                  submitLabel="Send claim details"
                  successTitle="Claim details ready"
                  successBody="The claims desk would match this against your policy, prepare the right form and share the document checklist within one working day."
                  footnote="Phase 1 has no claims backend yet. This form validates your details and shows the confirmation state, but no claim information leaves your browser and nothing is filed with any insurer or TPA."
                />
                <Button asChild variant="outline">
                  <a href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}>
                    <PhoneCall aria-hidden />
                    Talk to the claims desk
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
            eyebrow="Guides"
            title={<span id="guides-heading">Plain-language notes before you buy or claim</span>}
            description="Short explainers written for Indian policies. These are general notes, not advice on your specific policy wording."
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
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-teal-200 uppercase">
              Cashless eligibility
            </span>
            <h2
              id="eligibility-heading"
              className="mt-4 text-3xl font-semibold text-white sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]"
            >
              Check before you are admitted, not at the billing counter
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
              Four conditions decide whether an admission is genuinely cashless. We can check the first one against the
              insurer&apos;s published network today, and prepare the rest for the pre-authorisation request.
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {eligibilityFactors.map((factor) => (
                <li key={factor.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <span
                    aria-hidden
                    className="grid size-9 place-items-center rounded-xl bg-white/10 text-teal-200"
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
              <h3 className="mt-4 text-lg font-semibold">Check my eligibility</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Send us the insurer, policy number and the hospital you plan to use. The care desk replies with the
                network status and the documents the admission will need.
              </p>
              <div className="mt-5">
                <RequestDialog
                  triggerLabel="Check my eligibility"
                  triggerVariant="gradient"
                  title="Check cashless eligibility"
                  description="Share your insurer and the hospital you plan to use. We check the published network list and list the documents the admission will need."
                  fields={eligibilityFields}
                  submitLabel="Check my eligibility"
                  successTitle="Eligibility request ready"
                  successBody="The care desk would check your policy against the hospital's network list and reply with the pre-authorisation checklist."
                  footnote="Phase 1 cannot query the insurer or its TPA directly. This form validates your details and shows the confirmation state, but no verification request is sent anywhere and no policy data leaves your browser."
                />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                For an emergency admission, do not wait for this check. Get the patient treated first, inform the insurer
                within 24 hours, and let the desk handle the paperwork alongside.
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
                We aggregate publicly available plan information and illustrative figures so you can compare like for
                like. Insurers change their terms without notice.
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
                Filter the hospital network for cashless insurance and 24×7 emergency cover, or ask the care desk to find
                a facility that accepts your policy.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/hospitals">
                  <Building2 aria-hidden />
                  Find a cashless hospital
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
                  Contact the care desk
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
