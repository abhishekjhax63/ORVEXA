import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BadgeIndianRupee, PhoneCall, ShieldCheck, Siren, Star } from "lucide-react";

import { RequestDialog } from "@/components/forms/request-dialog";
import { AiRecommendationFlow } from "@/components/hospitals/ai-recommendation-flow";
import { buildDoctorFields } from "@/components/hospitals/booking-fields";
import { ProviderDirectory } from "@/components/hospitals/provider-directory";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { DoctorCard } from "@/components/provider/provider-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { doctors, hospitals, specialties } from "@/data/providers";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Hospitals & doctors",
  description:
    "Search verified hospitals, clinics and specialists across India. Filter by city, speciality, cashless insurance and 24×7 emergency cover, then request an appointment in one step.",
  alternates: { canonical: "/hospitals" },
};

/** Top-rated specialists surfaced above the fold of the directory. */
const featuredDoctors = [...doctors]
  .sort((a, b) => b.rating * b.reviewCount - a.rating * a.reviewCount)
  .slice(0, 3);

type SearchParamsPromise = PageProps<"/hospitals">["searchParams"];

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Reads the URL search params produced by the shared provider search and feeds
 * them into the directory as its initial filter state.
 */
async function DirectoryResults({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const view = readParam(params, "view") === "doctors" ? "doctors" : "hospitals";

  return (
    <ProviderDirectory
      initialQuery={readParam(params, "q")}
      initialCity={readParam(params, "city")}
      initialSpecialty={readParam(params, "specialty")}
      initialView={view}
    />
  );
}

export default function HospitalsPage(props: PageProps<"/hospitals">) {
  return (
    <>
      <PageHero
        eyebrow="Find care"
        title="Verified hospitals and specialists, filtered the way you actually search"
        description="Every listing is credential-checked, and each one tells you what matters before you travel: accreditation, cashless insurance, emergency cover and honest pricing bands."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Hospitals & doctors", href: "/hospitals" },
        ]}
        actions={
          <>
            <Button asChild variant="gradient" size="lg">
              <a href="#directory">
                Start searching
                <ArrowRight aria-hidden />
              </a>
            </Button>
            <Button asChild variant="emergency" size="lg">
              <Link href="/emergency">
                <Siren aria-hidden />
                Emergency SOS
              </Link>
            </Button>
          </>
        }
        aside={
          <div className="rounded-[1.75rem] border border-border bg-card/85 p-6 shadow-[var(--shadow-panel)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Network snapshot</p>
              <Badge variant="demo">Demo</Badge>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground">Hospitals & clinics</dt>
                <dd className="mt-1 text-2xl font-semibold">{hospitals.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Specialists listed</dt>
                <dd className="mt-1 text-2xl font-semibold">{doctors.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Specialities</dt>
                <dd className="mt-1 text-2xl font-semibold">{specialties.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cities live</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {new Set(hospitals.map((hospital) => hospital.city)).size}
                </dd>
              </div>
            </dl>
            <ul className="mt-6 space-y-2.5 border-t border-border pt-5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                Registration and accreditation checks before a listing goes live
              </li>
              <li className="flex items-start gap-2">
                <BadgeIndianRupee aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Price bands and insurance acceptance shown up front
              </li>
              <li className="flex items-start gap-2">
                <Star aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                Ratings come from verified visits only
              </li>
            </ul>
          </div>
        }
      />

      <Section id="directory" spacing="default" aria-labelledby="directory-heading">
        <AiRecommendationFlow />

        <Reveal>
          <SectionHeading
            eyebrow="Directory"
            title={<span id="directory-heading">Search the network</span>}
            description="Switch between hospitals and individual doctors. Filters, sorting and the appointment request all work today — the provider APIs arrive in Phase 2."
          />
        </Reveal>
        <div className="mt-8">
          <Suspense fallback={<SkeletonList count={6} label="Loading providers" />}>
            <DirectoryResults searchParams={props.searchParams} />
          </Suspense>
        </div>
        <DemoNotice className="mt-8">
          Hospital names, locations, ratings, bed counts and fees are illustrative samples. No appointment request leaves
          your browser in Phase 1.
        </DemoNotice>
      </Section>

      <Section id="doctors" tone="muted" spacing="default" aria-labelledby="doctors-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Specialists"
            title={<span id="doctors-heading">Book a consultation directly</span>}
            description="The most-reviewed specialists on ORVEXA right now. Each one supports at least one remote consultation mode, so you can start without travelling."
            actions={
              <Button asChild variant="outline">
                <Link href="/hospitals?view=doctors">
                  See all doctors
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          />
        </Reveal>

        <RevealGroup className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {featuredDoctors.map((doctor) => (
            <RevealItem key={doctor.id} className="h-full">
              <DoctorCard
                doctor={doctor}
                action={
                  <RequestDialog
                    triggerLabel="Request slot"
                    triggerVariant="soft"
                    triggerSize="sm"
                    title={`Consult ${doctor.name}`}
                    description={`${doctor.specialty} · ${doctor.hospitalName}, ${doctor.city}. Next available slot: ${doctor.nextSlot}.`}
                    fields={buildDoctorFields(doctor)}
                    submitLabel="Request slot"
                    successTitle="Consultation request ready"
                    successBody={`${doctor.name} would receive your request with the symptoms you described and the preferred date you chose.`}
                    footnote="Phase 1 has no booking backend yet. This form validates your details and shows the confirmation state, but no request leaves your browser."
                  />
                }
              />
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Can&apos;t find the right provider?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Our care desk searches outside the listed network, checks insurance eligibility and arranges the
                appointment for you. For a medical emergency, skip the queue and call {siteConfig.emergencyNumber}.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/contact">Talk to the care desk</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}>
                  <PhoneCall aria-hidden />
                  {siteConfig.supportPhone}
                </a>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
