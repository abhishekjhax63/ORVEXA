import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Hospital, Navigation, PhoneCall, Siren, TriangleAlert } from "lucide-react";

import { ContactCopy } from "@/components/emergency/contact-copy";
import { SosLauncherFallback, SosLauncherSlot } from "@/components/emergency/sos-launcher-slot";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ambulanceTypes,
  bystanderNumbers,
  emergencyCapabilities,
  emergencyChecklist,
  emergencyContacts,
  emergencySteps,
} from "@/data/emergency";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Emergency SOS",
  description:
    "Emergency information only. ORVEXA cannot dispatch an ambulance or notify a hospital. Call 108 directly for an emergency in India.",
  alternates: { canonical: "/emergency" },
};

const emergencyTel = `tel:${siteConfig.emergencyNumber}`;
const supportTel = `tel:${siteConfig.supportPhone.replace(/\s/g, "")}`;

const emergencyStatus = [
  { label: "Ambulance dispatch", value: "Unavailable" },
  { label: "Live tracking", value: "Unavailable" },
  { label: "Hospital pre-alert", value: "Unavailable" },
];

const emergencyNotices = [
  {
    icon: PhoneCall,
    detail: "Call 108 directly. An ORVEXA incident record is not an emergency dispatch.",
  },
  {
    icon: Hospital,
    detail: "ORVEXA cannot confirm hospital capacity or send a hospital pre-alert.",
  },
];

