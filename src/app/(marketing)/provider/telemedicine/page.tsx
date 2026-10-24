import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, ShieldCheck, TriangleAlert, Video } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePermission } from "@/lib/auth/guards";
import { getDoctorProfileForOwner, listClinicianTeleconsultations } from "@/lib/telemedicine/bookings";
import { formatConsultWindow } from "@/lib/telemedicine/format";
import {
  TELECONSULT_APPOINTMENT_COPY,
  TELECONSULT_STATUS_COPY,
  TELEMEDICINE_POLICY_STATEMENT,
} from "@/lib/telemedicine/labels";

export const metadata: Metadata = {
  title: "Virtual consultations",
  description:
    "Your virtual consultation diary: every appointment on your practice, with its room state, notes and prescriptions.",
  robots: { index: false, follow: false },
};

const TELEMEDICINE_PATH = "/provider/telemedicine";

function rupee(value: number | null): string | null {
  if (value === null) return null;
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function ProviderTelemedicinePage() {
  return (
    <>
      <PageHero
        eyebrow="Telemedicine"
        title="Virtual consultations"
        description="Consultations booked against your practice. Opening one gives you the room, the notes desk, the prescription pad and the chat with your patient."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Provider", href: "/provider" },
          { title: "Virtual consultations", href: TELEMEDICINE_PATH },
        ]}
      />

      <Section spacing="sm" aria-labelledby="telemedicine-queue-heading">
        <h2 id="telemedicine-queue-heading" className="sr-only">
          Your virtual consultations
        </h2>
        <Suspense
          fallback={
            <div aria-hidden className="h-64 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />
          }
        >
          <ConsultationQueue />
        </Suspense>
      </Section>
    </>
  );
}

/** The practice read and the queue read are request-time only. */
async function ConsultationQueue() {
  const user = await requirePermission("provider.teleconsult_manage", { nextPath: TELEMEDICINE_PATH });
  const doctor = await getDoctorProfileForOwner(user.id);

  if (!doctor) {
    return (
      <EmptyState
        icon={Video}
        title="No clinician profile found"
        description="Virtual consultations appear here once a clinician profile is attached to this account. Until then there is no practice for a patient to book against."
        action={
          <Button asChild variant="outline">
            <Link href="/provider/profile">Set up your clinician profile</Link>
          </Button>
        }
      />
    );
  }

  const consultations = await listClinicianTeleconsultations({ doctorUserId: user.id });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={doctor.verificationStatus === "VERIFIED" ? "success" : "warning"}>
            {doctor.verificationStatus === "VERIFIED" ? "Verified clinician" : `Verification: ${doctor.verificationStatus}`}
          </Badge>
          <Badge variant={doctor.teleconsultEnabled ? "success" : "neutral"}>
            {doctor.teleconsultEnabled ? "Telemedicine enabled" : "Telemedicine off"}
          </Badge>
          <Badge variant={doctor.acceptingNewPatients ? "neutral" : "warning"}>
            {doctor.acceptingNewPatients ? "Accepting new patients" : "Not accepting new patients"}
          </Badge>
          {doctor.teleconsultFeeInr !== null ? (
            <Badge variant="outline">{rupee(doctor.teleconsultFeeInr)} per consultation</Badge>
          ) : null}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Reg. {doctor.registrationNumber}
          {doctor.registrationCouncil ? ` · ${doctor.registrationCouncil}` : ""}
        </p>
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          {TELEMEDICINE_POLICY_STATEMENT}
        </p>
      </div>

      {doctor.verificationStatus !== "VERIFIED" || !doctor.teleconsultEnabled ? (
        <p className="flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning-soft p-5 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Patients cannot book a virtual consultation with you until your practice is verified and telemedicine is
            switched on. A note can still be read here, but nothing can be signed from an unverified profile.
          </span>
        </p>
      ) : null}

      {consultations.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No virtual consultations yet"
          description="When a patient books a virtual consultation with your practice it appears here, in time order, with its current state."
        />
      ) : (
        <ul className="space-y-4">
          {consultations.map((consultation) => {
            const appointment = TELECONSULT_APPOINTMENT_COPY[consultation.status];
            const session = consultation.teleconsultSession;
            const sessionCopy = session ? TELECONSULT_STATUS_COPY[session.status] : null;
            const fee = rupee(consultation.feeInr);

            return (
              <li key={consultation.id}>
                <article className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={appointment.tone}>{appointment.label}</Badge>
                        {sessionCopy ? (
                          <Badge variant={sessionCopy.tone}>{sessionCopy.label}</Badge>
                        ) : (
                          <Badge variant="neutral">No room opened</Badge>
                        )}
                        {consultation.followUpOfAppointmentId ? <Badge variant="outline">Follow-up</Badge> : null}
                      </div>
                      <h3 className="pt-1 font-semibold">{consultation.patient?.fullName ?? "Patient"}</h3>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{consultation.reference}</span>
                        {formatConsultWindow(consultation.scheduledStart, consultation.scheduledEnd)
                          ? ` · ${formatConsultWindow(consultation.scheduledStart, consultation.scheduledEnd)}`
                          : ""}
                        {fee ? ` · ${fee}` : ""}
                      </p>
                    </div>

                    <Button asChild variant="outline" size="sm">
                      <Link href={`${TELEMEDICINE_PATH}/${consultation.id}`}>
                        Open consultation
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </div>

                  <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                    <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {sessionCopy ? sessionCopy.detail : appointment.detail}
                  </p>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
