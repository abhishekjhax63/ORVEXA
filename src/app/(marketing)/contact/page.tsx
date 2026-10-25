import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink, Mail, MapPin, PhoneCall, Siren } from "lucide-react";

import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { supportChannels } from "@/data/support";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact ORVEXA using the phone number and email address provided for this project. Response times and walk-in availability are not verified.",
  alternates: { canonical: "/contact" },
};

const supportTel = `tel:${siteConfig.supportPhone.replace(/\s/g, "")}`;
const emergencyTel = `tel:${siteConfig.emergencyNumber}`;
const supportMailto = `mailto:${siteConfig.supportEmail}`;
const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(siteConfig.address)}`;

/** Links to the project's currently available informational pages. */
const commonTopics = [
  {
    id: "directory",
    title: "Find Patna providers",
    detail: "Review hospital and doctor listings supplied in spreadsheets; details are pending verification.",
    href: "/hospitals",
    label: "Open provider directory",
  },
  {
    id: "assistant",
    title: "AI assistant",
    detail: "Use the configured AI workspace when its required services are available.",
    href: "/assistant",
    label: "Open AI workspace",
  },
  {
    id: "pharmacy",
    title: "Sample pharmacy catalogue",
    detail: "Browse sample product information; ORVEXA does not sell or deliver medicines.",
    href: "/pharmacy",
    label: "Open sample catalogue",
  },
  {
    id: "diagnostics",
    title: "Sample diagnostic packages",
    detail: "Review sample package information; booking and laboratory services are not connected.",
    href: "/diagnostics",
    label: "Open sample packages",
  },
  {
    id: "about",
    title: "About ORVEXA",
    detail: "View project information and the contact details supplied for this site.",
    href: "/about",
    label: "About this project",
  },
  {
    id: "emergency",
    title: "Someone needs emergency help",
    detail: "Call 108 directly. ORVEXA cannot dispatch an ambulance or notify a hospital.",
    href: "/emergency",
    label: "Emergency information",
  },
];

const offices = [
  { id: "phone", label: "Phone availability", value: "Not independently verified" },
  { id: "email", label: "Email response time", value: "No response-time commitment is confirmed" },
  { id: "walk-in", label: "Walk-in service", value: "Not confirmed; contact before visiting" },
  { id: "emergency", label: "Emergency help", value: "Call 108 directly; ORVEXA cannot dispatch" },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Contact ORVEXA"
        description="Use the phone number or email address provided for this project. Contact availability and response times have not been independently verified. Do not use these channels for emergencies."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Contact", href: "/contact" },
        ]}
        actions={
          <>
            <Button asChild variant="gradient" size="lg">
              <a href={supportTel}>
                <PhoneCall aria-hidden />
                {siteConfig.supportPhone}
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={supportMailto}>
                <Mail aria-hidden />
                {siteConfig.supportEmail}
              </a>
            </Button>
          </>
        }
      />

      <Section id="chat" spacing="default" aria-labelledby="chat-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Contact channels"
            title={<span id="chat-heading">Phone and email</span>}
            description="These links open your device&apos;s phone or email application. ORVEXA cannot confirm that a call will be answered or an email acknowledged."
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-2">
          {supportChannels.map((channel) => {
            const isCall = channel.href.startsWith("tel:");
            const isMail = channel.href.startsWith("mailto:");
            const isEmergency = channel.id === "emergency";

            return (
              <RevealItem as="li" key={channel.id} className="h-full">
                <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                  <div className="flex items-start gap-4">
                    <span
                      aria-hidden
                      className={
                        isEmergency
                          ? "grid size-11 shrink-0 place-items-center rounded-xl bg-emergency-soft text-emergency"
                          : "grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
                      }
                    >
                      <channel.icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold">{channel.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{channel.description}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Availability:</span> {channel.meta}
                  </p>

                  <div className="mt-auto pt-2">
                    {isEmergency ? (
                      <Button asChild variant="emergency" size="sm">
                        <a href={channel.href}>{channel.actionLabel}</a>
                      </Button>
                    ) : isCall ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={channel.href}>
                          <PhoneCall aria-hidden />
                          {channel.actionLabel}
                        </a>
                      </Button>
                    ) : isMail ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={channel.href}>
                          <Mail aria-hidden />
                          {channel.actionLabel}
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </RevealItem>
            );
          })}
        </RevealGroup>

        <Reveal className="mt-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-emergency/40 bg-emergency-soft p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-emergency">
              <Siren aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">If this is a medical emergency</span>, skip every form on this page.
                Call {siteConfig.emergencyNumber} now. ORVEXA cannot dispatch an ambulance, alert a hospital or confirm
                that responders have been contacted.
              </span>
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="emergency" size="sm">
                <a href={emergencyTel}>Call {siteConfig.emergencyNumber}</a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/emergency">Open Emergency SOS</Link>
              </Button>
            </div>
          </div>
        </Reveal>

        <DemoNotice className="mt-6">
          The phone and email links use the contact details provided for this project. Contact availability has not
          been independently verified. No in-app chat or web request form is connected.
        </DemoNotice>
      </Section>

      <Section id="form" spacing="default" aria-labelledby="form-heading">
        <Reveal>
          <div className="flex flex-col gap-5 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-panel)] sm:p-8">
            <SectionHeading
              eyebrow="Online requests"
              title={<span id="form-heading">No contact form is connected</span>}
              description="This site does not send or store contact-form submissions. Use the email or phone links above instead."
            />
            <div className="flex flex-wrap gap-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Avoid sending medical records, passwords or sensitive personal information by ordinary email.
              </p>
            </div>
          </div>
        </Reveal>
      </Section>

      <Section id="offices" tone="muted" spacing="default" aria-labelledby="offices-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Provided location"
            title={<span id="offices-heading">Contact location and availability</span>}
            description="This location was supplied for project contact information. A registered office or walk-in patient service at this address has not been independently confirmed."
          />
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6">
              <address className="flex flex-col gap-4 text-sm not-italic">
                <div className="flex items-start gap-3">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">ORVEXA</p>
                    <p className="mt-1 leading-relaxed text-muted-foreground">{siteConfig.address}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <p>
                    <span className="text-muted-foreground">Email: </span>
                    <a href={supportMailto} className="font-medium text-foreground underline underline-offset-4">
                      {siteConfig.supportEmail}
                    </a>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Phone: </span>
                    <a href={supportTel} className="font-medium text-foreground underline underline-offset-4">
                      {siteConfig.supportPhone}
                    </a>
                  </p>
                </div>
              </address>

              <a
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:border-primary/45 hover:text-primary"
              >
                Open the address in Google Maps
                <ExternalLink aria-hidden className="size-3.5" />
              </a>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Do not visit without independently confirming that this address is current and accepts visitors.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6">
              <h3 className="text-base font-semibold">Availability information</h3>
              <dl className="flex flex-col gap-4">
                {offices.map((item) => (
                  <div key={item.id} className="border-b border-border pb-4 last:border-none last:pb-0">
                    <dt className="text-sm font-medium text-foreground">{item.label}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Phone and email availability are not confirmed. In an emergency, call {siteConfig.emergencyNumber}
                directly; ORVEXA does not dispatch ambulances.
              </p>
            </div>
          </Reveal>
        </div>

        <DemoNotice className="mt-6">
          Contact details and the address are shown as provided for this project. They have not been independently
          verified; no support hours, reply targets, registered-office status or walk-in services are claimed.
        </DemoNotice>
      </Section>

      <Section id="topics" spacing="default" aria-labelledby="topics-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Explore"
            title={<span id="topics-heading">Available information</span>}
            description="These links open the informational sections of the site. They do not initiate bookings, orders or support tickets."
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {commonTopics.map((topic) => (
            <RevealItem as="li" key={topic.id} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6">
                <p className="text-sm font-semibold">{topic.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{topic.detail}</p>
                <Button asChild variant="link" className="mt-auto w-fit px-0">
                  <Link href={topic.href}>
                    {topic.label}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Need to contact ORVEXA?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Use the provided phone or email details for general questions. Response times and support availability
                are not guaranteed.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <a href={supportTel}>
                  <PhoneCall aria-hidden />
                  Call ORVEXA
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/help">Search the help centre</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
