import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Barcode,
  ClipboardCheck,
  Clock,
  FileText,
  Headset,
  ListChecks,
  MapPin,
  MessageCircle,
  PackageCheck,
  PhoneCall,
  RotateCcw,
  Route,
  ShieldCheck,
  Siren,
  Snowflake,
  ThermometerSnowflake,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { RequestDialog } from "@/components/forms/request-dialog";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { MedicineBrowser } from "@/components/pharmacy/medicine-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { medicineCategories, medicines, pharmacyHighlights } from "@/data/pharmacy";
import { healthImage } from "@/lib/images";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "MediCare pharmacy",
  description:
    "Genuine medicines sourced from manufacturer-authorised distributors, verified by licensed pharmacists and delivered in 90 minutes across serviceable pin codes. Schedule H and H1 orders need a valid prescription.",
  alternates: { canonical: "/pharmacy" },
};

const qualityImage = healthImage(
  "Indian pharmacist in a clean licensed pharmacy checking medicine strips against a printed prescription, temperature-controlled storage cabinet behind the counter, soft daylight, professional healthcare photography",
  "landscape_4_3",
);

type JourneyStep = {
  icon: typeof Upload;
  title: string;
  description: string;
  actionLabel: string | null;
  actionHref: string | null;
};

const journeySteps: JourneyStep[] = [
  {
    icon: Upload,
    title: "Send or forward your prescription",
    description:
      "Photograph a paper prescription, or forward the e-prescription your doctor issued on ORVEXA. Tell us the patient name and delivery pin code so the pharmacist can match it correctly.",
    actionLabel: "Prescription help",
    actionHref: "/help#pharmacy",
  },
  {
    icon: ClipboardCheck,
    title: "A licensed pharmacist verifies it",
    description:
      "The pharmacist reads the prescriber registration number, patient name, drug, strength, dose and duration, and confirms the prescription has not been altered. If anything is unclear, we call you before packing.",
    actionLabel: "No prescription? Consult online",
    actionHref: "/services#telemedicine",
  },
  {
    icon: Snowflake,
    title: "Packed, with cold chain where required",
    description:
      "Insulin, vaccines and select biologics travel in validated 2–8°C boxes with a temperature logger. Everything else is packed with the batch number, expiry date and pharmacist name on the label.",
    actionLabel: "See storage standards",
    actionHref: "#quality",
  },
  {
    icon: Route,
    title: "Dispatched with live tracking",
    description:
      "You get the pharmacist who approved the order, the batch details for each line and a live tracking link from the fulfilment hub to your door.",
    actionLabel: null,
    actionHref: null,
  },
];

type QualityCheck = {
  icon: typeof ShieldCheck;
  title: string;
  detail: string;
};

const qualityChecks: QualityCheck[] = [
  {
    icon: ShieldCheck,
    title: "Licensed pharmacy registration",
    detail:
      "Every MediCare fulfilment hub holds a drug licence issued under the Drugs and Cosmetics Rules. The licence number and the verifying pharmacist appear on each invoice.",
  },
  {
    icon: Barcode,
    title: "Expiry and batch checks",
    detail:
      "Stock is scanned by batch on arrival and again at packing. Anything within six months of expiry is pulled from sale rather than shipped to you.",
  },
  {
    icon: ThermometerSnowflake,
    title: "Temperature-controlled storage",
    detail:
      "Insulin, vaccines and temperature-sensitive biologics are held at 2–8°C in monitored cabinets, with excursion alerts and a data logger in every cold-chain parcel.",
  },
  {
    icon: PackageCheck,
    title: "Tamper-evident packaging",
    detail:
      "Parcels are sealed with serialised, tamper-evident tape. If the seal is broken on arrival, the pharmacist replaces the order at no cost.",
  },
  {
    icon: RotateCcw,
    title: "A returns policy that is honest",
    detail:
      "Wrong or damaged items are replaced free of charge. Correctly dispensed medicines cannot be taken back once they leave the hub, for patient-safety reasons.",
  },
];

