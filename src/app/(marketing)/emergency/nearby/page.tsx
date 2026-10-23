import type { Metadata } from "next";
import Link from "next/link";
import { PhoneCall, Siren, Users } from "lucide-react";

import { DialActions } from "@/components/emergency/dial-actions";
import { NearbyExplorer } from "@/components/emergency/nearby-explorer";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dialHref, emergencyConfig } from "@/lib/emergency/config";

/**
 * Nearby emergency care.
 *
 * Reachable without an account, because somebody who is not signed in still needs
 * the nearest emergency department. Nothing on this page is served from the demo
 * dataset: the facilities come from the provider directory in the database, and
 * anything the directory does not hold is described as missing.
 */

export const metadata: Metadata = {
  title: "Nearby emergency care",
  description:
    "Find registered hospital emergency departments, ambulance operators, pharmacies and laboratories near you, with the distances and availability ORVEXA actually holds. Call 108 for a real emergency in India.",
  alternates: { canonical: "/emergency/nearby" },
};

const limits = [
  {
    id: "limit-1",
    title: "ORVEXA has no live bed or ICU feed",
    detail:
      "No hospital is shown as having a free bed, because we are not connected to any hospital's admission system. Call the emergency desk to confirm they can take the patient.",
  },
  {
    id: "limit-2",
    title: "A vehicle is only counted as free when the operator says so",
    detail:
      "An operator is shown as having a vehicle available only when its own dispatch system reported that within the last five minutes. Otherwise availability reads as unknown.",
  },
  {
    id: "limit-3",
    title: "Straight-line distance is not a travel time",
    detail:
      "The distance beside each provider is a direct line from your position. A road distance and a travel time appear only when the mapping provider returns them for a route you asked for.",
  },
  {
    id: "limit-4",
    title: "A listing here does not summon anyone",
    detail:
      "Opening this page notifies nobody. To ask for help, raise an incident from the emergency screen, or call the numbers below.",
  },
];

export default function NearbyEmergencyPage() {
  return (
    <>
      <PageHero
        eyebrow="Emergency"
        title="Find the nearest emergency care"
        description="Search around your current location, or by address, locality or pin code if you would rather not share it. Every provider listed is registered with ORVEXA, and anything we cannot verify is labelled as unknown rather than guessed."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Emergency", href: "/emergency" },
          { title: "Nearby care", href: "/emergency/nearby" },
        ]}
        actions={
          <>
            <Button asChild variant="emergency" size="lg">
              <a href={dialHref(emergencyConfig.numbers.ambulance)}>
                <PhoneCall aria-hidden />
                Call {emergencyConfig.numbers.ambulance}
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/emergency">
                <Siren aria-hidden />
                Raise an incident
              </Link>
            </Button>
          </>
        }
      />

      <Section spacing="sm">
        <NearbyExplorer />
      </Section>

      <Section tone="muted" spacing="default" aria-labelledby="nearby-limits-heading">
        <SectionHeading
          eyebrow="What this page cannot tell you"
          title={<span id="nearby-limits-heading">Read this before you travel</span>}
          description="An emergency screen that overstates what it knows can send somebody to the wrong place. These are the limits of the data behind the search above."
        />
        <ul className="mt-8 grid gap-5 sm:grid-cols-2">
          {limits.map((limit) => (
            <li key={limit.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">{limit.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">{limit.detail}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      <Section spacing="default" aria-labelledby="nearby-call-heading">
        <SectionHeading
          eyebrow="Always available"
          title={<span id="nearby-call-heading">Calling works without this page</span>}
          description="A phone call reaches a human dispatcher directly. Nothing has to load, and no location permission is required."
        />
        <div className="mt-8">
          <DialActions />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/emergency/contacts">
              <Users aria-hidden />
              Manage your emergency contacts
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/emergency">Back to emergency SOS</Link>
          </Button>
        </div>
        <DemoNotice className="mt-8">
          Facilities come from ORVEXA&apos;s own provider directory. Rows added as seed data are marked in the database,
          and no seeded provider is described as verified or available until a real verification and a real availability
          feed exist.
        </DemoNotice>
      </Section>
    </>
  );
}
