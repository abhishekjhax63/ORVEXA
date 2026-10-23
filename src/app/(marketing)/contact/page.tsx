import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink, LifeBuoy, Mail, MapPin, PhoneCall, Siren } from "lucide-react";

import { RequestDialog, type RequestField } from "@/components/forms/request-dialog";
import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { contactTopics, supportChannels } from "@/data/support";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Reach the ORVEXA care desk by phone, email or a written request. Support hours, escalation routes, the registered office address and answers to the most common questions before you write to us.",
  alternates: { canonical: "/contact" },
};

const supportTel = `tel:${siteConfig.supportPhone.replace(/\s/g, "")}`;
const emergencyTel = `tel:${siteConfig.emergencyNumber}`;
const supportMailto = `mailto:${siteConfig.supportEmail}`;
const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(siteConfig.address)}`;

/** Reasons patients and provider partners write to us, with the fastest self-serve route. */
const commonTopics = [
  {
    id: "appointment",
    title: "Change or cancel an appointment",
    detail: "Rescheduling and cancellation rules, plus what happens if a video consultation drops.",
    href: "/help",
    label: "Appointment answers",
  },
  {
    id: "pharmacy",
    title: "A MediCare order is late or short",
    detail: "Delivery windows, pin code coverage and how a missing item is replaced.",
    href: "/pharmacy",
    label: "Pharmacy help",
  },
  {
    id: "insurance",
    title: "A cashless approval or claim is stuck",
    detail: "What the claims desk needs from you, and who to escalate to when it stalls.",
    href: "/insurance",
    label: "Insurance and claims",
  },
  {
    id: "records",
    title: "Share records with a doctor outside ORVEXA",
    detail: "Create a time-bound, revocable link from your own record timeline.",
    href: "/dashboard/records",
    label: "Open health records",
  },
  {
    id: "provider",
    title: "List a hospital, clinic or lab",
    detail: "Credentialing requirements, tariff bands and integration options for providers.",
    href: "/about#providers",
    label: "Provider onboarding",
  },
  {
    id: "emergency",
    title: "Someone needs urgent medical help",
    detail: "Do not wait for a reply on this page. Ambulance dispatch and trauma coordination are a separate line.",
    href: "/emergency",
    label: "Emergency SOS",
  },
];

const contactFields: RequestField[] = [
  {
    name: "fullName",
    label: "Full name",
    type: "text",
    placeholder: "As it appears on your ORVEXA account, if you have one",
    required: true,
    autoComplete: "name",
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    placeholder: "you@example.com",
    required: true,
    autoComplete: "email",
  },
  {
    name: "phone",
    label: "Phone",
    type: "tel",
    placeholder: "+91 98450 12093",
    required: true,
    autoComplete: "tel",
    description: "Used only for this enquiry, and only if you ask us to call.",
  },
  {
    name: "topic",
    label: "Topic",
    type: "select",
    options: contactTopics.map((topic) => topic.label),
    defaultValue: contactTopics[0].label,
    description: "Routes your request to the team that can act on it fastest.",
  },
  {
    name: "preferredMethod",
    label: "Preferred contact method",
    type: "select",
    options: ["Email", "Phone call", "WhatsApp"],
    defaultValue: "Email",
  },
  {
    name: "message",
    label: "Message",
    type: "textarea",
    placeholder: "Tell us what has happened, any reference or order number, and what you would like us to do.",
    required: true,
    description: "Please do not include clinical details you would not want stored, such as test results.",
  },
  {
    name: "consent",
    label: "Consent to be contacted",
    type: "select",
    options: ["Yes, I consent to ORVEXA contacting me", "No"],
    defaultValue: "Yes, I consent to ORVEXA contacting me",
    description: "You can withdraw consent at any time by writing to the care desk email address.",
  },
];

const chatRequestFields: RequestField[] = [
  {
    name: "fullName",
    label: "Full name",
    type: "text",
    placeholder: "Your name",
    required: true,
    autoComplete: "name",
  },
  {
    name: "phone",
    label: "Phone",
    type: "tel",
    placeholder: "+91 98450 12093",
    required: true,
    autoComplete: "tel",
  },
  {
    name: "topic",
    label: "Topic",
    type: "select",
    options: contactTopics.map((topic) => topic.label),
    defaultValue: contactTopics[0].label,
  },
  {
    name: "question",
    label: "What do you need help with?",
    type: "textarea",
    placeholder: "A short description and any reference number",
    required: true,
  },
];

const offices = [
  { id: "hours-phone", label: "Care desk phone", value: "Answered 24×7, every day of the year" },
  { id: "hours-email", label: "Email support", value: "Acknowledged within 8 working hours" },
  { id: "hours-chat", label: "Written requests", value: "Queued to a coordinator during 07:00–23:00 IST" },
  { id: "hours-emergency", label: "Emergency line", value: "Immediate dispatch, no queue" },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Talk to someone who can actually act on it"
        description="The ORVEXA care desk is staffed by coordinators with access to bookings, orders and claims — not a script. Choose the channel that suits you, or send a written request and we will route it to the team that owns the problem."
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
            eyebrow="Support channels"
            title={<span id="chat-heading">Four ways to reach the care desk</span>}
            description="Phone and email are live channels today. Written requests and the in-app chat inbox are handled by the same coordinators, so nothing is lost between them."
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
                    ) : (
                      <div className="flex flex-col items-start gap-2">
                        <RequestDialog
                          triggerLabel="Start a request"
                          triggerVariant="gradient"
                          triggerSize="sm"
                          title="Start a care desk request"
                          description="Live chat is not switched on in this phase. A coordinator would pick this up by email or phone using the details you give here."
                          fields={chatRequestFields}
                          submitLabel="Send to the care desk"
                          successTitle="Request ready for the care desk"
                          successBody="In production, a coordinator would receive this with your account context attached and reply on your preferred channel."
                          footnote="Phase 1 has no support backend and no live chat. This form validates your details and shows the confirmation state; nothing is transmitted."
                        />
                        <p className="text-xs text-muted-foreground">
                          Live chat opens in Phase 2. Until then, requests are answered by email or phone.
                        </p>
                      </div>
                    )}
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
                Call {siteConfig.emergencyNumber} now, or open Emergency SOS to dispatch the nearest advanced
                life-support ambulance.
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
          Response-time targets shown against each channel are Phase 1 planning figures. In-app chat is not live yet;
          phone, email and this web form are the working routes today.
        </DemoNotice>
      </Section>

      <Section id="form" spacing="default" aria-labelledby="form-heading">
        <Reveal>
          <div className="grid gap-8 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-panel)] sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div>
              <SectionHeading
                eyebrow="Written request"
                title={<span id="form-heading">Send us the details, once</span>}
                description="Give us the reference number and the outcome you need. A coordinator routes it to the team that owns that workflow, so you are not asked to repeat yourself on every call."
              />
              <ol className="mt-8 flex flex-col gap-4">
                {[
                  {
                    id: "step-1",
                    title: "Tell us what happened",
                    detail:
                      "Topic, reference number and a short description. The more specific the reference, the faster the lookup.",
                  },
                  {
                    id: "step-2",
                    title: "We route it to the right desk",
                    detail:
                      "Appointments, pharmacy, diagnostics and claims each have a named owner inside the care desk.",
                  },
                  {
                    id: "step-3",
                    title: "You get one reply thread",
                    detail:
                      "A single thread on your chosen channel, kept open until the problem is closed rather than re-raised.",
                  },
                ].map((step, index) => (
                  <li key={step.id} className="flex gap-4">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-xs font-semibold text-primary"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col justify-center gap-5 rounded-2xl border border-dashed border-border bg-muted/40 p-6">
              <div className="flex items-center gap-3">
                <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-card text-primary">
                  <LifeBuoy className="size-5" />
                </span>
                <div>
                  <p className="text-base font-semibold">Contact form</p>
                  <p className="text-xs text-muted-foreground">
                    Seven fields, about two minutes. Nothing is sent until you confirm.
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Prefer to write directly? Email{" "}
                <a href={supportMailto} className="font-medium text-primary underline underline-offset-4">
                  {siteConfig.supportEmail}
                </a>{" "}
                or call{" "}
                <a href={supportTel} className="font-medium text-primary underline underline-offset-4">
                  {siteConfig.supportPhone}
                </a>
                .
              </p>
              <RequestDialog
                triggerLabel="Open the contact form"
                triggerVariant="gradient"
                triggerSize="lg"
                title="Contact the ORVEXA care desk"
                description="Share your details and the issue. In production this reaches the coordinator team with your account context attached."
                fields={contactFields}
                submitLabel="Send request"
                successTitle="Request ready to send"
                successBody="In production, the care desk would acknowledge this within 8 working hours on your preferred channel and open a single thread until it is resolved."
                footnote="Phase 1 has no contact backend. This form validates your details and shows the confirmation state, but nothing is transmitted or stored. For a response today, use the phone or email links above."
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Do not send prescriptions, reports or policy documents through this form. Share those through your
                ORVEXA records so access stays logged and revocable.
              </p>
            </div>
          </div>
        </Reveal>
      </Section>

      <Section id="offices" tone="muted" spacing="default" aria-labelledby="offices-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Where we are"
            title={<span id="offices-heading">Registered office and support hours</span>}
            description="ORVEXA operates as a distributed team with a single registered address for formal correspondence, notices and grievances."
          />
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6">
              <address className="flex flex-col gap-4 text-sm not-italic">
                <div className="flex items-start gap-3">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">{siteConfig.legalName}</p>
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
                Please book an appointment before visiting; the Bengaluru office is not a walk-in patient service
                centre. Corporate registration details (CIN, GSTIN) and the named grievance officer will be published at
                launch.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6">
              <h3 className="text-base font-semibold">Support hours</h3>
              <dl className="flex flex-col gap-4">
                {offices.map((item) => (
                  <div key={item.id} className="border-b border-border pb-4 last:border-none last:pb-0">
                    <dt className="text-sm font-medium text-foreground">{item.label}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Statutory holidays affect email throughput but not the 24×7 care desk phone line or ambulance dispatch.
              </p>
            </div>
          </Reveal>
        </div>

        <DemoNotice className="mt-6">
          Support hours and reply targets are Phase 1 operating plans for review. The registered address is the
          company&apos;s real correspondence address.
        </DemoNotice>
      </Section>

      <Section id="topics" spacing="default" aria-labelledby="topics-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Before you write"
            title={<span id="topics-heading">Six requests we can answer instantly</span>}
            description="Most enquiries are solved faster by the right page than by a ticket. These are the routes the care desk would send you to anyway."
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
              <h2 className="text-2xl font-semibold sm:text-3xl">Not sure whether to call or write?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Call for anything time-critical — an order in transit, a slot today, a claim at a hospital counter.
                Write for documentation, formal complaints or provider onboarding.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <a href={supportTel}>
                  <PhoneCall aria-hidden />
                  Call the care desk
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
