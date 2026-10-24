import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, CircleAlert, MapPin, PhoneCall, Siren, TriangleAlert, Users } from "lucide-react";
import type { EmergencyRequestStatus } from "@prisma/client";

import { DialActions } from "@/components/emergency/dial-actions";
import { CancelIncidentForm, RetryDispatchForm } from "@/components/emergency/incident-forms";
import { IncidentShareForm } from "@/components/emergency/incident-share-form";
import { IncidentStatusBadge } from "@/components/emergency/incident-status-badge";
import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { listEmergencyContacts } from "@/lib/emergency/contacts";
import { emergencyConfig, dialHref } from "@/lib/emergency/config";
import { getDispatchCapability } from "@/lib/emergency/delivery";
import { formatIncidentTime } from "@/lib/emergency/format";
import { loadIncidentByReference, toIncidentSummary } from "@/lib/emergency/incidents";
import {
  REQUEST_STATUS_LABELS,
  describeIncidentStatus,
  hasHumanAcknowledged,
  isResponderConfirmed,
  isTerminalIncidentStatus,
} from "@/lib/emergency/status";
import type { DispatchRequestSummary, IncidentSummary } from "@/lib/emergency/types";
import { externalDirectionsUrl } from "@/lib/maps/config";
import { formatDistance } from "@/lib/maps/geo";
import { EMERGENCY_INCIDENT_TYPE_LABELS, incidentReferenceSchema } from "@/lib/validation/emergency";

/**
 * The incident status page.
 *
 * Three rules hold on every render of this screen:
 *
 *  1. Nothing here can move an incident forward. Cancelling and retrying are the
 *     only mutations, and both are re-authorised server-side.
 *  2. Any status below `ACKNOWLEDGED` is described as "nobody has accepted".
 *     There is no copy path in this file that says help is coming without
 *     `isResponderConfirmed` having returned true.
 *  3. A missing incident and somebody else's incident are indistinguishable —
 *     both are a 404, so a reference cannot be probed for existence.
 */

export const metadata: Metadata = {
  title: "Emergency incident",
  description: "Live status of an ORVEXA emergency incident, with the responders who were asked and how each request ended.",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ reference: string }> };

export default async function IncidentStatusPage({ params }: PageProps) {
  const { reference } = await params;

  return (
    <>
      <PageHero
        eyebrow="Emergency"
        title="Incident status"
        description="What ORVEXA has recorded, who has been asked, and whether anybody has accepted. If life is at risk, call the emergency number now — this page cannot promise a vehicle."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Emergency", href: "/emergency" },
          { title: "Incidents", href: "/emergency/incidents" },
          { title: reference, href: `/emergency/incidents/${reference}` },
        ]}
        actions={
          <Button asChild variant="emergency" size="lg">
            <a href={dialHref(emergencyConfig.numbers.ambulance)}>
              <PhoneCall aria-hidden />
              Call {emergencyConfig.numbers.ambulance}
            </a>
          </Button>
        }
      />

      <Section spacing="sm">
        <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />}>
          <IncidentDetail reference={reference} />
        </Suspense>
      </Section>
    </>
  );
}

