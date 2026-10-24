import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { ConsultJoin } from "@/components/telemedicine/consult-join";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/guards";
import { TELEMEDICINE_DISCIPLINE_NOTICE } from "@/lib/telemedicine/labels";

/**
 * The landing page behind a consultation join link.
 *
 * The link carries an opaque token and nothing else about the consultation: the
 * patient, the clinician and the appointment are resolved from the token on the
 * server, and only for an account that is one of the two participants. A
 * visitor who is not signed in is sent to sign in and returns here.
 */

export const metadata: Metadata = {
  title: "Join a consultation",
  description: "Open the secure room for your ORVEXA virtual consultation.",
  robots: { index: false, follow: false },
};

const CONSULTATIONS_PATH = "/dashboard/consultations";

type PageProps = { params: Promise<{ token: string }> };

/** A join token's shape, checked before it is sent anywhere. */
function looksLikeJoinToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,200}$/.test(value);
}

export default async function ConsultJoinPage({ params }: PageProps) {
  const { token } = await params;
  const decoded = decodeURIComponent(token).trim();

  return (
    <>
      <PageHero
        eyebrow="Telemedicine"
        title="Your consultation link"
        description="This link is personal and short-lived. Open it when you are ready to join, from the device you will use for the consultation."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "My consultations", href: CONSULTATIONS_PATH },
          { title: "Join", href: `/consult/${decoded}` },
        ]}
      />

      <Section spacing="sm">
        <Suspense
          fallback={<div aria-hidden className="h-64 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />}
        >
          <JoinGate token={decoded} />
        </Suspense>

        <p className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {TELEMEDICINE_DISCIPLINE_NOTICE}
        </p>
      </Section>
    </>
  );
}

async function JoinGate({ token }: { token: string }) {
  if (!looksLikeJoinToken(token)) {
    return (
      <div className="space-y-4 rounded-2xl border border-emergency/40 bg-emergency-soft p-6">
        <p className="text-sm font-medium">That join link is not valid.</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The link may have been copied incompletely, or it may have expired. A fresh link can be issued from the
          consultation itself.
        </p>
        <Button asChild variant="outline">
          <Link href={CONSULTATIONS_PATH}>Open my consultations</Link>
        </Button>
      </div>
    );
  }

  // A signed-out visitor is sent to sign in and returns to this exact link.
  await requirePermission("telemedicine.read_own", { nextPath: `/consult/${token}` });

  return <ConsultJoin token={token} />;
}
