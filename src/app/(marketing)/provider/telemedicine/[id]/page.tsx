import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, MessageSquare, Pill, ShieldCheck, Video } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { ConsultationChat } from "@/components/telemedicine/consultation-chat";
import { ConsultationNoteEditor } from "@/components/telemedicine/consultation-note-editor";
import { ConsultationRoom } from "@/components/telemedicine/consultation-room";
import { PrescriptionIssuer } from "@/components/telemedicine/prescription-issuer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePermission } from "@/lib/auth/guards";
import { getClinicianConsultation } from "@/lib/telemedicine/bookings";
import { formatConsultInstant, formatConsultWindow } from "@/lib/telemedicine/format";
import {
  APPOINTMENT_EVENT_COPY,
  TELECONSULT_APPOINTMENT_COPY,
  TELECONSULT_STATUS_COPY,
  TELEMEDICINE_DISCIPLINE_NOTICE,
} from "@/lib/telemedicine/labels";
import { getConsultationChat } from "@/lib/telemedicine/messages";
import { listConsultationNotesForClinician } from "@/lib/telemedicine/notes";
import { listConsultationPrescriptionsForClinician } from "@/lib/telemedicine/prescriptions";
import { getSessionState } from "@/lib/telemedicine/sessions";

/**
 * One virtual consultation, as the treating clinician sees it.
 *
 * This is the only surface where a clinical note is signed and a prescription
 * is issued. Both are the server's acts: the permission flags decide whether
 * the desk is offered at all, and a refusal from the server is displayed as it
 * came back rather than being interpreted here.
 *
 * The workspace is scoped by the clinician's own doctor profile in the query,
 * so opening another clinician's consultation by guessing an id returns the
 * same 404 as an id that does not exist.
 */

export const metadata: Metadata = {
  title: "Consultation workspace",
  description:
    "The clinical workspace for one virtual consultation: the room, the notes desk, the prescription pad and the chat.",
  robots: { index: false, follow: false },
};

const TELEMEDICINE_PATH = "/provider/telemedicine";

type PageProps = { params: Promise<{ id: string }> };

function rupee(value: number | null): string | null {
  if (value === null) return null;
  return `₹${value.toLocaleString("en-IN")}`;
}

export default async function ClinicianConsultationPage({ params }: PageProps) {
  const { id } = await params;
  const appointmentId = decodeURIComponent(id);

  return (
    <>
      <PageHero
        eyebrow="Telemedicine"
        title="Consultation workspace"
        description="The consultation room, the clinical record and the prescription pad for one virtual appointment, with the file the patient sees beside it."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Provider", href: "/provider" },
          { title: "Virtual consultations", href: TELEMEDICINE_PATH },
          { title: "Workspace", href: `${TELEMEDICINE_PATH}/${appointmentId}` },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href={TELEMEDICINE_PATH}>
              <ArrowLeft aria-hidden />
              All consultations
            </Link>
          </Button>
        }
      />

      <Section spacing="sm">
        <Suspense
          fallback={<div aria-hidden className="h-96 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />}
        >
          <ConsultationWorkspace appointmentId={appointmentId} />
        </Suspense>
      </Section>
    </>
  );
}

