import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, FileText, MessageSquare, Pill, Video } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { ConsultationActions } from "@/components/telemedicine/consultation-actions";
import { ConsultationChat } from "@/components/telemedicine/consultation-chat";
import { ConsultationRoom } from "@/components/telemedicine/consultation-room";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { getPatientTeleconsultationByReference } from "@/lib/telemedicine/bookings";
import { formatConsultInstant, formatConsultWindow } from "@/lib/telemedicine/format";
import {
  APPOINTMENT_EVENT_COPY,
  CONSULTATION_NOTE_STATUS_COPY,
  TELECONSULT_APPOINTMENT_COPY,
  TELECONSULT_STATUS_COPY,
  TELEMEDICINE_DISCIPLINE_NOTICE,
} from "@/lib/telemedicine/labels";
import { getConsultationChat } from "@/lib/telemedicine/messages";
import { listPatientConsultationNotes } from "@/lib/telemedicine/notes";
import { listPatientConsultationPrescriptions } from "@/lib/telemedicine/prescriptions";
import { getSessionState } from "@/lib/telemedicine/sessions";
import { teleconsultReferenceSchema } from "@/lib/validation/telemedicine";

/**
 * One virtual consultation, as the patient sees it.
 *
 * The page renders four things and invents none of them: what the appointment
 * record says, what the video provider confirmed about the room, the messages
 * that were actually exchanged, and the note and prescription a verified
 * clinician finalised. A draft note is never fetched here, and no surface on
 * this page claims a call took place.
 */

export const metadata: Metadata = {
  title: "Virtual consultation",
  description:
    "One ORVEXA virtual consultation: its room state, the chat, the clinician's finalised note and any prescription issued.",
  robots: { index: false, follow: false },
};

const CONSULTATIONS_PATH = "/dashboard/consultations";

type PageProps = { params: Promise<{ reference: string }> };

function rupee(value: number | null): string | null {
  if (value === null) return null;
  return `₹${value.toLocaleString("en-IN")}`;
}

export default async function ConsultationDetailPage({ params }: PageProps) {
  const { reference } = await params;
  const decoded = decodeURIComponent(reference);
  const valid = teleconsultReferenceSchema.safeParse(decoded);

  return (
    <>
      <PageHero
        eyebrow="Telemedicine"
        title={valid.success ? `Consultation ${valid.data}` : "Consultation"}
        description="Everything recorded against this consultation, and nothing that was not: the room the video provider confirmed, the chat, the clinician's finalised note and any prescription issued."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "My consultations", href: CONSULTATIONS_PATH },
          { title: valid.success ? valid.data : "Consultation", href: `${CONSULTATIONS_PATH}/${decoded}` },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href={CONSULTATIONS_PATH}>
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
          <ConsultationDetail reference={decoded} />
        </Suspense>
      </Section>
    </>
  );
}

