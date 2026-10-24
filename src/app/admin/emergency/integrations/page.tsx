import type { Metadata } from "next";
import Link from "next/link";
import type { EmergencyRequestChannel, EmergencyRequestStatus } from "@prisma/client";
import { PlugZap, ShieldCheck } from "lucide-react";

import { ConsoleCallout, ConsolePageHeader, ConsoleSection } from "@/components/console/console-page";
import { ConsoleTable, type ConsoleColumn } from "@/components/console/data-table";
import { IntegrationProbeButton } from "@/components/console/emergency/integration-probe-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIncidentTime } from "@/lib/emergency/format";
import { REQUEST_STATUS_LABELS } from "@/lib/emergency/status";
import { requirePlatformContext } from "@/lib/platform/console";
import {
  integrationStatuses,
  listDispatchTrouble,
  type FailedDispatchView,
  type IntegrationStatus,
} from "@/lib/platform/emergency-ops";

export const metadata: Metadata = {
  title: "Emergency integrations",
  description:
    "Which outbound emergency integrations this deployment is configured to use, and the dispatch requests that failed or were never acknowledged.",
};

/**
 * Emergency integration configuration and dispatch trouble.
 *
 * `integrationStatuses()` reports *configuration*, not vendor health: it answers
 * "can this deployment even attempt an SMS or a dispatch" and never claims a
 * provider is healthy on the strength of an environment variable. The wording
 * below keeps that distinction, and the trouble list keeps the second one — a
 * request that could not be sent and a request that was sent but never
 * acknowledged are different failures shown side by side.
 */

const TROUBLE_LIMIT = 100;

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

const providerColumns: ConsoleColumn<IntegrationStatus>[] = [
  {
    key: "provider",
    header: "Provider",
    cell: (row) => <span className="font-medium">{row.label}</span>,
  },
  {
    key: "state",
    header: "Configuration",
    cell: (row) => (
      <Badge variant={row.state === "configured" ? "success" : "emergency"}>
        {row.state === "configured" ? "Configured" : "Not configured"}
      </Badge>
    ),
  },
  {
    key: "detail",
    header: "Detail",
    hideBelow: "md",
    cell: (row) => <span className="text-muted-foreground">{row.detail}</span>,
  },
  {
    key: "action",
    header: "Check",
    align: "right",
    cell: (row) => <IntegrationProbeButton provider={row.provider} label={row.label} />,
  },
];

const troubleColumns: ConsoleColumn<FailedDispatchView>[] = [
  {
    key: "incident",
    header: "Incident",
    cell: (row) => (
      <Link href={`/admin/emergency/${row.incidentId}`} className="font-medium text-primary hover:underline">
        {row.incidentReference}
      </Link>
    ),
  },
  {
    key: "responder",
    header: "Responder",
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <span>{row.responderLabel}</span>
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
    key: "lastAttempt",
    header: "Last attempt",
    hideBelow: "md",
    cell: (row) => <span>{row.lastAttemptAt ? formatIncidentTime(row.lastAttemptAt.toISOString()) : "None recorded"}</span>,
  },
  {
    key: "reason",
    header: "Why it needs attention",
    hideBelow: "lg",
    cell: (row) => (
      <span className="text-muted-foreground">
        {row.failureReason ?? (row.status === "FAILED" ? "Could not be delivered" : "Sent, no acknowledgement from any provider")}
      </span>
    ),
  },
];

export default async function EmergencyIntegrationsPage() {
  await requirePlatformContext("platform.emergency_operations");

  // A configuration read, not a live call: it never reports a provider as healthy.
  const statuses = integrationStatuses();
  const trouble = await listDispatchTrouble({ limit: TROUBLE_LIMIT });

  return (
    <div className="flex flex-col gap-8">
      <ConsolePageHeader
        eyebrow="Emergency operations"
        title="Integration configuration"
        back={{ href: "/admin/emergency", label: "Back to the SOS queue" }}
        description="Whether this deployment is configured to send each kind of outbound request, and the dispatch requests that failed or were never acknowledged."
      />

      <ConsoleCallout tone="info" title="A configuration check, not a live vendor round-trip">
        <p>
          Each row reports whether this deployment is configured for that integration — credentials present, provider
          selected, dispatch webhook set. It does not contact the vendor, and it is not a health check. A provider shown
          as configured means the platform can attempt a send, not that the send will succeed. A provider shown as not
          configured means this deployment cannot use it at all, which is the fact worth acting on.
        </p>
      </ConsoleCallout>

      <ConsoleSection
        title="Outbound providers"
        description="Checking a provider records its current configuration state and opens or resolves the matching alert. It raises no request of its own."
      >
        <ConsoleTable
          caption="Outbound integration configuration"
          columns={providerColumns}
          rows={statuses}
          getRowKey={(row) => row.provider}
          empty={
            <EmptyState
              icon={PlugZap}
              size="compact"
              title="No integrations monitored"
              description="This deployment reports no configurable outbound integrations."
            />
          }
        />
      </ConsoleSection>

      <ConsoleSection
        title="Dispatch trouble"
        description="Requests that could not be sent, and requests that were sent but never acknowledged, on real incidents. Demo incidents are excluded."
      >
        <ConsoleCallout tone="warning" title="Two different failures, one action">
          <p>
            A request that could not be sent reached nobody at all. A request that was sent but not acknowledged reached a
            receiving system — a delivery receipt, not a person — and may still be waiting for a human. Neither is a
            dispatch. Both are chased the same way: by calling the responder directly.
          </p>
        </ConsoleCallout>
        <ConsoleTable
          caption="Failed and unacknowledged dispatch requests"
          columns={troubleColumns}
          rows={trouble}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={ShieldCheck}
              size="compact"
              title="No dispatch trouble"
              description="No request on a real incident is currently failed or awaiting acknowledgement. Demo incidents are not counted here."
            />
          }
          footer={
            trouble.length >= TROUBLE_LIMIT
              ? `Showing the ${TROUBLE_LIMIT} most recent failed or unacknowledged requests. Older trouble is not shown here.`
              : `${trouble.length} request${trouble.length === 1 ? "" : "s"} listed.`
          }
        />
      </ConsoleSection>
    </div>
  );
}
