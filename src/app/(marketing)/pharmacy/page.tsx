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
  title: "MediCare pharmacy prototype",
  description:
    "Explore a sample medicine catalogue. Products, prices and stock are illustrative; no pharmacy, pharmacist, order, payment or delivery service is connected.",
  alternates: { canonical: "/pharmacy" },
};

const qualityImage = healthImage(
  "Indian pharmacist in a clean licensed pharmacy checking medicine strips against a printed prescription, temperature-controlled storage cabinet behind the counter, soft daylight, professional healthcare photography",
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
    title: "Prescription submission (not available)",
    description:
      "The prototype has no prescription upload or pharmacy connection. Do not submit prescriptions through the demo form.",
    actionLabel: "Prescription help",
    actionHref: "/help#pharmacy",
  },
  {
    icon: ClipboardCheck,
    title: "Prescription review (not live)",
    description:
      "A future pharmacy integration would need qualified staff to review prescription details. This prototype does not accept or send prescriptions.",
    actionLabel: "Browse provider directory",
    actionHref: "/hospitals?view=doctors",
  },
  {
    icon: Snowflake,
    title: "Safe handling (not provided)",
    description:
      "This prototype has no pharmacy, inventory, dispensing or cold-chain provider. Do not place orders or rely on its sample delivery information.",
    actionLabel: "See storage standards",
    actionHref: "#quality",
  },
  {
    icon: Route,
    title: "Delivery tracking (not connected)",
    description:
      "No order is created and no delivery tracking is available in this prototype.",
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
    title: "Licensed pharmacy partner",
    detail: "A live service would require a licensed pharmacy partner; none is connected to this prototype.",
  },
  {
    icon: Barcode,
    title: "Batch and expiry verification",
    detail: "The sample catalogue has no live inventory, batch data or expiry checks.",
  },
  {
    icon: ThermometerSnowflake,
    title: "Cold-chain handling",
    detail: "No cold-chain storage, shipment or temperature logging is provided by this prototype.",
  },
  {
    icon: PackageCheck,
    title: "Packaging and returns",
    detail: "No order or shipment is created; there is no active return or replacement service.",
  },
  {
    icon: RotateCcw,
    title: "Order support",
    detail: "No pharmacy order is available to support or return through ORVEXA.",
  },
];

