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
    "Review ORVEXA's current feature availability. Provider listings and sample catalogues are available; most transactional healthcare services are not connected.",
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
        title="ORVEXA feature availability"
        description="This build includes a static Patna provider directory, sample pharmacy and diagnostics catalogues, and a configuration-dependent AI workspace. It does not connect appointments, clinical records, lab orders, prescriptions, insurance claims or emergency dispatch."
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
                Call the provided contact number
              </a>
            </Button>
          </>
        }
      />

      <Section spacing="default">
        <Reveal>
          <SectionHeading
            eyebrow="Feature catalogue"
            title="Explore current feature status"
            description="Browse the project modules and see which features have working integrations and which are informational or unavailable."
          />
        </Reveal>
        <Reveal className="mt-8" delay={0.05}>
          <ServicesDirectory />
        </Reveal>
        <DemoNotice className="mt-8">
          Availability, prices, turnaround times and coverage in sample catalogues are not verified service offers.
        </DemoNotice>
      </Section>

      <Section tone="muted" spacing="default">
        <Reveal>
          <SectionHeading
            eyebrow="Workflow status"
            title="What this build can and cannot do"
            description="The steps below distinguish the available directory from services that require integrations not currently connected."
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
            eyebrow="Not connected"
            title={<span id="telemedicine-heading">Telemedicine and second opinions</span>}
            description="No video consultation service, clinician panel or digital prescription workflow is connected to this build."
            actions={
              <Button asChild variant="outline">
                <Link href="/assistant">
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
            eyebrow="Not connected"
            title={<span id="wellness-heading">Wellness and home care</span>}
            description="No personalized wellness program, caregiver marketplace or home-care booking workflow is connected."
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
              <h2 className="text-2xl font-semibold sm:text-3xl">Need emergency help?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                ORVEXA cannot dispatch an ambulance or notify hospitals. Call {siteConfig.emergencyNumber} directly.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="emergency" size="lg">
                <Link href="/emergency">
                  <Siren aria-hidden />
                  Emergency information
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