export default function PharmacyPage() {
  return (
    <>
      <PageHero
        eyebrow="MediCare pharmacy"
        title="Genuine medicines, delivered to your doorstep"
        description="MediCare sources only from manufacturer-authorised distributors with batch traceability, has a registered pharmacist verify every prescription order before dispatch, and delivers in 90 minutes across serviceable metro pin codes."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Pharmacy", href: "/pharmacy" },
        ]}
        actions={
          <>
            <Button asChild variant="gradient" size="lg">
              <a href="#catalogue">
                Browse medicines
                <ArrowRight aria-hidden />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#prescription">How prescriptions work</a>
            </Button>
          </>
        }
        aside={
          <div className="rounded-[1.75rem] border border-border bg-card/85 p-6 shadow-[var(--shadow-panel)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Delivery promise</p>
              <Badge variant="demo">Demo</Badge>
            </div>
            <ul className="mt-5 flex flex-col gap-4">
              <li className="flex gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Clock className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">90-minute delivery</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Metro pin codes, for prescription orders cleared before 8 PM.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <ShieldCheck className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Genuine or refund</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    A counterfeit or wrongly dispensed item is replaced and refunded in full.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-soft text-cyan-deep dark:bg-cyan-mid/15 dark:text-cyan-mid">
                  <Snowflake className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Cold-chain packing</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Validated 2–8°C boxes with a temperature logger for insulin and vaccines.
                  </p>
                </div>
              </li>
            </ul>
            <p className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
              Delivery windows and serviceable pin codes shown here are sample values for Phase 1 reviews.
            </p>
          </div>
        }
      />

      <Section id="highlights" tone="muted" spacing="default" aria-labelledby="highlights-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Why MediCare"
            title={<span id="highlights-heading">A pharmacy counter you never have to queue at</span>}
            description="Four things MediCare does the same way every time, for every order, whether it is one strip of paracetamol or a month of chronic-care refills."
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pharmacyHighlights.map((highlight) => (
            <RevealItem as="li" key={highlight.title} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <highlight.icon className="size-5" />
                </span>
                <p className="text-sm font-semibold">{highlight.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{highlight.detail}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section id="catalogue" spacing="default" aria-labelledby="catalogue-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Catalogue"
            title={<span id="catalogue-heading">Search the MediCare inventory</span>}
            description={`Filter ${medicines.length} sample medicines across ${medicineCategories.length} categories, sort by price or discount, and build a cart. A pharmacist approves every prescription-only line before dispatch.`}
          />
        </Reveal>
        <div className="mt-8">
          <MedicineBrowser />
        </div>
        <DemoNotice className="mt-8">
          Medicines, prices, stock levels and delivery windows are illustrative samples. The cart and checkout validate
          the flow in your browser only — no order is placed and no payment is taken in Phase 1.
        </DemoNotice>
      </Section>

      <Section id="how-it-works" tone="muted" spacing="default" aria-labelledby="how-it-works-heading">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title={<span id="how-it-works-heading">From prescription to doorstep in four steps</span>}
            description="Each step is designed so nothing is dispensed on assumption. Where a step depends on your input, the action is one tap away."
          />
        </Reveal>

        <RevealGroup as="ol" className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {journeySteps.map((step, index) => (
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
                {step.actionLabel && step.actionHref ? (
                  <Button asChild variant="link" size="sm" className="mt-auto justify-start px-0">
                    <Link href={step.actionHref}>
                      {step.actionLabel}
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                ) : (
                  <Badge variant="neutral" className="mt-auto w-fit">
                    Phase 2
                  </Badge>
                )}
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section id="prescription" tone="navy" spacing="default" aria-labelledby="prescription-heading">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(38rem_24rem_at_12%_0%,rgba(34,211,238,0.22),transparent_62%),radial-gradient(34rem_22rem_at_88%_100%,rgba(45,212,191,0.2),transparent_60%)]"
        />
        <div className="relative grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-teal-200 uppercase">
                Prescription policy
              </span>
              <h2
                id="prescription-heading"
                className="mt-4 text-3xl font-semibold text-white sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]"
              >
                What we can and cannot dispense without a prescription
              </h2>
              <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
                Indian law is specific about prescription medicines, and MediCare follows it to the letter. Here is
                exactly how verification works, and where we draw the line.
              </p>
            </Reveal>

            <Reveal className="mt-8">
              <ul className="flex flex-col gap-4">
                <li className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-teal-200">
                    <FileText className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Schedule H and H1 medicines need a valid prescription</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                      Antibiotics, cardiac and diabetes medicines, psychiatric drugs and habit-forming substances are
                      Schedule H or H1 under the Drugs and Cosmetics Act, 1940. We cannot dispense them without a
                      prescription from a registered medical practitioner.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-teal-200">
                    <ListChecks className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">How ORVEXA verifies your prescription</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                      A registered pharmacist checks the prescriber registration number, the patient name, the drug,
                      strength, dose and duration, and confirms the document has not been altered or reused. If a
                      detail is missing or illegible, the pharmacist calls you before packing — no substitute is chosen
                      by an algorithm.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-amber-300">
                    <TriangleAlert className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Restricted and habit-forming medicines</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                      Schedule X and narcotic drugs are not sold through MediCare delivery at all. For habit-forming
                      medicines we cap the quantity per order, require a second pharmacist to countersign, and log the
                      dispense record — so the same prescription cannot be filled repeatedly.
                    </p>
                  </div>
                </li>
              </ul>
            </Reveal>
          </div>

          <Reveal delay={0.08}>
            <div className="flex flex-col gap-5 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-teal-200">
                  <Headset className="size-5" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-white">Talk to a pharmacist</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                    Not sure whether your prescription is valid, or whether a medicine is available in your pin code?
                    Send the question and a pharmacist will pick it up.
                  </p>
                </div>
              </div>

              <RequestDialog
                triggerLabel="Talk to a pharmacist"
                triggerSize="lg"
                triggerClassName="w-full"
                title="Ask a MediCare pharmacist"
                description="Describe what you need clarified. A registered pharmacist reviews prescription, availability and dosage questions."
                fields={[
                  {
                    name: "patientName",
                    label: "Patient name",
                    placeholder: "Full name as per records",
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
                  },
                  {
                    name: "queryType",
                    label: "What is this about?",
                    type: "select",
                    options: [
                      "Prescription verification",
                      "Medicine availability",
                      "Dosage guidance",
                      "Returns",
                      "Something else",
                    ],
                    defaultValue: "Prescription verification",
                    required: true,
                  },
                  {
                    name: "prescriptionRef",
                    label: "Prescription reference",
                    placeholder: "Optional — the order or prescription ID",
                  },
                  {
                    name: "question",
                    label: "Your question",
                    type: "textarea",
                    placeholder: "Tell the pharmacist what you need clarified",
                    required: true,
                  },
                ]}
                submitLabel="Send to a pharmacist"
                successTitle="Question ready for review"
                successBody="A registered pharmacist would receive your question, the prescription reference and the number to call you back on."
                footnote="Phase 1 has no pharmacist messaging backend yet. This form validates your details and shows the confirmation state, but no message reaches a pharmacist and no prescription is verified by submitting it."
              />

              <p className="flex items-start gap-2 border-t border-white/10 pt-5 text-xs leading-relaxed text-white/60">
                <PhoneCall aria-hidden className="mt-0.5 size-3.5 shrink-0 text-teal-200" />
                For anything urgent, call the MediCare desk on{" "}
                <a
                  href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}
                  className="font-medium text-white underline underline-offset-4"
                >
                  {siteConfig.supportPhone}
                </a>
                . This is not an emergency line.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section id="quality" spacing="default" aria-labelledby="quality-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Trust &amp; quality"
            title={<span id="quality-heading">The checks behind every parcel</span>}
            description="Medicine is not a normal product. These are the standards MediCare holds itself to before an order leaves the hub."
          />
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          <Reveal>
            <div className="overflow-hidden rounded-[1.75rem] border border-border bg-muted shadow-[var(--shadow-lift)]">
              <Image
                src={qualityImage}
                alt="A licensed pharmacist checking medicines against a prescription in a temperature-controlled MediCare storage room"
                width={1024}
                height={768}
                sizes="(min-width: 1024px) 46vw, 92vw"
                className="h-full w-full object-cover"
              />
            </div>
          </Reveal>

          <RevealGroup as="ul" className="flex flex-col gap-4">
            {qualityChecks.map((check) => (
              <RevealItem as="li" key={check.title}>
                <div className="flex gap-4 rounded-2xl border border-border bg-card p-5">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <check.icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{check.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Need a prescription before you can order?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Consult a verified doctor on ORVEXA and get a signed e-prescription you can forward straight to
                MediCare. For questions about an existing prescription or an order, the help centre and the pharmacy
                desk are one tap away.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/services#telemedicine">
                  <MessageCircle aria-hidden />
                  Consult a doctor
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/help#pharmacy">
                  <Headset aria-hidden />
                  Pharmacy help
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/contact#chat">
                  <MessageCircle aria-hidden />
                  Chat with support
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>

        <Reveal className="mt-6">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Siren aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emergency" />
            MediCare is not an emergency service. For a medical emergency, call{" "}
            <a href={`tel:${siteConfig.emergencyNumber}`} className="font-medium text-foreground underline underline-offset-4">
              {siteConfig.emergencyNumber}
            </a>{" "}
            or open Emergency SOS.
          </p>
        </Reveal>
      </Section>
    </>
  );
}
