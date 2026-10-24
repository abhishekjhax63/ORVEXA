import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Video } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePermission } from "@/lib/auth/guards";
import { listPatientTeleconsultations } from "@/lib/telemedicine/bookings";
import { formatConsultWindow } from "@/lib/telemedicine/format";
import { TELECONSULT_APPOINTMENT_COPY, TELECONSULT_STATUS_COPY } from "@/lib/telemedicine/labels";

export const metadata: Metadata = {
  title: "My consultations",
  description: "Every virtual consultation requested from your ORVEXA account, with its room state, chat, notes and prescriptions.",
  robots: { index: false, follow: false },
};

const CONSULTATIONS_PATH = "/dashboard/consultations";

function rupee(value: number | null): string | null {
  if (value === null) return null;
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function PatientConsultationsPage() {
  return (
    <>
      <PageHero
        eyebrow="Telemedicine"
        title="My consultations"
        description="Virtual consultations you have requested. Each one shows its own state — booked, confirmed, room open — and where the clinician's note and any prescription appear once the consultation is done."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "My consultations", href: CONSULTATIONS_PATH },
        ]}
        actions={
          <Button asChild variant="gradient">
            <Link href="/telemedicine">
              <Video aria-hidden />
              Book a consultation
            </Link>
          </Button>
        }
      />

      <Section spacing="sm" aria-labelledby="consultations-heading">
        <h2 id="consultations-heading" className="sr-only">
          Consultation history
        </h2>
        <Suspense
          fallback={<div aria-hidden className="h-64 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />}
        >
          <ConsultationList />
        </Suspense>
      </Section>
    </>
  );
}

/** The session read sits inside the boundary; it is request-time only. */
async function ConsultationList() {
  const user = await requirePermission("telemedicine.read_own", { nextPath: CONSULTATIONS_PATH });
  const consultations = await listPatientTeleconsultations(user.id);

  if (consultations.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="No virtual consultations yet"
        description="When you request a video consultation it appears here with its status, the room state reported by the video provider, and the clinician's note once it is finalised."
        action={
          <Button asChild variant="gradient">
            <Link href="/telemedicine">Find a clinician</Link>
          </Button>
        }
      />
    );
  }

  return (
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
                  <h3 className="pt-1 font-semibold">{consultation.doctorProfile.user.fullName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {consultation.doctorProfile.specialties.length > 0
                      ? consultation.doctorProfile.specialties.join(", ")
                      : "General practice"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{consultation.reference}</span>
                    {formatConsultWindow(consultation.scheduledStart, consultation.scheduledEnd)
                      ? ` · ${formatConsultWindow(consultation.scheduledStart, consultation.scheduledEnd)}`
                      : ""}
                    {fee ? ` · ${fee}` : ""}
                  </p>
                </div>

                <Button asChild variant="outline" size="sm">
                  <Link href={`${CONSULTATIONS_PATH}/${consultation.reference}`}>
                    Open
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>

              <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                {sessionCopy ? sessionCopy.detail : appointment.detail}
              </p>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