async function IncidentDetail({ reference }: { reference: string }) {
  const nextPath = `/emergency/incidents/${reference}`;
  const user = await requirePermission("emergency.raise", { nextPath });

  const parsedReference = incidentReferenceSchema.safeParse(reference);
  if (!parsedReference.success) notFound();

  const record = await loadIncidentByReference(parsedReference.data);
  if (!record) notFound();
  // Cross-account reads are a 404 rather than a 403 on purpose: a different
  // answer would let somebody confirm that a reference exists.
  if (record.createdById !== user.id && record.patientUserId !== user.id) notFound();

  const incident = toIncidentSummary(record);
  const contacts = await listEmergencyContacts(user.id);
  const eligibleContacts = contacts
    .filter((contact) => contact.canReceiveLocation)
    .map((contact) => ({ id: contact.id, fullName: contact.fullName, isPrimary: contact.isPrimary }));

  const capability = getDispatchCapability(emergencyConfig.dispatchMode);
  const copy = describeIncidentStatus(incident.status);
  const confirmed = isResponderConfirmed(incident.status);
  const closed = isTerminalIncidentStatus(incident.status);

  return (
    <div className="space-y-8">
      <StatusCard
        incident={incident}
        copy={copy}
        confirmed={confirmed}
        automatedDispatchAvailable={capability.automatedDispatchAvailable}
        numbersVerified={emergencyConfig.numbersVerified}
      />

      <FallbackActions incident={incident} />

      <RequestsPanel requests={incident.requests} confirmed={confirmed} />

      <LocationPanel incident={incident} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users aria-hidden className="size-4 text-primary" />
            Share your location with a contact
          </CardTitle>
          <CardDescription>
            A link that shows this incident and your location for a limited time. Only contacts you nominated for
            location sharing can receive one, and only because you turned sharing on when raising the incident.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IncidentShareForm
            incidentId={incident.id}
            contactShareConsent={incident.contactShareConsent}
            hasLocation={hasShareableLocation(incident)}
            eligibleContacts={eligibleContacts}
            existingShares={incident.locationShares}
          />
        </CardContent>
      </Card>

      <TimelinePanel incident={incident} />

      {closed ? (
        <Card>
          <CardHeader>
            <CardTitle>This incident is closed</CardTitle>
            <CardDescription>
              No further requests are sent for it, and any location link you issued has stopped working. The record is
              kept as the audit trail.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="emergency">
              <Link href="/emergency">
                <Siren aria-hidden />
                Raise a new incident
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/emergency/incidents">All incidents</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Need to change something?</CardTitle>
            <CardDescription>
              You can ask the nearest registered responders again, or stand the incident down. Neither action can mark a
              responder as coming — only a responder can do that.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <RetryDispatchForm incidentId={incident.id} />
            <div className="border-t border-border pt-5">
              <CancelIncidentForm incidentId={incident.id} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function StatusCard({
  incident,
  copy,
  confirmed,
  automatedDispatchAvailable,
  numbersVerified,
}: {
  incident: IncidentSummary;
  copy: ReturnType<typeof describeIncidentStatus>;
  confirmed: boolean;
  automatedDispatchAvailable: boolean;
  numbersVerified: boolean;
}) {
  return (
    <Card
      className={
        confirmed
          ? undefined
          : "border-emergency/50 shadow-[0_20px_50px_-30px_rgba(220,38,38,0.55)]"
      }
    >
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <IncidentStatusBadge status={incident.status} />
          <Badge variant="neutral">
            <span className="font-mono">{incident.reference}</span>
          </Badge>
        </div>
        <CardTitle className="pt-2 text-2xl">{copy.headline}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{copy.detail}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {confirmed ? (
          <p className="flex items-start gap-2 rounded-xl border border-success/40 bg-success-soft px-4 py-3 text-sm leading-relaxed text-success">
            <Activity aria-hidden className="mt-0.5 size-4 shrink-0" />
            A responder confirmed this through the provider integration. Keep this page open — it updates as the
            responder reports further milestones.
          </p>
        ) : (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl border-2 border-emergency/50 bg-emergency-soft px-4 py-3.5 text-sm leading-relaxed font-medium text-emergency"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
            <span>
              {copy.assurance}{" "}
              <strong className="font-semibold">
                ORVEXA has not dispatched an ambulance, and this screen will say so the whole time nobody has accepted.
              </strong>
            </span>
          </p>
        )}

        <dl className="grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Type</dt>
            <dd className="mt-0.5 font-medium">{EMERGENCY_INCIDENT_TYPE_LABELS[incident.incidentType]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Raised</dt>
            <dd className="mt-0.5 font-medium">{formatIncidentTime(incident.createdAtISO) ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Raised for</dt>
            <dd className="mt-0.5 font-medium">{incident.patientLabel ?? "You"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Asking until</dt>
            <dd className="mt-0.5 font-medium">{formatIncidentTime(incident.expiresAtISO) ?? "Unknown"}</dd>
          </div>
        </dl>

        {incident.injuryDescription ? (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Injury notes</p>
            <p className="mt-1.5 text-sm leading-relaxed">{incident.injuryDescription}</p>
          </div>
        ) : null}

        {!confirmed && !automatedDispatchAvailable ? (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            No automated dispatch transport is configured on this deployment, so requests are recorded here but nothing
            is sent to a responder automatically. Calling the numbers below is what reaches a human right now.
          </p>
        ) : null}

        {incident.isDemo ? (
          <p className="text-xs leading-relaxed text-warning">
            This incident is flagged as seed data and was never sent to a responder.
          </p>
        ) : null}

        {!numbersVerified ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            The emergency numbers shown are published defaults for {emergencyConfig.label} and have not been confirmed
            for this release. Check the number for your state.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fallbacks: dial, nearby care, contacts
// ---------------------------------------------------------------------------

function FallbackActions({ incident }: { incident: IncidentSummary }) {
  const location = incident.location;
  const hasCoordinates = location?.latitude != null && location.longitude != null;

  return (
    <section aria-labelledby="fallback-heading" className="space-y-4">
      <div>
        <h2 id="fallback-heading" className="text-lg font-semibold">
          If nobody accepts, do this
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          A phone call bypasses ORVEXA entirely and reaches a human dispatcher. Read out the reference{" "}
          <span className="font-mono font-medium text-foreground">{incident.reference}</span> and your location.
        </p>
      </div>

      <DialActions compact />

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/emergency/nearby">
            <MapPin aria-hidden />
            Find nearby emergency care
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/emergency/contacts">
            <Users aria-hidden />
            Emergency contacts
          </Link>
        </Button>
        {hasCoordinates ? (
          <Button asChild variant="outline">
            <a
              href={externalDirectionsUrl({
                latitude: location.latitude as number,
                longitude: location.longitude as number,
              })}
            >
              <MapPin aria-hidden />
              Directions to this location
            </a>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const REQUEST_TONE: Record<EmergencyRequestStatus, "default" | "success" | "warning" | "neutral"> = {
  PENDING: "neutral",
  DELIVERED: "neutral",
  ACKNOWLEDGED: "default",
  ACCEPTED: "success",
  DECLINED: "warning",
  EXPIRED: "neutral",
  FAILED: "warning",
};

function RequestsPanel({ requests, confirmed }: { requests: DispatchRequestSummary[]; confirmed: boolean }) {
  const answered = requests.filter((request) => hasHumanAcknowledged(request.status)).length;

  return (
    <section aria-labelledby="requests-heading" className="space-y-4">
      <div>
        <h2 id="requests-heading" className="text-lg font-semibold">
          Responders asked
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {requests.length === 0
            ? "No request has been created yet. A request appears here as soon as ORVEXA has an eligible responder to send one to."
            : `${requests.length} request${requests.length === 1 ? "" : "s"} sent · ${answered} seen by a human.${
                confirmed ? "" : " No acceptance yet."
              }`}
        </p>
      </div>

      {requests.length === 0 ? null : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">{request.responderLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {request.responderKind === "HOSPITAL_EMERGENCY"
                      ? "Hospital emergency department"
                      : request.responderKind === "AMBULANCE_PARTNER"
                        ? "Registered ambulance operator"
                        : "Partner facility"}
                    {request.distanceMetres !== null ? ` · ${formatDistance(request.distanceMetres)}` : ""}
                    {request.etaMinutes !== null ? ` · ETA ${request.etaMinutes} min (as reported)` : ""}
                  </p>
                </div>
                <Badge variant={REQUEST_TONE[request.status]}>{REQUEST_STATUS_LABELS[request.status]}</Badge>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Channel</dt>
                  <dd className="mt-0.5 font-medium">
                    {request.channel === "WEBHOOK"
                      ? "Signed webhook"
                      : request.channel === "MANUAL_CALL"
                        ? "Manually called"
                        : request.channel === "SMS"
                          ? "SMS"
                          : "Email"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Attempts</dt>
                  <dd className="mt-0.5 font-medium">{request.attemptCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last attempt</dt>
                  <dd className="mt-0.5 font-medium">
                    {formatIncidentTime(request.lastAttemptAtISO) ?? "Not attempted"}
                  </dd>
                </div>
              </dl>

              {request.status === "DELIVERED" ? (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  The receiving system accepted this request. That is a delivery receipt, not a person acknowledging it.
                </p>
              ) : null}

              {request.declineReason ? (
                <p className="mt-3 text-xs leading-relaxed text-warning">Declined: {request.declineReason}</p>
              ) : null}
              {request.failureReason ? (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{request.failureReason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

function hasShareableLocation(incident: IncidentSummary) {
  const location = incident.location;
  if (!location) return false;
  const hasCoordinates = location.latitude !== null && location.longitude !== null;
  return hasCoordinates || Boolean(location.addressText && location.addressText.trim().length > 1);
}

function LocationPanel({ incident }: { incident: IncidentSummary }) {
  const location = incident.location;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin aria-hidden className="size-4 text-primary" />
          The location on this incident
        </CardTitle>
        <CardDescription>
          Only what you consented to share was recorded. It is never published publicly and never attached to a link
          unless you issue one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!location ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            No location was recorded for this incident. A responder has to be given directions over the phone — call the
            emergency number and describe the nearest landmark.
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="leading-relaxed">
              {location.addressText ??
                [location.locality, location.city].filter(Boolean).join(", ") ??
                "Address not given."}
            </p>
            {location.latitude !== null && location.longitude !== null ? (
              <p className="text-xs text-muted-foreground">
                GPS fix recorded at {formatIncidentTime(location.consentAtISO) ?? "an unknown time"}
                {location.accuracyMetres !== null
                  ? ` · device reported accuracy ± ${Math.round(location.accuracyMetres)} m`
                  : " · the device did not report an accuracy figure"}
                .
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No GPS coordinates are attached — only the address you typed.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function TimelinePanel({ incident }: { incident: IncidentSummary }) {
  return (
    <section aria-labelledby="timeline-heading" className="space-y-4">
      <div>
        <h2 id="timeline-heading" className="text-lg font-semibold">
          History
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Append-only. Every entry below was written by the platform, by you, or by a responder&apos;s own acknowledgement —
          nothing here is inferred.
        </p>
      </div>

      <ol className="space-y-3">
        {incident.timeline.map((entry) => (
          <li key={entry.id} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
            <div aria-hidden className="mt-1 size-2 shrink-0 rounded-full bg-primary-soft ring-2 ring-primary/40" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">{entry.label}</p>
              {entry.notes ? <p className="text-sm leading-relaxed text-muted-foreground">{entry.notes}</p> : null}
              <p className="text-xs text-muted-foreground">
                {formatIncidentTime(entry.atISO) ?? "Time unavailable"}
                {entry.actorLabel ? ` · ${entry.actorLabel}` : " · system"}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
