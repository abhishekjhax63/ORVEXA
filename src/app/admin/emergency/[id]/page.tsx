import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { EmergencyIncidentEventType, EmergencyRequestChannel, EmergencyRequestStatus } from "@prisma/client";
import { Radio } from "lucide-react";

import { ConsoleCallout, ConsolePageHeader, ConsoleSection, ConsoleStat, ConsoleStatGrid } from "@/components/console/console-page";
import { ConsoleTable, type ConsoleColumn } from "@/components/console/data-table";
import { EmergencyNoteForm } from "@/components/console/emergency/emergency-note-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCountdown, formatIncidentTime } from "@/lib/emergency/format";
import { INCIDENT_EVENT_LABELS, REQUEST_STATUS_LABELS } from "@/lib/emergency/status";
import { requirePlatformContext } from "@/lib/platform/console";
import { loadEmergencyIncident, type DispatchRequestView, type EmergencyIncidentDetail } from "@/lib/platform/emergency-ops";
import { EMERGENCY_INCIDENT_TYPE_LABELS } from "@/lib/validation/emergency";

export const metadata: Metadata = {
  title: "Emergency incident",
  description:
    "One emergency incident: its own timeline, the requests raised to responders, and each request's outcome as a provider reported it.",
};

/**
 * One incident, read from the incident's own record.
 *
 * The timeline rendered here is the incident's append-only events — the same
 * history the reporting user sees — so the two can never disagree. The page can
 * add a note and nothing else; it cannot advance the status or the dispatch.
 */

const CHANNEL_LABELS: Record<EmergencyRequestChannel, string> = {
  EMAIL: "Email",
  SMS: "SMS",
  WEBHOOK: "Provider webhook",
  MANUAL_CALL: "Manual call",
};

function requestBadgeVariant(status: EmergencyRequestStatus) {
  switch (status) {
    case "FAILED":
      return "emergency";
    case "DECLINED":
      return "warning";
    case "ACKNOWLEDGED":
    case "ACCEPTED":
      return "success";
    default:
      return "neutral";
  }
}

function eventLabel(value: string) {
  return (INCIDENT_EVENT_LABELS as Record<string, string>)[value as EmergencyIncidentEventType] ?? value;
}

function typeLabel(value: string) {
  return (EMERGENCY_INCIDENT_TYPE_LABELS as Record<string, string>)[value] ?? value;
}

function locationLine(incident: EmergencyIncidentDetail) {
  const parts = [incident.addressText, incident.locality, incident.city].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : "No address recorded";
}

function coordinateLine(incident: EmergencyIncidentDetail) {
  if (incident.latitude === null || incident.longitude === null) return "No GPS fix recorded";
  const accuracy = incident.accuracyMetres !== null ? ` (±${Math.round(incident.accuracyMetres)} m)` : "";
  return `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}${accuracy}`;
}

type PageProps = { params: Promise<{ id: string }> };

