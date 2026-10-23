import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Activity, HeartPulse, Hospital, Navigation, PhoneCall, Siren, TriangleAlert } from "lucide-react";

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
    "Raise an ORVEXA emergency incident, share your location with nominated contacts, and find the nearest registered emergency department or ambulance operator. Dial 108 for a real emergency in India.",
  alternates: { canonical: "/emergency" },
};

const emergencyTel = `tel:${siteConfig.emergencyNumber}`;
const supportTel = `tel:${siteConfig.supportPhone.replace(/\s/g, "")}`;

/** DEMO DATA — crew and equipment detail inferred for each ambulance class. */
const unitDetails: Record<string, { crew: string; equipment: string[] }> = {
  als: {
    crew: "Emergency physician with an advanced paramedic",
    equipment: ["Ventilator", "Defibrillator", "Cardiac monitor", "Infusion pumps", "Advanced airway kit"],
  },
  bls: {
    crew: "Two trained paramedics",
    equipment: ["Oxygen", "Immobilisation kit", "Suction unit", "Trauma dressings", "Spinal board stretcher"],
  },
  nicu: {
    crew: "Neonatal nurse with paediatric intensivist support",
    equipment: ["Transport incubator", "Neonatal ventilator", "Pulse oximeter", "Syringe pump"],
  },
  air: {
    crew: "Flight paramedic with a critical care physician",
    equipment: ["Fixed-wing or helicopter", "ICU stretcher", "Ventilator", "Cardiac monitor"],
  },
};

const goldenHourMetrics = [
  { label: "Median dispatch-to-scene", value: "11 min" },
  { label: "Units on the network", value: "1,240" },
  { label: "Cities live", value: "18" },
];

const goldenHourFacts = [
  {
    icon: HeartPulse,
    detail: "Cardiac arrest survival falls by roughly 10% for every minute without CPR.",
  },
  {
    icon: Activity,
    detail: "Clot-busting stroke treatment works best within 4.5 hours of the first symptom.",
  },
  {
    icon: Hospital,
    detail: "A pre-alert before arrival removes the intake delay at the emergency department.",
  },
];

export default function EmergencyPage() {
  return (
    <>
      <PageHero
        eyebrow="Emergency"
        title="Raise an emergency incident, then call if nobody accepts"
        description="ORVEXA records the incident, asks the nearest registered emergency departments and ambulance operators for help, and shows you exactly who has acknowledged it. It cannot promise a vehicle — so every screen here keeps the India emergency numbers one tap away. If life is at risk, call 108 now."
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
              <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">The golden hour</p>
              <Badge variant="demo">Demo</Badge>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Outcomes for cardiac arrest, stroke and major trauma change sharply inside the first sixty minutes. These
              are the numbers a dispatcher watches on a live call.
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-3">
              {goldenHourMetrics.map((metric) => (
                <div key={metric.label} className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                  <dt className="text-[0.68rem] leading-tight text-muted-foreground">{metric.label}</dt>
                  <dd className="mt-1 text-lg font-semibold">{metric.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[0.68rem] leading-relaxed text-muted-foreground">
              Network figures above are illustrative samples, not live coverage.
            </p>
            <ul className="mt-5 space-y-2.5 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
              {goldenHourFacts.map((fact) => (
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
            title={<span id="sos-heading">Press once to review, press again to send</span>}
            description="The first press never sends anything — it opens the details for review. The second press records the incident and asks the nearest registered responders. Nothing is shared until you confirm, and you can cancel at any point."
          />
        </Reveal>
        <Reveal className="mt-8" delay={0.05}>
          <Suspense fallback={<SosLauncherFallback />}>
            <SosLauncherSlot />
          </Suspense>
        </Reveal>
        <DemoNotice className="mt-8">
          An automated request only leaves the platform when this deployment has a dispatch integration configured and
          the receiving partner has confirmed it. Until then an incident is recorded for the audit trail and shown back
          to you, and a human still has to place the call. Every number on this page dials for real, including{" "}
          {siteConfig.emergencyNumber}.
        </DemoNotice>
      </Section>

      <Section id="steps" tone="muted" spacing="default" aria-labelledby="steps-heading">
        <Reveal>
          <SectionHeading
            eyebrow="First response"
            title={<span id="steps-heading">What to do, in the order that saves time</span>}
            description="Four moves that decide how much the crew can do when they reach you. Do them in this sequence, and stay on the line with the dispatcher."
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
                  <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
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
          The sequence above is sample editorial content awaiting clinical sign-off. Always follow the instructions of
          the {siteConfig.emergencyNumber} dispatcher.
        </DemoNotice>
      </Section>

      <Section id="ambulance" spacing="default" aria-labelledby="ambulance-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Response fleet"
            title={<span id="ambulance-heading">Choose the unit the situation needs</span>}
            description="Four transport classes cover most medical emergencies in India. If you are unsure which one to ask for, call the ambulance line and the dispatcher will assign it for you."
          />
        </Reveal>

        <RevealGroup className="mt-10 grid gap-5 md:grid-cols-2">
          {ambulanceTypes.map((unit) => {
            const detail = unitDetails[unit.id];
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
                        {unit.recommended ? <Badge variant="emergency">Most requested</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Typical dispatch-to-scene {unit.eta}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{unit.description}</p>

                  <dl className="mt-5 grid gap-4 border-t border-border pt-5">
                    <div>
                      <dt className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Crew</dt>
                      <dd className="mt-1.5 text-sm">{detail.crew}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                        On board
                      </dt>
                      <dd className="mt-2 flex flex-wrap gap-2">
                        {detail.equipment.map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                          >
                            {item}
                          </span>
                        ))}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex flex-wrap gap-3 pt-6">
                    <Button asChild variant={unit.recommended ? "emergency" : "outline"} size="lg">
                      <Link href="#sos">Start an SOS request</Link>
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
          Response times and on-board equipment lists are illustrative samples. Confirm availability with the operator
          when you call.
        </DemoNotice>
      </Section>

      <Section id="capabilities" tone="navy" spacing="default" aria-labelledby="capabilities-heading">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(38rem_24rem_at_12%_0%,rgba(34,211,238,0.22),transparent_62%),radial-gradient(34rem_22rem_at_88%_100%,rgba(45,212,191,0.2),transparent_60%)]"
        />
        <div className="relative">
          <Reveal className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-teal-200 uppercase">
              What happens after you press
            </span>
            <h2
              id="capabilities-heading"
              className="mt-4 text-3xl font-semibold text-white sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]"
            >
              Six systems working through the same twelve minutes
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
              An emergency response is a coordination problem before it is a transport problem. Each of these runs in the
              background from the moment the call connects until the hospital has taken over.
            </p>
          </Reveal>

          <RevealGroup as="ul" className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {emergencyCapabilities.map((capability) => (
              <RevealItem as="li" key={capability.id} className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/12 bg-white/[0.04] p-5">
                  <span
                    aria-hidden
                    className="grid size-10 place-items-center rounded-xl bg-white/10 text-teal-200"
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
            title={<span id="checklist-heading">What to do while the ambulance is on the way</span>}
            description="Match the situation to the list below. This is general first-response guidance for India, not a diagnosis, and it never replaces the crew or the dispatcher."
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
                <Link href="/ai-assistant">Not sure if it is an emergency?</Link>
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
