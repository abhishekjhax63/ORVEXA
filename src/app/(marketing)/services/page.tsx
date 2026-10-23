import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PhoneCall, Siren } from "lucide-react";

import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { ServiceDetailCard } from "@/components/services/service-card";
import { ServicesDirectory } from "@/components/services/services-directory";
import { Button } from "@/components/ui/button";
import { careJourney } from "@/data/content";
import { careServices } from "@/data/services";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Healthcare services",
  description:
    "Explore every ORVEXA care module: hospital discovery, telemedicine, diagnostics, MediCare pharmacy, health records, insurance claims, home care and emergency response.",
  alternates: { canonical: "/services" },
};

function pick(slugs: string[]) {
  return careServices.filter((service) => slugs.includes(service.slug));
}

const telemedicineDeepDive = pick(["telemedicine", "second-opinion"]);
const wellnessDeepDive = pick(["preventive-wellness", "home-care"]);

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Services"
        title="Care modules that hand off to each other"
        description="ORVEXA is not a directory bolted onto a form. Each module shares the same patient record, so a consultation can open a lab order, a lab report can open a pharmacy order, and a pharmacy order can open an insurance claim."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Services", href: "/services" },
        ]}
        actions={
          <>
            <Button asChild variant="gradient" size="lg">
              <Link href="/hospitals">
                Find care now
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}>
                <PhoneCall aria-hidden />
                Talk to the care desk
              </a>
            </Button>
          </>
        }
      />

      <Section spacing="default">
        <Reveal>
          <SectionHeading
            eyebrow="Directory"
            title="Filter the full catalogue"
            description="Ten modules covering discovery, consultation, diagnostics, pharmacy, records, insurance, wellness and emergency response."
          />
        </Reveal>
        <Reveal className="mt-8" delay={0.05}>
          <ServicesDirectory />
        </Reveal>
        <DemoNotice className="mt-8">
          Pricing, turnaround and coverage figures in the directory are sampling values for Phase 1 reviews.
        </DemoNotice>
      </Section>

      <Section tone="muted" spacing="default">
        <Reveal>
          <SectionHeading
            eyebrow="Care journey"
            title="What using ORVEXA actually looks like"
            description="Four steps from first symptom to settled claim, with your history carried forward each time."
          />
        </Reveal>

        <RevealGroup as="ol" className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {careJourney.map((step, index) => (
            <RevealItem as="li" key={step.id} className="h-full">
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
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section id="telemedicine" spacing="default" aria-labelledby="telemedicine-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Consultation"
            title={<span id="telemedicine-heading">Telemedicine and expert second opinions</span>}
            description="Talk to a verified specialist from any device, and escalate to a multi-disciplinary panel when a decision is high-stakes."
            actions={
              <Button asChild variant="outline">
                <Link href="/ai-assistant">
                  Not sure which speciality?
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          />
        </Reveal>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {telemedicineDeepDive.map((service, index) => (
            <Reveal key={service.slug} delay={index * 0.06}>
              <ServiceDetailCard service={service} />
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="wellness" tone="muted" spacing="default" aria-labelledby="wellness-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Wellness &amp; home care"
            title={<span id="wellness-heading">Preventive programmes and care delivered at home</span>}
            description="Annual screening tuned to your risk profile, plus background-verified nursing, physiotherapy and elder care when hospital isn't the right place to recover."
          />
        </Reveal>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {wellnessDeepDive.map((service, index) => (
            <Reveal key={service.slug} delay={index * 0.06}>
              <ServiceDetailCard service={service} />
            </Reveal>
          ))}
        </div>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Need an ambulance instead of a module?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Emergency SOS dispatches the nearest advanced life-support unit, shares live location with your
                contacts and pre-alerts the receiving hospital.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="emergency" size="lg">
                <Link href="/emergency">
                  <Siren aria-hidden />
                  Open Emergency SOS
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href={`tel:${siteConfig.emergencyNumber}`}>Dial {siteConfig.emergencyNumber}</a>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
