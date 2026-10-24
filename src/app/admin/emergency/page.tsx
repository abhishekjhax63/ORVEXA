import type { Metadata } from "next";
import Link from "next/link";
import type { EmergencyIncidentStatus } from "@prisma/client";
import { Siren } from "lucide-react";

import {
  ConsoleCallout,
  ConsolePageHeader,
  ConsoleSection,
  ConsoleStat,
  ConsoleStatGrid,
} from "@/components/console/console-page";
import { ConsoleTable, type ConsoleColumn } from "@/components/console/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCountdown, formatIncidentTime } from "@/lib/emergency/format";
import { requirePlatformContext } from "@/lib/platform/console";
import { listEmergencyIncidents, type EmergencyIncidentListItem } from "@/lib/platform/emergency-ops";
import { EMERGENCY_INCIDENT_TYPE_LABELS } from "@/lib/validation/emergency";

export const metadata: Metadata = {
  title: "Emergency operations",
  description:
    "The SOS queue: live incidents, the dispatch requests raised for them, and the ones no provider has acknowledged.",
};

/**
 * The SOS delivery monitor.
 *
 * This page is a reader. It shows what the platform has recorded and what each
 * provider has actually confirmed, and it offers no control that could admit a
 * request, accept an incident or invent a dispatch — those transitions belong to
 * the response service and only ever happen on a provider-side acknowledgement.
 * The one number it leads with, `awaitingAcknowledgement`, is exactly the state
 * where requests were sent and nobody has answered.
 */

/** The service pages at 25 by default; the footer states the truncation. */
const PAGE_SIZE = 25;

function incidentBadgeVariant(status: EmergencyIncidentStatus) {
  if (status === "SEEKING_RESPONDERS" || status === "UNANSWERED") return "emergency";
  if (status === "RESOLVED" || status === "CANCELLED" || status === "EXPIRED") return "neutral";
  return "default";
}

function incidentTypeLabel(value: string) {
  return (
    (EMERGENCY_INCIDENT_TYPE_LABELS as Record<string, string>)[value] ??
    value
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function locationLabel(incident: EmergencyIncidentListItem) {
  const parts = [incident.locality, incident.city].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : "Not recorded";
}

function ageLabel(createdAt: Date, now: number) {
  return formatCountdown(Math.max(0, Math.round((now - createdAt.getTime()) / 60_000)));
}

export default async function EmergencyOperationsPage() {
  await requirePlatformContext("platform.emergency_operations");

  const { items, total, summary } = await listEmergencyIncidents({ pageSize: PAGE_SIZE });
  // The page already reads request-time state through the guard, so a clock read
  // here is a normal part of a dynamic render.
  const now = Date.now();

  const columns: ConsoleColumn<EmergencyIncidentListItem>[] = [
    {
      key: "reference",
      header: "Incident",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <Link href={`/admin/emergency/${row.id}`} className="font-medium text-primary hover:underline">
            {row.reference}
          </Link>
          <span className="text-xs text-muted-foreground">{incidentTypeLabel(row.incidentType)}</span>
        </div>
      ),
    },
    {
      key: "raised",
      header: "Raised",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <span>{formatIncidentTime(row.createdAt.toISOString()) ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground">{ageLabel(row.createdAt, now)} ago</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <Badge variant={incidentBadgeVariant(row.status)}>{row.statusLabel}</Badge>,
    },
    {
      key: "location",
      header: "Location",
      hideBelow: "md",
      cell: (row) => <span>{locationLabel(row)}</span>,
    },
    {
      key: "dispatch",
      header: "Dispatch requests",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <span>
            {row.dispatch.total} {row.dispatch.total === 1 ? "request" : "requests"} · {row.dispatch.acknowledged}{" "}
            acknowledged
          </span>
          {row.dispatch.awaitingAcknowledgement ? (
            <span className="text-xs font-medium text-emergency">No provider has acknowledged</span>
          ) : row.dispatch.failed > 0 ? (
            <span className="text-xs font-medium text-warning">{row.dispatch.failed} could not be sent</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "record",
      header: "Record",
      hideBelow: "lg",
      cell: (row) =>
        row.isDemo ? (
          <Badge variant="demo">Demo</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Live</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <ConsolePageHeader
        eyebrow="Emergency operations"
        title="SOS delivery monitor"
        description="Every request this platform has raised to a responder, and the ones nobody has answered. This console is a reader: it can annotate an incident, but it cannot acknowledge, accept or dispatch on anyone's behalf."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/emergency/integrations">Integration configuration</Link>
          </Button>
        }
      />

      <ConsoleStatGrid>
        <ConsoleStat
          label="Active incidents"
          value={summary.active}
          tone={summary.active > 0 ? "default" : "muted"}
          hint="Incidents in a live status — seeking, acknowledged, accepted, en route, on scene or transporting — across all time. Demo records are excluded."
        />
        <ConsoleStat
          label="Awaiting acknowledgement"
          value={summary.awaitingAcknowledgement}
          tone={summary.awaitingAcknowledgement > 0 ? "critical" : "muted"}
          hint="Live incidents whose requests have been raised but not admitted by any provider. This is the number that means help was asked for and nobody has answered."
        />
        <ConsoleStat
          label="Failed requests"
          value={summary.failedRequests}
          tone={summary.failedRequests > 0 ? "caution" : "muted"}
          hint="Dispatch requests recorded as not delivered, across all time, on real incidents. Demo records are excluded."
        />
        <ConsoleStat
          label="Expired / unanswered"
          value={summary.expiredLast24Hours}
          tone={summary.expiredLast24Hours > 0 ? "caution" : "muted"}
          hint="Incidents that expired or went unanswered and were last updated in the past 24 hours."
        />
      </ConsoleStatGrid>

      <ConsoleCallout tone="warning" title="What this queue can and cannot say">
        <p>
          An incident&apos;s status only advances when a provider-side integration confirms it. Nothing on this page
          acknowledges a request, accepts on a crew&apos;s behalf or declares that a vehicle is coming. A request shown as
          delivered reached a receiving system — that is a delivery receipt, not a person acknowledging it, and it is not a
          dispatch.
        </p>
        <p>
          Where a request stays unacknowledged, the correct action is to escalate out of band: call the responder or the
          regional control room directly. A note added here records that call; it is not the call itself.
        </p>
      </ConsoleCallout>

      <ConsoleSection
        title="Incident queue"
        description="Most recent first. Open an incident to read its timeline and its dispatch attempts, and to add an operator note."
      >
        <ConsoleTable
          caption="Emergency incidents, most recent first"
          columns={columns}
          rows={items}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={Siren}
              size="compact"
              title="No incidents in this queue"
              description="No non-demo incident is recorded here right now. Rehearsal records are excluded from this view by design."
            />
          }
          footer={
            total > items.length
              ? `Showing the ${items.length} most recent of ${total} incidents. Older incidents are not listed here. Demo and rehearsal records are excluded from this queue.`
              : `${items.length} incident${items.length === 1 ? "" : "s"} listed. Demo and rehearsal records are excluded from this queue.`
          }
        />
      </ConsoleSection>
    </div>
  );
}
