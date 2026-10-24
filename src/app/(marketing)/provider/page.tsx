import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock, TriangleAlert, Video } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePermission } from "@/lib/auth/guards";
import { getDoctorProfileForOwner, listClinicianTeleconsultations } from "@/lib/telemedicine/bookings";
import { formatConsultWindow } from "@/lib/telemedicine/format";
import { TELECONSULT_APPOINTMENT_COPY, TELEMEDICINE_POLICY_STATEMENT } from "@/lib/telemedicine/labels";

export const metadata: Metadata = {
  title: "Provider console",
  description: "Your ORVEXA practice: verification state and the virtual consultation desk.",
  robots: { index: false, follow: false },
};

const PROVIDER_PATH = "/provider";

export default function ProviderOverviewPage() {
  return (
    <>
      <PageHero
        eyebrow="Provider"
        title="Your practice"
        description="What ORVEXA holds about your practice, and the desks you can work from."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Provider", href: PROVIDER_PATH },
        ]}
      />

      <Section spacing="sm">
        <Suspense
          fallback={<div aria-hidden className="h-64 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />}
        >
          <PracticeOverview />
        </Suspense>
      </Section>
    </>
  );
}

async function PracticeOverview() {
  const user = await requirePermission("provider.portal_access", { nextPath: PROVIDER_PATH });
  const doctor = await getDoctorProfileForOwner(user.id);

  if (!doctor) {
    return (
      <EmptyState
        icon={BadgeCheck}
        title="No clinician profile on this account"
        description="A clinician profile is what lets patients find you and book with you. Until one is attached to this account there is no practice to work from."
        action={
          <Button asChild variant="outline">
            <Link href="/provider/profile">Provider profile</Link>
          </Button>
        }
      />
    );
  }

  const consultations = await listClinicianTeleconsultations({ doctorUserId: user.id, limit: 5 });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={doctor.verificationStatus === "VERIFIED" ? "success" : "warning"}>
              {doctor.verificationStatus === "VERIFIED"
                ? "Verified clinician"
                : `Verification: ${doctor.verificationStatus}`}
            </Badge>
            <Badge variant={doctor.teleconsultEnabled ? "success" : "neutral"}>
              {doctor.teleconsultEnabled ? "Telemedicine enabled" : "Telemedicine off"}
            </Badge>
            <Badge variant={doctor.acceptingNewPatients ? "neutral" : "warning"}>
              {doctor.acceptingNewPatients ? "Accepting new patients" : "Not accepting new patients"}
            </Badge>
          </div>
          <CardTitle className="pt-2 text-2xl">{user.fullName}</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            {doctor.headline ??
              (doctor.specialties.length > 0 ? doctor.specialties.join(", ") : "General practice")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Reg. {doctor.registrationNumber}
            {doctor.registrationCouncil ? ` · ${doctor.registrationCouncil}` : ""}
          </p>
          <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {TELEMEDICINE_POLICY_STATEMENT}
          </p>
        </CardContent>
      </Card>

      {doctor.verificationStatus !== "VERIFIED" || !doctor.teleconsultEnabled ? (
        <p className="flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning-soft p-5 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Virtual consultations cannot be booked with your practice until it is verified and telemedicine is switched
            on. A clinical note or prescription can only be signed from a verified profile.
          </span>
        </p>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Video aria-hidden className="size-4 text-primary" />
              Virtual consultations
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Your telemedicine desk: the waiting room, the clinical note, the prescription pad and the patient chat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/provider/telemedicine">
                Open the console
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock aria-hidden className="size-4 text-primary" />
              Next consultations
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              The next few virtual appointments on your practice, in time order.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {consultations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No virtual consultation is booked on your practice.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {consultations.map((consultation) => {
                  const copy = TELECONSULT_APPOINTMENT_COPY[consultation.status];
                  return (
                    <li key={consultation.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="font-medium">{consultation.patient.fullName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatConsultWindow(consultation.scheduledStart, consultation.scheduledEnd) ?? "Time not set"}
                        </span>
                      </span>
                      <Badge variant={copy.tone}>{copy.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
        This build publishes the virtual consultation desk only. The appointment, schedule and slot desks are not
        available here yet.
      </p>
    </div>
  );
}
