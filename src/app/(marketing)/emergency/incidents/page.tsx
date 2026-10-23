import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CircleAlert, Siren } from "lucide-react";

import { IncidentStatusBadge } from "@/components/emergency/incident-status-badge";
import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePermission } from "@/lib/auth/guards";
import { formatIncidentTime } from "@/lib/emergency/format";
import { listIncidentsForUser, toIncidentSummary } from "@/lib/emergency/incidents";
import { describeIncidentStatus, isActiveIncidentStatus, isResponderConfirmed } from "@/lib/emergency/status";
import type { IncidentSummary } from "@/lib/emergency/types";
import { EMERGENCY_INCIDENT_TYPE_LABELS } from "@/lib/validation/emergency";

export const metadata: Metadata = {
  title: "My emergency incidents",
  description: "Every emergency incident raised from your ORVEXA account, with the responder requests and their outcomes.",
  robots: { index: false, follow: false },
};

const INCIDENTS_PATH = "/emergency/incidents";

export default function IncidentsPage() {
  return (
    <>
      <PageHero
        eyebrow="Emergency"
        title="My emergency incidents"
        description="The record of every incident raised from your account, who was asked, and who answered. These records are kept for the audit trail even after an incident closes."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Emergency", href: "/emergency" },
          { title: "Incidents", href: INCIDENTS_PATH },
        ]}
        actions={
          <>
            <Button asChild variant="emergency" size="lg">
              <Link href="/emergency">
                <Siren aria-hidden />
                Raise a new incident
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/emergency/contacts">Emergency contacts</Link>
            </Button>
          </>
        }
      />

      <Section spacing="sm" aria-labelledby="incidents-heading">
        <h2 id="incidents-heading" className="sr-only">
          Incident history
        </h2>
        <Suspense fallback={<div aria-hidden className="h-64 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />}>
          <IncidentLists />
        </Suspense>
      </Section>
    </>
  );
}

/** The session read sits inside the boundary; it is request-time only. */
async function IncidentLists() {
  const user = await requirePermission("emergency.raise", { nextPath: INCIDENTS_PATH });
  const records = await listIncidentsForUser(user.id, { limit: 50 });
  const summaries = records.map((record) => toIncidentSummary(record));

  const active = summaries.filter((incident) => isActiveIncidentStatus(incident.status));
  const past = summaries.filter((incident) => !isActiveIncidentStatus(incident.status));

  if (summaries.length === 0) {
    return (
      <EmptyState
        icon={Siren}
        title="No incidents on this account"
        description="When you raise an emergency incident it appears here with its status, the responders who were asked and how each request ended."
        action={
          <Button asChild variant="emergency">
            <Link href="/emergency">Open the SOS panel</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-10">
      {active.length > 0 ? (
        <section aria-labelledby="active-heading" className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 id="active-heading" className="text-lg font-semibold">
              Open incidents
            </h3>
            <span className="rounded-full bg-emergency-soft px-2.5 py-0.5 text-xs font-semibold text-emergency">
              {active.length}
            </span>
          </div>
          <ul className="space-y-3">
            {active.map((incident) => (
              <li key={incident.id}>
                <IncidentRow incident={incident} live />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section aria-labelledby="past-heading" className="space-y-4">
          <h3 id="past-heading" className="text-lg font-semibold">
            Closed incidents
          </h3>
          <ul className="space-y-3">
            {past.map((incident) => (
              <li key={incident.id}>
                <IncidentRow incident={incident} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function IncidentRow({ incident, live = false }: { incident: IncidentSummary; live?: boolean }) {
  const copy = describeIncidentStatus(incident.status);
  const unaccepted = !isResponderConfirmed(incident.status) && !["CANCELLED", "RESOLVED"].includes(incident.status);
  const answered = incident.requests.filter((request) => request.acknowledged).length;

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IncidentStatusBadge status={incident.status} />
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emergency">
                <Activity aria-hidden className="size-3.5" />
                Open
              </span>
            ) : null}
          </div>
          <h4 className="pt-1 font-semibold">{EMERGENCY_INCIDENT_TYPE_LABELS[incident.incidentType]}</h4>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{incident.reference}</span>
            {formatIncidentTime(incident.createdAtISO) ? ` · raised ${formatIncidentTime(incident.createdAtISO)}` : null}
          </p>
        </div>

        <Button asChild variant={live ? "emergency" : "outline"} size="sm">
          <Link href={`${INCIDENTS_PATH}/${incident.reference}`}>View incident</Link>
        </Button>
      </div>

      {live && unaccepted ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency-soft px-3 py-2.5 text-xs font-medium leading-relaxed text-emergency">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {copy.assurance}
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Requests sent</dt>
          <dd className="mt-0.5 font-semibold">{incident.requests.length}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Seen by a responder</dt>
          <dd className="mt-0.5 font-semibold">{answered}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Location shared</dt>
          <dd className="mt-0.5 font-semibold">{incident.location ? "Recorded" : "Not recorded"}</dd>
        </div>
      </dl>
    </article>
  );
}
