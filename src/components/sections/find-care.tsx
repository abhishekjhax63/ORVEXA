import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

import { Section, SectionHeading } from "@/components/layout/section";
import { CareSearch } from "@/components/marketing/care-search";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { HospitalCard } from "@/components/provider/provider-cards";
import { Button } from "@/components/ui/button";
import { hospitals, specialties } from "@/data/providers";

const featuredHospitals = hospitals.slice(0, 3);

/** Homepage "find care" block: provider search, specialties and Patna listings. */
function FindCareSection() {
  return (
    <Section id="search" spacing="default">
      <Reveal>
        <SectionHeading
          eyebrow="Find care"
          title="Search hospital and doctor listings in Patna"
          description="Search the supplied directory by specialty and location. Listings are unverified; current availability, fees and booking must be confirmed directly with providers."
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
              className="group flex h-full flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 transition-[border-color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-soft)] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-panel)]"
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
            <h3 className="text-xl font-semibold sm:text-2xl">Hospital listings</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              A selection from the supplied Patna directory. No ratings or ranking were provided.
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
          {featuredHospitals.map((hospital, index) => (
            <Reveal key={hospital.id} delay={index * 0.06}>
              <HospitalCard
                hospital={hospital}
                action={
                  <Button asChild variant="soft" size="sm">
                    <Link href={`/hospitals?q=${encodeURIComponent(hospital.name)}`}>View listing</Link>
                  </Button>
                }
              />
            </Reveal>
          ))}
        </div>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          Source: a user-supplied Patna provider list. Hospital and doctor details are unverified; this is not a live
          availability feed and ORVEXA does not accept appointments from these listings.
        </p>
      </Reveal>
    </Section>
  );
}

export { FindCareSection };
