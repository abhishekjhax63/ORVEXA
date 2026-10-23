import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, Clock, MapPin, PhoneCall, ShieldCheck, TriangleAlert } from "lucide-react";

import { DialActions } from "@/components/emergency/dial-actions";
import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dialHref, emergencyConfig } from "@/lib/emergency/config";
import { formatIncidentTime } from "@/lib/emergency/format";
import { recordShareView, resolveLocationShare } from "@/lib/emergency/location-share";
import { externalDirectionsUrl } from "@/lib/maps/config";
import { EMERGENCY_INCIDENT_TYPE_LABELS } from "@/lib/validation/emergency";

/**
 * Public view behind a time-limited location link.
 *
 * Reachable without signing in, because the person who needs it is a relative or
 * neighbour who has no ORVEXA account. Three rules:
 *
 *  1. The token is the whole credential. It is only ever compared against an
 *     HMAC digest, so the database cannot be replayed to track a patient.
 *  2. The page shows exactly what was consented to. If consent was withdrawn or
 *     the incident was cancelled, the link resolves to nothing and says so —
 *     `resolveLocationShare` decides that, not this file.
 *  3. Nothing here is indexed, and nothing treats the link as proof that help is
 *     coming. A reader who is deciding whether to drive over must be able to tell
 *     an answered incident from an unanswered one at a glance.
 */

export const metadata: Metadata = {
  title: "Emergency location",
  description: "A time-limited ORVEXA emergency location shared by the person who raised the incident.",
  robots: { index: false, follow: false, nocache: true },
};

type PageProps = { params: Promise<{ token: string }> };

export default async function LocationSharePage({ params }: PageProps) {
  const { token } = await params;

  return (
    <>
      <PageHero
        eyebrow="Shared with you"
        title="Emergency location"
        description="You were given this link by someone raising an emergency incident on ORVEXA. It works for a limited time and shows only what they agreed to share."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Emergency", href: "/emergency" },
          { title: "Shared location", href: `/emergency/share/${token}` },
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
        <Suspense fallback={<div aria-hidden className="h-72 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />}>
          <SharedLocation token={token} />
        </Suspense>
      </Section>
    </>
  );
}

async function SharedLocation({ token }: { token: string }) {
  const result = await resolveLocationShare(token);

  if (!result.ok) {
    return <UnavailableShare reason={result.reason} />;
  }

  const share = result.share;

  // Counted so the reporter can see the link was opened. The opener is never
  // identified or stored.
  await recordShareView(result.shareId);

  return (
    <div className="space-y-8">
      <Card className={share.responderConfirmed ? undefined : "border-emergency/50"}>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={share.responderConfirmed ? "success" : "emergency"}>{share.statusLabel}</Badge>
            <Badge variant="neutral">
              <span className="font-mono">{share.reference}</span>
            </Badge>
          </div>
          <CardTitle className="pt-2 text-2xl">
            {share.responderConfirmed
              ? "A responder has accepted this incident"
              : "Nobody has accepted this incident yet"}
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            {incidentTypeLabel(share.incidentType)}, raised {formatIncidentTime(share.incidentCreatedAtISO) ?? "recently"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {share.responderConfirmed ? (
            <p className="flex items-start gap-2 rounded-xl border border-success/40 bg-success-soft px-4 py-3 text-sm leading-relaxed text-success">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              {share.responderLabel
                ? `${share.responderLabel} confirmed through the provider integration that they accepted this incident.`
                : "A responder confirmed through the provider integration that they accepted this incident."}{" "}
              A vehicle on the way is not the same thing as an arrival — call them if you are unsure.
            </p>
          ) : (
            <p
              role="status"
              className="flex items-start gap-2 rounded-xl border-2 border-emergency/50 bg-emergency-soft px-4 py-3.5 text-sm leading-relaxed font-medium text-emergency"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
              <span>
                No ambulance or hospital has accepted this incident. Do not assume one is coming.{" "}
                <strong className="font-semibold">Call the emergency number yourself if you can help.</strong>
              </span>
            </p>
          )}

          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            This link stops working at {formatIncidentTime(share.expiresAtISO) ?? "the end of its window"}, and
            immediately if the incident is cancelled.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin aria-hidden className="size-4 text-primary" />
            The location shared with you
          </CardTitle>
          <CardDescription>
            Recorded from the reporter&apos;s device or typed by them. It is a snapshot taken when the incident was
            raised, not a live position.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!share.location ? (
            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              No location is available on this link. The person who raised the incident either did not record one or has
              withdrawn permission to share it. Phone them and ask for the nearest landmark.
            </p>
          ) : (
            <>
              <p className="text-sm leading-relaxed">
                {share.location.addressText ??
                  [share.location.locality, share.location.city].filter(Boolean).join(", ") ??
                  "No address was given."}
              </p>
              {share.location.latitude !== null && share.location.longitude !== null ? (
                <>
                  <p className="font-mono text-xs text-muted-foreground">
                    {share.location.latitude.toFixed(4)}, {share.location.longitude.toFixed(4)}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline">
                      <a
                        href={externalDirectionsUrl({
                          latitude: share.location.latitude,
                          longitude: share.location.longitude,
                        })}
                      >
                        <MapPin aria-hidden />
                        Open directions
                      </a>
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No GPS coordinates were shared — only the address above.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="share-call-heading" className="space-y-4">
        <div>
          <h2 id="share-call-heading" className="text-lg font-semibold">
            Calling is faster than this page
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Give the dispatcher the reference <span className="font-mono font-medium text-foreground">{share.reference}</span>{" "}
            and the address above.
          </p>
        </div>
        <DialActions compact />
        <p className="text-xs leading-relaxed text-muted-foreground">
          ORVEXA cannot see this person&apos;s live position, cannot see hospital capacity, and cannot send a vehicle on
          your behalf. This page only repeats what was recorded.
        </p>
        <Button asChild variant="ghost" size="sm">
          <Link href="/emergency">What ORVEXA emergency does and does not do</Link>
        </Button>
      </section>
    </div>
  );
}

function UnavailableShare({ reason }: { reason: "not_found" | "expired" | "revoked" }) {
  const copy = {
    not_found: {
      title: "This link is not valid",
      detail:
        "The link is incomplete, was mistyped, or does not belong to any share on ORVEXA. Ask the person who sent it to send it again.",
    },
    expired: {
      title: "This link has expired",
      detail:
        "The time window for this link has passed. Ask the person who raised the incident to issue a new one, or phone them directly.",
    },
    revoked: {
      title: "This link no longer works",
      detail:
        "Location sharing for this incident was withdrawn, or the incident was cancelled. Nothing is being shared through this link any more.",
    },
  }[reason];

  return (
    <Card className="border-warning/40">
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{copy.detail}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <DialActions compact />
        <p className="text-xs leading-relaxed text-muted-foreground">
          If this is a medical emergency right now, call the emergency number above rather than waiting for a new link.
        </p>
      </CardContent>
    </Card>
  );
}

function incidentTypeLabel(value: string) {
  return (EMERGENCY_INCIDENT_TYPE_LABELS as Record<string, string>)[value] ?? "An emergency incident";
}