async function ConsultationDetail({ reference }: { reference: string }) {
  const nextPath = `${CONSULTATIONS_PATH}/${reference}`;
  const user = await requirePermission("telemedicine.read_own", { nextPath });

  const parsed = teleconsultReferenceSchema.safeParse(reference);
  if (!parsed.success) notFound();

  const consultation = await getPatientTeleconsultationByReference({ userId: user.id, reference: parsed.data });
  // Somebody else's consultation and a reference that does not exist are the
  // same 404, so a reference cannot be probed for existence.
  if (!consultation) notFound();

  const [sessionState, chat, notes, prescriptions] = await Promise.all([
    getSessionState({
      appointmentId: consultation.id,
      scheduledStart: consultation.scheduledStart,
      scheduledEnd: consultation.scheduledEnd,
      appointmentStatus: consultation.status,
    }),
    getConsultationChat({ appointmentId: consultation.id, userId: user.id }),
    listPatientConsultationNotes({ appointmentId: consultation.id, patientUserId: user.id }),
    listPatientConsultationPrescriptions({ appointmentId: consultation.id, patientUserId: user.id }),
  ]);

  const appointmentCopy = TELECONSULT_APPOINTMENT_COPY[consultation.status];
  const sessionCopy = consultation.teleconsultSession
    ? TELECONSULT_STATUS_COPY[consultation.teleconsultSession.status]
    : null;
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
          <CardTitle className="pt-2 text-2xl">{consultation.doctorProfile.user.fullName}</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            {consultation.doctorProfile.specialties.length > 0
              ? consultation.doctorProfile.specialties.join(", ")
              : "General practice"}
            {consultation.doctorProfile.headline ? ` · ${consultation.doctorProfile.headline}` : ""}
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
              <dt className="text-xs text-muted-foreground">For</dt>
              <dd className="mt-0.5 font-medium">
                {consultation.familyMember
                  ? `${consultation.familyMember.fullName} (${consultation.familyMember.relationship})`
                  : consultation.patient.fullName}
              </dd>
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
            The room is opened by the video provider, and this page reports only what the provider confirmed. Opening the
            room does not connect a call.
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

      {chat.ok ? (
        <section aria-labelledby="chat-heading" className="space-y-4">
          <h2 id="chat-heading" className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquare aria-hidden className="size-4 text-primary" />
            Messages
          </h2>
          <ConsultationChat
            appointmentId={consultation.id}
            party="PATIENT"
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

      <section aria-labelledby="notes-heading" className="space-y-4">
        <div>
          <h2 id="notes-heading" className="flex items-center gap-2 text-lg font-semibold">
            <ClipboardList aria-hidden className="size-4 text-primary" />
            Clinical notes
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Only a note a verified clinician finalised appears here. Anything the clinician is still writing stays their
            working text and is not shown.
          </p>
        </div>

        {notes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
            No finalised note has been recorded for this consultation yet. It appears here once the clinician signs it.
          </p>
        ) : (
          <ul className="space-y-4">
            {notes.map((note) => {
              const copy = CONSULTATION_NOTE_STATUS_COPY[note.status];
              return (
                <li key={note.id}>
                  <article className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Badge variant={copy.tone}>{copy.label}</Badge>
                      <p className="text-xs text-muted-foreground">
                        {note.finalizedByLabel ? `Signed by ${note.finalizedByLabel}` : "Signed"}
                        {formatConsultInstant(note.finalizedAt)
                          ? ` · ${formatConsultInstant(note.finalizedAt)}`
                          : ""}
                      </p>
                    </div>

                    {note.amendmentReason ? (
                      <p className="mt-3 rounded-xl border border-warning/40 bg-warning-soft p-3 text-xs leading-relaxed">
                        This note corrects an earlier one. Reason given: {note.amendmentReason}
                      </p>
                    ) : null}

                    <dl className="mt-4 space-y-3 text-sm">
                      {note.diagnosisSummary ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Summary</dt>
                          <dd className="mt-0.5 leading-relaxed">{note.diagnosisSummary}</dd>
                        </div>
                      ) : null}
                      {note.assessment ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Assessment</dt>
                          <dd className="mt-0.5 leading-relaxed whitespace-pre-wrap">{note.assessment}</dd>
                        </div>
                      ) : null}
                      {note.plan ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Plan</dt>
                          <dd className="mt-0.5 leading-relaxed whitespace-pre-wrap">{note.plan}</dd>
                        </div>
                      ) : null}
                      {note.followUpInstructions ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Follow-up
                            {note.followUpAfterDays !== null ? ` · after ${note.followUpAfterDays} days` : ""}
                          </dt>
                          <dd className="mt-0.5 leading-relaxed whitespace-pre-wrap">{note.followUpInstructions}</dd>
                        </div>
                      ) : null}
                      {note.postConsultationInstructions ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">After the consultation</dt>
                          <dd className="mt-0.5 leading-relaxed whitespace-pre-wrap">
                            {note.postConsultationInstructions}
                          </dd>
                        </div>
                      ) : null}
                    </dl>

                    <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                      {copy.detail}
                    </p>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="prescriptions-heading" className="space-y-4">
        <div>
          <h2 id="prescriptions-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Pill aria-hidden className="size-4 text-primary" />
            Prescriptions
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            A prescription listed here was issued by the clinician named on it, from this consultation. An instruction
            written in the chat is not a prescription and does not appear here.
          </p>
        </div>

        {prescriptions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
            No prescription has been issued from this consultation.
          </p>
        ) : (
          <ul className="space-y-4">
            {prescriptions.map((prescription) => (
              <li key={prescription.id}>
                <article className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold">
                        Prescribed by {prescription.prescriberName}
                        {prescription.prescriberRegistrationNumber
                          ? ` · Reg. ${prescription.prescriberRegistrationNumber}`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{prescription.reference}</span>
                        {formatConsultInstant(prescription.issuedOn)
                          ? ` · issued ${formatConsultInstant(prescription.issuedOn)}`
                          : ""}
                        {formatConsultInstant(prescription.validUntil)
                          ? ` · valid until ${formatConsultInstant(prescription.validUntil)}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant={prescription.status === "APPROVED" ? "success" : "neutral"}>
                      {prescription.status === "APPROVED" ? "Issued" : prescription.status}
                    </Badge>
                  </div>

                  <ul className="mt-4 divide-y divide-border border-t border-border pt-1 text-sm">
                    {prescription.items.map((item) => (
                      <li key={item.id} className="py-2.5">
                        <p className="font-medium">
                          {item.prescribedName}
                          {item.strengthLabel ? ` ${item.strengthLabel}` : ""}
                          {item.dosageForm ? ` · ${item.dosageForm}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[
                            item.frequency,
                            item.durationDays !== null ? `${item.durationDays} day(s)` : null,
                            item.quantity !== null ? `qty ${item.quantity}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No dosing written"}
                        </p>
                        {item.instructions ? (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.instructions}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {prescription.patientNotes ? (
                    <p className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed">
                      {prescription.patientNotes}
                    </p>
                  ) : null}

                  <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                    <FileText aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    ORVEXA stores and delivers this prescription exactly as it was written. It never substitutes or
                    changes a medicine on its own.
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="actions-heading" className="space-y-4">
        <div>
          <h2 id="actions-heading" className="text-lg font-semibold">
            Change or follow up
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Whether a consultation can still be moved, cancelled or followed up is decided by the server from the
            appointment&apos;s own state — a refusal is shown exactly as it comes back.
          </p>
        </div>
        <ConsultationActions
          appointmentId={consultation.id}
          reference={consultation.reference}
          doctorProfileId={consultation.doctorProfileId}
          status={consultation.status}
        />
      </section>

      <section aria-labelledby="history-heading" className="space-y-4">
        <div>
          <h2 id="history-heading" className="text-lg font-semibold">
            History
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Append-only. Every entry was written by the platform, by the clinician or by you.
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
      </section>
    </div>
  );
}
