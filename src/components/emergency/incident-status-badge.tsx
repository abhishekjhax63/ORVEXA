import type { EmergencyIncidentStatus } from "@prisma/client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUS_TONE, type IncidentStatusTone } from "@/lib/emergency/status";
import { cn } from "@/lib/utils";

/**
 * Status pill for an incident.
 *
 * `pending` — which includes "no responder accepted" — is deliberately the
 * loudest of the tones, so an unanswered incident never reads as calmly as a
 * closed one.
 */
const VARIANT: Record<IncidentStatusTone, BadgeProps["variant"]> = {
  pending: "emergency",
  confirmed: "success",
  terminal: "warning",
  closed: "neutral",
};

function IncidentStatusBadge({ status, className }: { status: EmergencyIncidentStatus; className?: string }) {
  return (
    <Badge variant={VARIANT[INCIDENT_STATUS_TONE[status]]} className={cn(className)}>
      {INCIDENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export { IncidentStatusBadge };