export default function PharmacyPage() {
  return (
    <>
      <PageHero
        eyebrow="MediCare prototype"
        title="Explore a sample medicine catalogue"
        description="This is a browser-only catalogue preview. Product names, prices, stock levels, discounts and delivery estimates are illustrative; no pharmacy or delivery service is connected."
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
              <p className="eyebrow text-primary">Prototype status</p>
              <Badge variant="demo">Demo</Badge>
            </div>
            <ul className="mt-5 flex flex-col gap-4">
              <li className="flex gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Clock className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Sample catalogue only</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    No live inventory or delivery window.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-mint-soft text-mint-deep dark:bg-mint-mid/15 dark:text-mint-mid">
                  <ShieldCheck className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">No order or payment</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    The cart stays in this browser and checkout is disabled.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-mint-soft text-mint-deep dark:bg-mint-mid/15 dark:text-mint-mid">
                  <Snowflake className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">No fulfillment partner</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    No pharmacist, pharmacy or cold-chain provider is connected.
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

      <DemoNotice className="mx-auto my-8 max-w-7xl px-6">
        Do not use this sample catalogue to make treatment or purchasing decisions. No medicine is sold or delivered
        through this page.
      </DemoNotice>

      <Section id="highlights" tone="muted" spacing="default" aria-labelledby="highlights-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Prototype boundaries"
            title={<span id="highlights-heading">What this preview includes</span>}
            description="These sample entries demonstrate catalogue browsing only. No pharmacist, pharmacy, inventory or delivery service is connected."
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pharmacyHighlights.map((highlight) => (
            <RevealItem as="li" key={highlight.title} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-mint-soft text-mint-deep dark:bg-mint-mid/15 dark:text-mint-mid">
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
            title={<span id="catalogue-heading">Search sample catalogue entries</span>}
            description={`Filter ${medicines.length} illustrative products across ${medicineCategories.length} categories and build a local demo cart. No medicine is sold or ordered.`}
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
            title={<span id="how-it-works-heading">What a future pharmacy service would require</span>}
            description="The workflow below is illustrative only. Prescription review, dispensing and delivery are not available from this prototype."
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
                  <Badge variant="demo" className="mt-auto w-fit">
                    Not connected
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
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(38rem_24rem_at_12%_0%,rgba(184,243,107,0.16),transparent_62%),radial-gradient(34rem_22rem_at_88%_100%,rgba(46,125,79,0.28),transparent_60%)]"
        />
        <div className="relative grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 eyebrow text-lime-200">
                Prescription policy
              </span>
              <h2
                id="prescription-heading"
                className="mt-4 text-3xl font-semibold text-white sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]"
              >
                What we can and cannot dispense without a prescription
              </h2>
              <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
                This section is general safety information, not legal or medical advice. This prototype does not sell,
                dispense or verify any medicine or prescription.
              </p>
            </Reveal>

            <Reveal className="mt-8">
              <ul className="flex flex-col gap-4">
                <li className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-lime-200">
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
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-lime-200">
                    <ListChecks className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">What a pharmacy should verify</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                      A licensed pharmacist should review a prescription before dispensing. ORVEXA has no pharmacy
                      partner connected here and does not receive prescription documents from this page.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-lime-200">
                    <TriangleAlert className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Restricted medicines</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                      No medicines are sold or dispensed through this demo. Consult a licensed pharmacist or official
                      regulatory information for current requirements.
                    </p>
                  </div>
                </li>
              </ul>
            </Reveal>
          </div>

          <Reveal delay={0.08}>
            <div className="flex flex-col gap-5 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-lime-200">
                  <Headset className="size-5" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-white">Pharmacist support is not connected</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                    The form below is a local interaction preview. It does not reach a pharmacist or provide
                    prescription, stock or dosage advice.
                  </p>
                </div>
              </div>

              <RequestDialog
                triggerLabel="Preview the support form"
                triggerSize="lg"
                triggerClassName="w-full"
                title="Pharmacy support form preview"
                description="This local preview does not send questions to a pharmacist or provide medical advice."
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
                footnote="Do not enter health information here. This prototype has no pharmacy messaging backend."
              />

              <p className="flex items-start gap-2 border-t border-white/10 pt-5 text-xs leading-relaxed text-white/60">
                <PhoneCall aria-hidden className="mt-0.5 size-3.5 shrink-0 text-lime-200" />
                For general ORVEXA support, call{" "}
                <a
                  href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}
                  className="font-medium text-white underline underline-offset-4"
                >
                  {siteConfig.supportPhone}
                </a>
                . This is not a pharmacy or emergency line.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section id="quality" spacing="default" aria-labelledby="quality-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Requirements for a live service"
            title={<span id="quality-heading">Checks a pharmacy partner would need</span>}
            description="These are examples of operational controls to confirm before any pharmacy integration goes live; none is provided by this prototype."
          />
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          <Reveal>
            <div className="overflow-hidden rounded-[1.75rem] border border-border bg-muted shadow-[var(--shadow-lift)]">
              <Image
                src={qualityImage}
                alt="Illustrative pharmacy image; this is not an ORVEXA facility"
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
              <h2 className="text-2xl font-semibold sm:text-3xl">Looking for a real provider?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                The pharmacy prototype does not accept orders or connect to clinicians. Browse the supplied Patna
                provider directory and verify all details directly before contacting a provider.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/services#telemedicine">
                  <MessageCircle aria-hidden />
                  Browse provider listings
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/help#pharmacy">
                  <Headset aria-hidden />
                  Prototype FAQ
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/contact">
                  <MessageCircle aria-hidden />
                  Contact ORVEXA
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