async function ConsultationWorkspace({ appointmentId }: { appointmentId: string }) {
  const nextPath = `${TELEMEDICINE_PATH}/${appointmentId}`;
  const user = await requirePermission("provider.teleconsult_manage", { nextPath });

  const consultation = await getClinicianConsultation({ doctorUserId: user.id, appointmentId });
  // Another clinician's consultation and a non-existent id are the same 404.
  if (!consultation) notFound();

  if (consultation.mode !== "TELEMEDICINE") {
    return (
      <EmptyState
        icon={Video}
        title="Not a virtual consultation"
        description="This appointment is not a telemedicine appointment, so there is no room to open and no note to sign from here."
        action={
          <Button asChild variant="outline">
            <Link href="/provider/appointments">Go to appointments</Link>
          </Button>
        }
      />
    );
  }

  const [sessionState, chat, notes, prescriptions] = await Promise.all([
    getSessionState({
      appointmentId: consultation.id,
      scheduledStart: consultation.scheduledStart,
      scheduledEnd: consultation.scheduledEnd,
      appointmentStatus: consultation.status,
    }),
    getConsultationChat({ appointmentId: consultation.id, userId: user.id }),
    listConsultationNotesForClinician(consultation.id),
    listConsultationPrescriptionsForClinician(consultation.id),
  ]);

  const appointmentCopy = TELECONSULT_APPOINTMENT_COPY[consultation.status];
  const sessionCopy = consultation.teleconsultSession
    ? TELECONSULT_STATUS_COPY[consultation.teleconsultSession.status]
    : null;
  const canWriteNotes = user.permissions.includes("consultation.notes_write");
  const canPrescribe = user.permissions.includes("consultation.prescribe");
  const fee = rupee(consultation.feeInr);
  const window = formatConsultWindow(consultation.scheduledStart, consultation.scheduledEnd);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={appointmentCopy.tone}>{appointmentCopy.label}</Badge>
            {sessionCopy ? <Badge variant={sessionCopy.tone}>{sessionCopy.label}</Badge> : null}
            {consultation.followUpOfAppointmentId ? <Badge variant="outline">Follow-up</Badge> : null}
          </div>
          <CardTitle className="pt-2 text-2xl">{consultation.patient.fullName}</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            {consultation.familyMember
              ? `Booked for ${consultation.familyMember.fullName} (${consultation.familyMember.relationship})`
              : "Booked for the account holder"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">When</dt>
              <dd className="mt-0.5 font-medium">{window ?? "Not published"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reference</dt>
              <dd className="mt-0.5 font-mono font-medium">{consultation.reference}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fee</dt>
              <dd className="mt-0.5 font-medium">{fee ?? "Not published"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Requested</dt>
              <dd className="mt-0.5 font-medium">{formatConsultInstant(consultation.createdAt) ?? "—"}</dd>
            </div>
          </dl>

          {consultation.reason ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Reason given
              </p>
              <p className="mt-1.5 text-sm leading-relaxed">{consultation.reason}</p>
            </div>
          ) : null}

          {consultation.patientNotes ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Note from the patient
              </p>
              <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{consultation.patientNotes}</p>
            </div>
          ) : null}

          {consultation.cancellationReason ? (
            <div className="rounded-xl border border-emergency/40 bg-emergency-soft p-4">
              <p className="text-xs font-semibold tracking-[0.12em] text-emergency uppercase">
                Cancellation reason
              </p>
              <p className="mt-1.5 text-sm leading-relaxed">{consultation.cancellationReason}</p>
            </div>
          ) : null}

          <p className="text-xs leading-relaxed text-muted-foreground">{appointmentCopy.detail}</p>
        </CardContent>
      </Card>

      <section aria-labelledby="room-heading" className="space-y-4">
        <div>
          <h2 id="room-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Video aria-hidden className="size-4 text-primary" />
            The consultation room
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Opening the room asks the video provider to confirm it exists. Nothing is connected until you and the patient
            actually join, and this page never reports a call as connected on its own.
          </p>
        </div>

        <ConsultationRoom
          appointmentId={consultation.id}
          appointmentStatus={consultation.status}
          canOpenRoom={sessionState.canOpenRoom}
          sessionStatus={sessionState.session?.status ?? null}
          sessionFailureReason={sessionState.session?.failureReason ?? null}
          joinWindowOpensAtIso={sessionState.joinWindowOpensAt?.toISOString() ?? null}
          roomExpiresAtIso={sessionState.roomExpiresAt?.toISOString() ?? null}
          availability={{
            available: sessionState.availability.available,
            label: sessionState.availability.label,
            isSandbox: sessionState.availability.isSandbox,
            isLive: sessionState.availability.isLive,
            notice: sessionState.availability.notice,
          }}
          notice={sessionState.notice}
        />

        <p className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
          {TELEMEDICINE_DISCIPLINE_NOTICE}
        </p>
      </section>

      <section aria-labelledby="notes-heading" className="space-y-4">
        <div>
          <h2 id="notes-heading" className="flex items-center gap-2 text-lg font-semibold">
            <ClipboardList aria-hidden className="size-4 text-primary" />
            Clinical note
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Finalising is what turns a draft into the clinical record. Until then the text stays yours — it is never shown
            to the patient, and a correction to a signed note is recorded as a new note rather than an edit.
          </p>
        </div>

        <ConsultationNoteEditor
          appointmentId={consultation.id}
          notes={notes}
          canWrite={canWriteNotes}
        />
      </section>

      <section aria-labelledby="prescriptions-heading" className="space-y-4">
        <div>
          <h2 id="prescriptions-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Pill aria-hidden className="size-4 text-primary" />
            Prescription
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            A prescription can only be issued from a confirmed or completed consultation. It names you as the prescriber
            and carries your registration number.
          </p>
        </div>

        <PrescriptionIssuer
          appointmentId={consultation.id}
          canPrescribe={canPrescribe}
          prescriptions={prescriptions}
        />
      </section>

      {chat.ok ? (
        <section aria-labelledby="chat-heading" className="space-y-4">
          <div>
            <h2 id="chat-heading" className="flex items-center gap-2 text-lg font-semibold">
              <MessageSquare aria-hidden className="size-4 text-primary" />
              Messages
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              The consultation chat is readable only by you and this patient, and its window is set by the appointment.
            </p>
          </div>
          <ConsultationChat
            appointmentId={consultation.id}
            party="CLINICIAN"
            viewerUserId={user.id}
            counterpartLabel={chat.chat.counterpartLabel}
            isOpen={chat.chat.isOpen}
            closesAtIso={chat.chat.closesAt.toISOString()}
            closedReason={chat.chat.closedReason}
            notice={chat.chat.notice}
            initialMessages={chat.chat.messages}
          />
        </section>
      ) : null}

      <section aria-labelledby="history-heading" className="space-y-4">
        <div>
          <h2 id="history-heading" className="text-lg font-semibold">
            History
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Append-only. Every entry was written by the platform, by you or by the patient.
          </p>
        </div>
        <ol className="space-y-3">
          {consultation.events.map((event) => {
            const copy = APPOINTMENT_EVENT_COPY[event.type];
            return (
              <li key={event.id} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
                <div aria-hidden className="mt-1 size-2 shrink-0 rounded-full bg-primary-soft ring-2 ring-primary/40" />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{copy.label}</p>
                  {event.notes ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">{event.notes}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {formatConsultInstant(event.createdAt) ?? "Time unavailable"}
                    {event.toStatus ? ` · ${event.toStatus}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Only the account that is treating this consultation can open this workspace, and only a verified clinician on
          it can sign a note or issue a prescription.
        </p>
      </section>
    </div>
  );
}
