import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DemoNotice } from "@/components/layout/demo-notice";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { ServiceCard } from "@/components/services/service-card";
import { Button } from "@/components/ui/button";
import { careServices } from "@/data/services";

/** Homepage service grid: one card per ORVEXA care module. */
function ServicesOverviewSection() {
  return (
    <Section id="services" tone="muted" spacing="default">
      <Reveal>
        <SectionHeading
          eyebrow="Services"
          title="Ten care modules, one account"
          description="Discovery, consultation, diagnostics, pharmacy, records, insurance and emergency response — designed to hand off to each other so you never repeat your history."
          actions={
            <Button asChild variant="outline">
              <Link href="/services">
                Explore the directory
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        />
      </Reveal>

      <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {careServices.map((service) => (
          <RevealItem as="li" key={service.slug} className="h-full">
            <ServiceCard service={service} />
          </RevealItem>
        ))}
      </RevealGroup>

      <DemoNotice className="mt-8">
        Service pricing and turnaround figures are representative examples, not a published tariff.
      </DemoNotice>
    </Section>
  );
}

export { ServicesOverviewSection };