export default async function EmergencyIncidentPage({ params }: PageProps) {
  await requirePlatformContext("platform.emergency_operations");

  const { id } = await params;
  const incident = await loadEmergencyIncident({ incidentId: id });
  if (!incident) notFound();

  const now = Date.now();

  const requestColumns: ConsoleColumn<DispatchRequestView>[] = [
    {
      key: "responder",
      header: "Responder",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{row.responderLabel}</span>
          <span className="text-xs text-muted-foreground">{CHANNEL_LABELS[row.channel]}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Request",
      cell: (row) => <Badge variant={requestBadgeVariant(row.status)}>{REQUEST_STATUS_LABELS[row.status]}</Badge>,
    },
    {
      key: "attempts",
      header: "Attempts",
      align: "right",
      cell: (row) => <span className="tabular-nums">{row.attemptCount}</span>,
    },
    {
      key: "acknowledged",
      header: "Acknowledged",
      hideBelow: "md",
      cell: (row) => (
        <span>{row.acknowledgedAt ? formatIncidentTime(row.acknowledgedAt.toISOString()) : "Not acknowledged"}</span>
      ),
    },
    {
      key: "outcome",
      header: "Outcome",
      hideBelow: "lg",
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.failureReason ?? row.declineReason ?? (row.acknowledgedAt ? "Acknowledged by the provider" : "No decision recorded")}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <ConsolePageHeader
        eyebrow="Emergency operations"
        title={incident.reference}
        back={{ href: "/admin/emergency", label: "Back to the SOS queue" }}
        description={`Incident opened ${formatIncidentTime(incident.createdAt.toISOString()) ?? "at an unknown time"} (${formatCountdown(
          Math.max(0, Math.round((now - incident.createdAt.getTime()) / 60_000)),
        )} ago).`}
        actions={incident.isDemo ? <Badge variant="demo">Demo record</Badge> : undefined}
      />

      <ConsoleStatGrid>
        <ConsoleStat
          label="Status"
          value={incident.statusLabel}
          hint="Set by the response service. Only a provider-side acknowledgement can advance it past seeking."
        />
        <ConsoleStat
          label="Dispatch requests"
          value={incident.dispatch.total}
          hint="One row per responder this incident was sent to."
        />
        <ConsoleStat
          label="Acknowledged"
          value={incident.dispatch.acknowledged}
          tone={incident.dispatch.acknowledged > 0 ? "positive" : "muted"}
          hint="Requests a provider has confirmed a human saw. A delivered-but-unacknowledged request is not counted here."
        />
        <ConsoleStat
          label="Failed to send"
          value={incident.dispatch.failed}
          tone={incident.dispatch.failed > 0 ? "caution" : "muted"}
          hint="Requests that could not be delivered by any transport."
        />
      </ConsoleStatGrid>

      {incident.dispatch.awaitingAcknowledgement ? (
        <ConsoleCallout tone="danger" title="Nobody has acknowledged this incident">
          <p>
            Requests have been raised but no provider has admitted them. Until a provider acknowledges, this incident is
            not a dispatch and no vehicle is confirmed. Escalate out of band by calling the responder or the control room.
          </p>
        </ConsoleCallout>
      ) : null}

      <ConsoleSection title="Incident record" description="What the reporting user recorded, as stored.">
        <dl className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Type</dt>
            <dd className="mt-1 text-sm text-foreground">{typeLabel(incident.incidentType)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Location</dt>
            <dd className="mt-1 text-sm text-foreground">{locationLine(incident)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Coordinates</dt>
            <dd className="mt-1 text-sm text-foreground">{coordinateLine(incident)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Last updated</dt>
            <dd className="mt-1 text-sm text-foreground">
              {formatIncidentTime(incident.updatedAt.toISOString()) ?? "Unknown"}
            </dd>
          </div>
          {incident.injuryDescription ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Reported detail
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-foreground">{incident.injuryDescription}</dd>
            </div>
          ) : null}
        </dl>
      </ConsoleSection>

      <ConsoleSection
        title="Dispatch requests"
        description="One row per responder asked. A status is only shown as acknowledged when a provider confirmed a human acted."
      >
        <ConsoleTable
          caption="Dispatch requests for this incident"
          columns={requestColumns}
          rows={incident.requests}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={Radio}
              size="compact"
              title="No requests raised"
              description="This incident has no dispatch requests yet, so nobody has been asked through the platform."
            />
          }
        />
      </ConsoleSection>

      <ConsoleSection
        title="Incident timeline"
        description="The incident's append-only events, in the order the platform wrote them."
      >
        {incident.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded on this incident.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {incident.events.map((event) => (
              <li key={event.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{eventLabel(event.eventType)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatIncidentTime(event.createdAt.toISOString()) ?? "Unknown"}
                  </span>
                </div>
                {event.notes ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{event.notes}</p> : null}
                {event.actorLabel ? <p className="mt-1 text-xs text-muted-foreground">{event.actorLabel}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </ConsoleSection>

      <ConsoleSection
        title="Operator note"
        description="Record what you did out of band. The note is added to the timeline above."
      >
        <div className="rounded-2xl border border-border bg-card p-5">
          <EmergencyNoteForm incidentId={incident.id} reference={incident.reference} />
        </div>
      </ConsoleSection>

      <ConsoleCallout tone="info" title="This console annotates; it does not respond">
        <p>
          A note records context for whoever reads the incident next. It cannot move the status, acknowledge a request or
          dispatch a vehicle, and no action on this page can. The dispatch state changes only when a provider&apos;s own
          system reports it, which is the only evidence the platform will accept.
        </p>
        <p>
          <Link href="/admin/emergency" className="font-medium text-primary hover:underline">
            Return to the SOS queue
          </Link>
        </p>
      </ConsoleCallout>
    </div>
  );
}
