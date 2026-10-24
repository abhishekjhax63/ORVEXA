import { Suspense } from "react";
import type { Metadata } from "next";
import { Search, ShieldCheck, Video } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { BookingPanel } from "@/components/telemedicine/booking-panel";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { requirePermission } from "@/lib/auth/guards";
import { searchTeleconsultDoctors } from "@/lib/telemedicine/availability";

export const metadata: Metadata = {
  title: "Virtual consultations",
  description:
    "Book a secure video consultation with a verified clinician on ORVEXA. Choose a published time, consent to a virtual consultation and keep the clinical record in your account.",
  robots: { index: false, follow: false },
};

const TELEMEDICINE_PATH = "/telemedicine";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function TelemedicinePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHero
        eyebrow="Telemedicine"
        title="See a verified clinician by video, from anywhere"
        description="Every clinician listed here has a verified registration and has switched virtual consultations on. You choose a published time and consent to the consultation before it is requested; the clinician confirms it, and the consultation room opens shortly before it starts."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Telemedicine", href: TELEMEDICINE_PATH },
        ]}
        aside={
          <div className="rounded-[1.75rem] border border-border bg-card/85 p-6 shadow-[var(--shadow-panel)] backdrop-blur-sm">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">How it works</p>
            <ol className="mt-5 space-y-3 text-sm">
              <li className="flex gap-3">
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-semibold text-primary">1</span>
                Pick a clinician and a published time.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-semibold text-primary">2</span>
                The clinician confirms the appointment.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-semibold text-primary">3</span>
                A short-lived join link is issued to you and to the clinician.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-semibold text-primary">4</span>
                The clinician finalises a note and issues any prescription.
              </li>
            </ol>
            <ul className="mt-6 space-y-2.5 border-t border-border pt-5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                Registration verified before a clinician can consult here
              </li>
              <li className="flex items-start gap-2">
                <Video aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Join links are minted separately for the patient and the clinician
              </li>
            </ul>
          </div>
        }
      />

      <Section spacing="sm" aria-labelledby="booking-heading">
        <h2 id="booking-heading" className="sr-only">
          Find a clinician and request a consultation
        </h2>

        <form action={TELEMEDICINE_PATH} method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md">
            <Label htmlFor="telemedicine-search">Search by clinician, speciality or focus</Label>
            <Input
              id="telemedicine-search"
              name="q"
              type="search"
              placeholder="e.g. dermatology, Dr Sharma, diabetes"
              autoComplete="off"
            />
          </div>
          <Button type="submit" variant="outline">
            <Search aria-hidden />
            Search
          </Button>
        </form>

        <div className="mt-8">
          <Suspense
            fallback={
              <div
                aria-hidden
                className="h-80 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none"
              />
            }
          >
            <DoctorBooking searchParams={searchParams} />
          </Suspense>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
          A virtual consultation is held on a third-party video service that ORVEXA does not control and cannot record
          on your behalf. It is not a substitute for emergency care — if you have severe or worsening symptoms, call
          emergency services instead of waiting for an appointment.
        </p>
      </Section>
    </>
  );
}

/** The session read and the clinician search sit inside the boundary. */
async function DoctorBooking({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("telemedicine.read_own", { nextPath: TELEMEDICINE_PATH });
  const params = await searchParams;
  const query = readParam(params, "q").trim();
  const doctors = await searchTeleconsultDoctors({ query: query || undefined });

  return <BookingPanel doctors={doctors} />;
}
