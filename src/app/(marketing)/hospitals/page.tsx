import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, ExternalLink, PhoneCall, Siren } from "lucide-react";

<<<<<<< HEAD
import { RequestDialog } from "@/components/forms/request-dialog";
import { AiRecommendationFlow } from "@/components/hospitals/ai-recommendation-flow";
import { buildDoctorFields } from "@/components/hospitals/booking-fields";
=======
>>>>>>> 00c6be6 (Updated project features)
import { ProviderDirectory } from "@/components/hospitals/provider-directory";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { DoctorCard } from "@/components/provider/provider-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { doctors, hospitals, providerDirectorySource, specialties } from "@/data/providers";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Hospitals & doctors",
  description:
    "Browse a static Patna hospital and doctor directory supplied to ORVEXA. Provider details are unverified; confirm current credentials, affiliation and availability directly with each provider.",
  alternates: { canonical: "/hospitals" },
};

const featuredDoctors = doctors.slice(0, 3);

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
        title="Hospitals and doctors listed for Patna"
        description="Browse hospital contacts and doctor listings imported from the supplied Patna spreadsheets. Details and schedules remain unverified, and no live availability or appointment booking is connected."
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
              <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Directory snapshot</p>
              <Badge variant="warning">Unverified</Badge>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground">Hospital listings</dt>
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
                <dt className="text-xs text-muted-foreground">Cities represented</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {new Set(hospitals.map((hospital) => hospital.city)).size}
                </dd>
              </div>
            </dl>
            <ul className="mt-6 space-y-2.5 border-t border-border pt-5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Source list supplied for this directory; verification is pending
              </li>
              <li className="flex items-start gap-2">
                <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Public contacts and some OPD schedules are listed in the spreadsheets; confirm them before visiting
              </li>
              <li className="flex items-start gap-2">
                <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Fees, current availability and appointment booking are not connected
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
            title={<span id="directory-heading">Search the supplied directory</span>}
            description="Filter the hospital and doctor records by name, location and listed specialty. There is no live provider feed or appointment booking connected to these listings."
          />
        </Reveal>
        <div className="mt-8">
          <Suspense fallback={<SkeletonList count={6} label="Loading providers" />}>
            <DirectoryResults searchParams={props.searchParams} />
          </Suspense>
        </div>
        <div className="mt-8 rounded-2xl border border-warning/40 bg-warning-soft p-5 text-sm">
          <p className="font-semibold text-warning">
            {providerDirectorySource.status}: {providerDirectorySource.label}
          </p>
          <p className="mt-2 leading-relaxed text-muted-foreground">{providerDirectorySource.note}</p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {providerDirectorySource.sources.map((source) => (
              <li key={source} className="text-xs text-muted-foreground">
                Source file: {source}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section id="doctors" tone="muted" spacing="default" aria-labelledby="doctors-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Specialists"
            title={<span id="doctors-heading">Doctors in the supplied Patna list</span>}
            description="These are directory records, not confirmed appointments. Use each linked hospital directory to check current affiliation and contact the provider directly."
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
                This static list does not provide real-time availability or booking. Confirm appointments directly with
                providers. For a medical emergency, call {siteConfig.emergencyNumber}.
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
