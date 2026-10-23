import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

import { DemoNotice } from "@/components/layout/demo-notice";
import { Section, SectionHeading } from "@/components/layout/section";
import { CareSearch } from "@/components/marketing/care-search";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { HospitalCard } from "@/components/provider/provider-cards";
import { Button } from "@/components/ui/button";
import { hospitals, specialties } from "@/data/providers";

const topHospitals = hospitals
  .slice()
  .sort((a, b) => b.rating - a.rating)
  .slice(0, 3);

/** Homepage "find care" block: provider search, speciality grid, top-rated hospitals. */
function FindCareSection() {
  return (
    <Section id="search" spacing="default">
      <Reveal>
        <SectionHeading
          eyebrow="Find care"
          title="Search verified hospitals, clinics and specialists"
          description="Filter by speciality, city, accreditation and insurance — then compare consultation fees and waiting times side by side before you book."
          actions={
            <Button asChild variant="outline">
              <Link href="/hospitals">
                <Search aria-hidden />
                Open full directory
              </Link>
            </Button>
          }
        />
      </Reveal>

      <Reveal className="mt-8" delay={0.05}>
        <CareSearch variant="inline" />
      </Reveal>

      <RevealGroup as="ul" className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {specialties.map((specialty) => (
          <RevealItem as="li" key={specialty.id}>
            <Link
              href={`/hospitals?specialty=${encodeURIComponent(specialty.name)}`}
              className="group flex h-full flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-panel)]"
            >
              <span
                aria-hidden
                className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
              >
                <specialty.icon className="size-5" />
              </span>
              <span className="text-sm font-semibold">{specialty.name}</span>
              <span className="text-xs text-muted-foreground">
                {specialty.doctorCount.toLocaleString("en-IN")} doctors
              </span>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                View
                <ArrowRight aria-hidden className="size-3" />
              </span>
            </Link>
          </RevealItem>
        ))}
      </RevealGroup>

      <Reveal className="mt-14" delay={0.05}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold sm:text-2xl">Top-rated near you</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Ranked by patient ratings, accreditation level and emergency readiness.
            </p>
          </div>
          <Button asChild variant="link" className="px-0">
            <Link href="/hospitals">
              See all hospitals &amp; doctors
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {topHospitals.map((hospital, index) => (
            <Reveal key={hospital.id} delay={index * 0.06}>
              <HospitalCard
                hospital={hospital}
                action={
                  <Button asChild variant="soft" size="sm">
                    <Link href={`/hospitals?q=${encodeURIComponent(hospital.name)}`}>View &amp; book</Link>
                  </Button>
                }
              />
            </Reveal>
          ))}
        </div>

        <DemoNotice className="mt-6">
          Hospitals, doctors, ratings and fees shown across ORVEXA are illustrative samples for Phase 1. Live
          provider data replaces them once the directory API is connected.
        </DemoNotice>
      </Reveal>
    </Section>
  );
}

export { FindCareSection };