export default function EmergencyPage() {
  return (
    <>
      <PageHero
        eyebrow="Emergency"
        title="Call 108 directly for emergency help"
        description="ORVEXA is not an emergency service and cannot dispatch an ambulance, contact responders or pre-alert a hospital. The SOS panel may record an incident when configured, but do not wait for it to be accepted."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Emergency", href: "/emergency" },
        ]}
        actions={
          <>
            <Button asChild variant="emergency" size="lg">
              <a href={emergencyTel}>
                <Siren aria-hidden />
                Call {siteConfig.emergencyNumber} now
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#sos">
                <Navigation aria-hidden />
                Open the SOS panel
              </a>
            </Button>
          </>
        }
        aside={
          <div className="rounded-[1.75rem] border border-border bg-card/85 p-6 shadow-[var(--shadow-panel)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow text-primary">Service availability</p>
              <Badge variant="demo">Demo</Badge>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              No ambulance dispatch, live tracking or hospital notification service is connected to this deployment.
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-3">
              {emergencyStatus.map((metric) => (
                <div key={metric.label} className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                  <dt className="text-[0.68rem] leading-tight text-muted-foreground">{metric.label}</dt>
                  <dd className="mt-1 text-lg font-semibold">{metric.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[0.68rem] leading-relaxed text-muted-foreground">
              These statuses describe ORVEXA availability, not coverage from emergency responders.
            </p>
            <ul className="mt-5 space-y-2.5 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
              {emergencyNotices.map((fact) => (
                <li key={fact.detail} className="flex items-start gap-2">
                  <fact.icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emergency" />
                  {fact.detail}
                </li>
              ))}
            </ul>
          </div>
        }
      />

      <Section id="sos" spacing="default" aria-labelledby="sos-heading">
        <Reveal>
          <SectionHeading
            eyebrow="SOS panel"
            title={<span id="sos-heading">Optional incident record — not an ambulance request</span>}
            description="Submitting the SOS panel may record information in the configured application database. It does not contact emergency services, dispatch a vehicle, notify a hospital or guarantee that your contacts are alerted. Call 108 directly."
          />
        </Reveal>
        <Reveal className="mt-8" delay={0.05}>
          <Suspense fallback={<SosLauncherFallback />}>
            <SosLauncherSlot />
          </Suspense>
        </Reveal>
        <DemoNotice className="mt-8">
          This deployment is not connected to emergency dispatch. A saved incident is not sent to 108 or to an
          ambulance provider, and database availability may affect whether it can be recorded. Call{" "}
          {siteConfig.emergencyNumber} directly.
        </DemoNotice>
      </Section>

      <Section id="steps" tone="muted" spacing="default" aria-labelledby="steps-heading">
        <Reveal>
          <SectionHeading
            eyebrow="General information"
            title={<span id="steps-heading">If there is an emergency</span>}
            description="Call emergency services directly and follow the dispatcher&apos;s instructions. The items below are general information, not clinical guidance."
          />
        </Reveal>

        <RevealGroup as="ol" className="mt-10 flex flex-col gap-4">
          {emergencySteps.map((step, index) => (
            <RevealItem as="li" key={step.id}>
              <div className="flex gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
                <div className="flex flex-col items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-emergency-soft text-emergency"
                  >
                    <step.icon className="size-5" />
                  </span>
                  {index < emergencySteps.length - 1 ? (
                    <span aria-hidden className="hidden w-px flex-1 bg-border sm:block" />
                  ) : null}
                </div>
                <div className="min-w-0 pt-1">
                  <p className="eyebrow text-muted-foreground">
                    Step {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-1.5 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <DemoNotice className="mt-8">
          These general steps are not a substitute for emergency services or advice from a qualified clinician. Always
          follow the instructions of the {siteConfig.emergencyNumber} dispatcher.
        </DemoNotice>
      </Section>

      <Section id="ambulance" spacing="default" aria-labelledby="ambulance-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Illustrative information"
            title={<span id="ambulance-heading">Ambulance categories</span>}
            description="These are generic examples only. ORVEXA does not list, verify, book or provide any ambulance unit. Call 108 and follow the dispatcher&apos;s instructions."
          />
        </Reveal>

        <RevealGroup className="mt-10 grid gap-5 md:grid-cols-2">
          {ambulanceTypes.map((unit) => {
            return (
              <RevealItem key={unit.id} className="h-full">
                <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                  <div className="flex items-start gap-4">
                    <span
                      aria-hidden
                      className="grid size-11 shrink-0 place-items-center rounded-xl bg-emergency-soft text-emergency"
                    >
                      <unit.icon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">{unit.title}</h3>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Availability through ORVEXA: {unit.eta}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{unit.description}</p>

                  <div className="mt-auto flex flex-wrap gap-3 pt-6">
                    <Button asChild variant="outline" size="lg">
                      <Link href="#sos">Open incident panel (not dispatch)</Link>
                    </Button>
                    <Button asChild variant="outline" size="lg">
                      <a href={emergencyTel}>
                        <Siren aria-hidden />
                        Call {siteConfig.emergencyNumber}
                      </a>
                    </Button>
                  </div>
                </article>
              </RevealItem>
            );
          })}
        </RevealGroup>

        <DemoNotice className="mt-8">
          No units, crews, equipment, availability or response times have been verified or connected to ORVEXA.
        </DemoNotice>
      </Section>

      <Section id="capabilities" tone="navy" spacing="default" aria-labelledby="capabilities-heading">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(38rem_24rem_at_12%_0%,rgba(184,243,107,0.16),transparent_62%),radial-gradient(34rem_22rem_at_88%_100%,rgba(46,125,79,0.28),transparent_60%)]"
        />
        <div className="relative">
          <Reveal className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 eyebrow text-lime-200">
              What this prototype does not provide
            </span>
            <h2
              id="capabilities-heading"
              className="mt-4 text-3xl font-semibold text-white sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]"
            >
              No live emergency response network
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
              The items below are not connected to this application. Do not treat the SOS panel as a substitute for
              calling emergency services.
            </p>
          </Reveal>

          <RevealGroup as="ul" className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {emergencyCapabilities.map((capability) => (
              <RevealItem as="li" key={capability.id} className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/12 bg-white/[0.04] p-5">
                  <span
                    aria-hidden
                    className="grid size-10 place-items-center rounded-xl bg-white/10 text-lime-200"
                  >
                    <capability.icon className="size-5" />
                  </span>
                  <p className="text-sm font-semibold text-white">{capability.title}</p>
                  <p className="text-xs leading-relaxed text-white/70">{capability.detail}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>

          <Reveal className="mt-10 flex flex-wrap gap-3">
            <Button asChild variant="emergency" size="lg">
              <a href={emergencyTel}>
                <Siren aria-hidden />
                Call {siteConfig.emergencyNumber} now
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/15 hover:text-white"
            >
              <a href="#sos">Back to the SOS panel</a>
            </Button>
          </Reveal>

          <DemoNotice className="mt-8">
            Live tracking, hospital pre-alert and automatic contact alerting are not implemented. ORVEXA does not
            receive ambulance positions or hospital bed counts from any partner today, so nothing on this page can
            track a vehicle or confirm capacity.
          </DemoNotice>
        </div>
      </Section>

      <Section id="checklist" spacing="default" aria-labelledby="checklist-heading">
        <Reveal>
          <SectionHeading
            eyebrow="First aid"
            title={<span id="checklist-heading">General first-aid information</span>}
            description={`Call ${siteConfig.emergencyNumber} directly and follow the dispatcher's instructions. This sample guidance is not clinical advice and does not replace emergency services.`}
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-2">
          {emergencyChecklist.map((item) => (
            <RevealItem as="li" key={item.id} className="h-full">
              <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-emergency-soft text-emergency"
                  >
                    <TriangleAlert className="size-4.5" />
                  </span>
                  <h3 className="pt-1 text-base font-semibold">{item.title}</h3>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {item.points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-emergency/60" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <DemoNotice className="mt-8">
          First-aid guidance on this screen is sample content awaiting clinical sign-off. When in doubt, call{" "}
          {siteConfig.emergencyNumber} and follow the dispatcher&apos;s instructions.
        </DemoNotice>
      </Section>

      <Section id="contacts" tone="muted" spacing="default" aria-labelledby="contacts-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Helplines"
            title={<span id="contacts-heading">Numbers that answer, day or night</span>}
            description="National helplines, the emergency-ready hospitals nearest to each metro and the ORVEXA care desk. Every number below is a working telephone link."
            actions={<ContactCopy label="Copy all numbers" />}
          />
        </Reveal>

        <RevealGroup as="ul" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {bystanderNumbers.map((entry) => (
            <RevealItem as="li" key={entry.id} className="h-full">
              <a
                href={`tel:${entry.number}`}
                className="flex h-full flex-col gap-1.5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-colors hover:border-emergency/40 hover:bg-emergency-soft"
              >
                <span className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  {entry.label}
                </span>
                <span className="text-2xl font-semibold text-emergency">{entry.number}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{entry.detail}</span>
              </a>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal className="mt-6" delay={0.05}>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Emergency-ready hospitals on the ORVEXA network with department, city, distance and emergency bed count
              </caption>
              <thead>
                <tr className="border-b border-border text-xs tracking-[0.1em] text-muted-foreground uppercase">
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    Facility
                  </th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    Department
                  </th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    City
                  </th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    Distance
                  </th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    Emergency beds
                  </th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    Emergency desk
                  </th>
                </tr>
              </thead>
              <tbody>
                {emergencyContacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-5 py-4 font-normal">
                      <span className="block font-semibold">{contact.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{contact.traumaLevel}</span>
                    </th>
                    <td className="px-5 py-4 text-muted-foreground">{contact.department}</td>
                    <td className="px-5 py-4 text-muted-foreground">{contact.city}</td>
                    <td className="px-5 py-4 text-muted-foreground">{contact.distanceKm} km</td>
                    <td className="px-5 py-4 text-muted-foreground">{contact.bedsAvailable}</td>
                    <td className="px-5 py-4">
                      <a
                        href={`tel:${contact.phone.replace(/\s/g, "")}`}
                        className="font-medium text-emergency underline-offset-4 hover:underline"
                      >
                        {contact.phone}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <DemoNotice className="mt-8">
          Hospital names, distances and available emergency beds are illustrative samples. Call the hospital directly to
          confirm capacity before travelling.
        </DemoNotice>
      </Section>

      <Section spacing="default">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">Once the emergency is stable, the rest still matters</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Emergency care is one moment in a longer story. ORVEXA keeps the discharge summary, the follow-up
                consultation and the insurance claim connected to the same record.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/hospitals">Find the nearest emergency-ready hospital</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/assistant">Not sure what care to seek? Open the AI workspace</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href={supportTel}>
                  <PhoneCall aria-hidden />
                  {siteConfig.supportPhone}
                </a>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
