import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUp } from "lucide-react";

import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How ORVEXA handles health data: what this Phase 1 build does and does not collect, the purposes and legal basis under India's Digital Personal Data Protection Act 2023, consent and withdrawal, sharing with providers, retention, security, children's data and your rights.",
  alternates: { canonical: "/privacy" },
};

/** Static by design: reading the clock during render breaks Cache Components. */
const lastUpdated = "12 October 2026";

const toc = [
  { id: "overview", title: "Overview and scope" },
  { id: "phase-1-data", title: "What this Phase 1 build collects" },
  { id: "later-phases", title: "What later phases will collect" },
  { id: "purpose-and-basis", title: "Purpose and legal basis" },
  { id: "consent", title: "Consent, notices and withdrawal" },
  { id: "sharing", title: "When we share data" },
  { id: "retention", title: "How long we keep data" },
  { id: "security", title: "How we protect data" },
  { id: "children", title: "Children's data" },
  { id: "rights", title: "Your rights" },
  { id: "grievance", title: "Grievance officer and contact" },
  { id: "changes", title: "Changes to this policy" },
];

const retention = [
  {
    id: "retention-account",
    label: "Account and profile data",
    value: "Kept while the account is active, then erased within 30 days of a verified deletion request.",
  },
  {
    id: "retention-records",
    label: "Health records you upload",
    value:
      "Kept while the account is active. After deletion, only what medical record-keeping rules require us to retain is kept, in a restricted archive.",
  },
  {
    id: "retention-support",
    label: "Support and request history",
    value: "Kept for 24 months from the date the request is closed, to handle repeat issues and quality review.",
  },
  {
    id: "retention-consent",
    label: "Consent and access logs",
    value:
      "Kept for as long as we must be able to show who accessed a record and on what authority, and for the limitation period for legal claims.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        eyebrow="Privacy policy"
        title="How ORVEXA handles your health data"
        description="This policy explains what we collect, why we are allowed to collect it under India's Digital Personal Data Protection Act 2023, how long we keep it and how you stay in control of your records."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Privacy", href: "/privacy" },
        ]}
      />

      <Section spacing="default">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-14">
          <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">On this page</p>
            <ol className="mt-4 flex flex-col gap-2.5 border-l border-border pl-4 text-sm">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-muted-foreground transition-colors hover:text-primary">
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">Last updated {lastUpdated}</p>
          </nav>

          <div className="flex flex-col gap-10">
            <DemoNotice>
              This policy is a Phase 1 template written for review. It must be checked and approved by qualified Indian
              legal counsel and a data protection officer before launch, and it is not legal advice. Send comments to{" "}
              {siteConfig.supportEmail}.
            </DemoNotice>

            <section id="overview" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Overview and scope</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {siteConfig.legalName} (&ldquo;ORVEXA&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the ORVEXA
                platform, which includes this website, the patient application and the tools offered to hospitals,
                clinics, laboratories, pharmacies and home-care partners. For the data described in this policy, ORVEXA
                acts as the data fiduciary under the Digital Personal Data Protection Act 2023 (the &ldquo;DPDP
                Act&rdquo;).
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                The policy applies to the marketing website, patient accounts, provider onboarding, orders and support
                interactions. It does not govern the clinical record-keeping of the hospitals, clinics, laboratories
                and pharmacies on our network. Those organisations are independent data fiduciaries for the care they
                deliver, including when they use ORVEXA to coordinate it.
              </p>
              <h3 className="mt-6 text-base font-semibold">What this policy does not cover</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>The clinical decisions or records of an independent provider you consult.</li>
                <li>
                  The insurance workflow once a policy is issued — the insurer and its third-party administrator apply
                  their own privacy notices.
                </li>
                <li>Third-party websites reached through external links from ORVEXA.</li>
              </ul>
            </section>

            <section id="phase-1-data" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">What this Phase 1 build collects</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                This website is a review build. The forms on it — contact, appointment requests, provider applications
                and pharmacist questions — validate your input in your browser and then show a confirmation state. They
                do not transmit your input to ORVEXA, store it on a server or share it with anyone. If you close the
                page, that data is gone.
              </p>
              <h3 className="mt-6 text-base font-semibold">What is processed when you browse this site</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  Standard server and content-delivery logs, which may include your IP address, user agent, requested
                  URL and timestamp. These are generated by our hosting and delivery providers, kept for a short period
                  for security and troubleshooting, and are not used to build a profile of you.
                </li>
                <li>
                  A theme preference (light or dark) stored in your browser&apos;s local storage so the site renders the
                  way you chose. It stays on your device.
                </li>
                <li>
                  This build does not set advertising cookies, third-party analytics trackers or social media pixels,
                  and does not sell or share personal data for advertising.
                </li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Because no account exists in this phase, there is nothing to erase on our side beyond the logs described
                above. When accounts open, the sections below set out the full position.
              </p>
            </section>

            <section id="later-phases" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">What later phases will collect</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                When patient accounts and provider workflows go live, we will collect the following categories. Each
                category will have its own consent notice before collection begins.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Identity and contact data:</span> name, mobile number,
                  email address, date of birth, city, and the family members you add to your account.
                </li>
                <li>
                  <span className="font-medium text-foreground">Health data:</span> consultation notes, prescriptions,
                  laboratory and imaging reports, discharge summaries, vaccination history, vitals and appointment
                  history. This is sensitive personal data under the DPDP Act.
                </li>
                <li>
                  <span className="font-medium text-foreground">Identifiers you choose to link:</span> an ABHA address or
                  health ID, where you link it to make records portable.
                </li>
                <li>
                  <span className="font-medium text-foreground">Transaction data:</span> order references, invoices and
                  the last four digits of a payment instrument. Full card details are handled by a payment gateway and
                  never stored on ORVEXA systems.
                </li>
                <li>
                  <span className="font-medium text-foreground">Support data:</span> the content of requests, calls,
                  chats and complaints, including attachments you send.
                </li>
                <li>
                  <span className="font-medium text-foreground">Device and usage data:</span> device type, operating
                  system, application version, crash reports and, where you allow it, approximate location used to find
                  nearby providers and to dispatch an ambulance.
                </li>
                <li>
                  <span className="font-medium text-foreground">Provider data:</span> for facility and clinician
                  partners, registration numbers, accreditations, tariff details and the contact details of staff who
                  use the provider console.
                </li>
              </ul>
            </section>

            <section id="purpose-and-basis" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Purpose and legal basis</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Under the DPDP Act, we process personal data either on the basis of your consent or for a legitimate use
                permitted by the Act. We rely on your consent for everything optional, and we tell you the purpose
                before we ask for it.
              </p>
              <h3 className="mt-6 text-base font-semibold">Why we process your data</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>To create and secure your account, verify your identity and prevent misuse.</li>
                <li>
                  To coordinate the care you ask for: appointments, teleconsultations, diagnostic collection, pharmacy
                  orders and facility transfers.
                </li>
                <li>To maintain your health record so it can be shared with the clinicians you choose.</li>
                <li>To prepare, submit and track insurance pre-authorisation and reimbursement paperwork at your request.</li>
                <li>To answer your questions, handle complaints and process refunds.</li>
                <li>To meet legal, tax, medical record-keeping and regulatory obligations.</li>
                <li>
                  To send service messages about your bookings and orders. Marketing messages are separate and only with
                  your consent.
                </li>
                <li>To keep the platform secure, debug failures and improve reliability.</li>
              </ul>
              <h3 className="mt-6 text-base font-semibold">Legal basis</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Consent:</span> the primary basis for account data,
                  health data, location, marketing and any optional feature. You give it through a specific notice, and
                  you can withdraw it.
                </li>
                <li>
                  <span className="font-medium text-foreground">Certain legitimate uses:</span> including responding to a
                  medical emergency, complying with a court order or statutory obligation, and disclosing information to
                  a public health authority acting under law. These do not depend on consent.
                </li>
                <li>
                  <span className="font-medium text-foreground">Vital interest:</span> where someone&apos;s life is at
                  risk — for example, during an ambulance dispatch — we may share the minimum necessary information with
                  the responding team without waiting for consent.
                </li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                We do not use your health data to train public machine-learning models, and we do not sell personal data.
                Where the AI assistant is used, it operates on the information available within your account and its
                output is labelled as informational guidance, not a diagnosis.
              </p>
            </section>

            <section id="consent" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Consent, notices and withdrawal</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  Before we collect anything, we give you a notice in clear language describing the data, the purpose
                  and how to exercise your rights, with a link to this policy.
                </li>
                <li>
                  Consent for optional purposes is taken separately. Accepting service messages never means agreeing to
                  marketing.
                </li>
                <li>
                  Your consent history is recorded in your account, including the version of the notice you saw, so you
                  can see exactly what you agreed to and when.
                </li>
                <li>
                  You can withdraw consent at any time from your account settings or by writing to{" "}
                  {siteConfig.supportEmail}. Withdrawal is prospective: it stops future processing, and does not undo
                  processing that was lawful when it happened.
                </li>
                <li>
                  Some services cannot run without the relevant data. Withdrawing consent for health data, for example,
                  means we can no longer coordinate care or maintain your record, so the account may have to be closed.
                  We will tell you when that is the consequence.
                </li>
              </ul>
            </section>

            <section id="sharing" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">When we share data</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Health records are shared narrowly, purpose by purpose. In practice, data leaves ORVEXA in these
                situations only.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">The providers you choose:</span> the hospital, doctor,
                  laboratory, pharmacy or home-care agency involved in your request receives what that request needs —
                  not your whole record. Anything broader requires a share you initiate from your timeline.
                </li>
                <li>
                  <span className="font-medium text-foreground">Service providers acting for us:</span> hosting,
                  communications, payment gateway, logistics and support tools, each under a contract that limits
                  processing to our instructions.
                </li>
                <li>
                  <span className="font-medium text-foreground">Insurers and TPAs:</span> only when you ask us to file,
                  track or challenge a claim, and only the documents that workflow requires.
                </li>
                <li>
                  <span className="font-medium text-foreground">Emergency response:</span> the minimum information
                  needed by an ambulance crew or receiving hospital in a medical emergency.
                </li>
                <li>
                  <span className="font-medium text-foreground">Legal and regulatory disclosures:</span> where required
                  by law, a court order or a lawful request from a public authority.
                </li>
                <li>
                  <span className="font-medium text-foreground">A change of ownership:</span> if the business is
                  restructured or acquired, data may transfer as part of it, with this policy continuing to apply until
                  a new notice is issued to you.
                </li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                We do not sell personal data, we do not share health records with advertisers or data brokers, and we do
                not disclose a diagnosis to your employer, insurer or anyone else on their request.
              </p>
            </section>

            <section id="retention" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">How long we keep data</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                We keep personal data only for as long as the purpose requires. Where a law imposes a longer minimum, the
                longer period applies.
              </p>
              <dl className="mt-4 flex flex-col gap-4">
                {retention.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-card p-5">
                    <dt className="text-sm font-semibold">{item.label}</dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                The retention periods above are Phase 1 planning values, subject to the record-keeping periods that
                medical, tax and insurance regulations require. When a period ends, data is deleted or irreversibly
                anonymised.
              </p>
            </section>

            <section id="security" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">How we protect data</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>Encryption in transit and encryption at rest for stored health records.</li>
                <li>
                  Access limited to staff and systems that need it for a specific task, with role-based permissions and
                  an audit trail for record access.
                </li>
                <li>
                  Sharing through time-bound, revocable links, so access a doctor no longer needs can be withdrawn
                  rather than trusted to expire quietly.
                </li>
                <li>Monitoring for unusual access patterns, and an incident response process with defined escalation.</li>
                <li>Security and data-protection review before a new vendor is given access to patient data.</li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                No platform can promise that a breach will never happen. If a personal data breach occurs, we will
                notify you and the Data Protection Board of India in the manner and within the timelines the DPDP Act
                requires, and we will tell you what we know, what we have done and what you should do.
              </p>
            </section>

            <section id="children" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Children&apos;s data</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                The DPDP Act treats anyone under 18 as a child and requires verifiable parental consent before their
                personal data is processed. This website does not knowingly collect data from children.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  In later phases, a child&apos;s health record can only be created inside a parent or lawful
                  guardian&apos;s account, after verifiable parental consent.
                </li>
                <li>
                  We will not track or behaviourally monitor children, and we will not show behavioural advertising or
                  targeted advertising to children.
                </li>
                <li>
                  A paediatric record created by a parent is released to the young person when they reach the age of
                  majority, through a process that does not lock them out of their own clinical history.
                </li>
              </ul>
            </section>

            <section id="rights" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Your rights</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                You can exercise the following rights by writing to us at {siteConfig.supportEmail}. We will verify your
                identity first, and will not charge you for a reasonable request.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Access:</span> a summary of the personal data we hold
                  about you, the processing we carry out, and the identities of those with whom we have shared it.
                </li>
                <li>
                  <span className="font-medium text-foreground">Correction and completion:</span> update inaccurate or
                  incomplete data.
                </li>
                <li>
                  <span className="font-medium text-foreground">Erasure:</span> ask us to delete data we no longer need,
                  subject to retention obligations.
                </li>
                <li>
                  <span className="font-medium text-foreground">Withdrawal of consent:</span> at any time, as described
                  above.
                </li>
                <li>
                  <span className="font-medium text-foreground">Grievance redressal:</span> a right to a timely response
                  to a complaint about how we handle your data.
                </li>
                <li>
                  <span className="font-medium text-foreground">Nomination:</span> name another person who may exercise
                  these rights on your behalf in the event of your death or incapacity.
                </li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                If you are not satisfied with our response, you may complain to the Data Protection Board of India under
                the DPDP Act.
              </p>
            </section>

            <section id="grievance" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Grievance officer and contact</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Questions, requests and complaints about privacy are handled by our data protection function. Write to{" "}
                <a href={`mailto:${siteConfig.supportEmail}`} className="font-medium text-primary underline underline-offset-4">
                  {siteConfig.supportEmail}
                </a>{" "}
                with the word Privacy in the subject line, including your account identifier if you have one.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>Requests are acknowledged, and a response target of 30 days applies to rights requests.</li>
                <li>
                  The name and contact details of the designated data protection officer will be published here before
                  accounts open, as the DPDP Act requires.
                </li>
                <li>
                  Postal correspondence: {siteConfig.legalName}, {siteConfig.address}.
                </li>
              </ul>
            </section>

            <section id="changes" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Changes to this policy</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                We will version this policy and publish the date of the latest change at the top of the page. Material
                changes — a new purpose, a new category of recipient, a different retention period — will be notified to
                account holders before they take effect, and, where the change depends on consent, we will ask for it
                again rather than assume it.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                This policy is governed by the laws of India. See also the{" "}
                <Link href="/terms" className="font-medium text-primary underline underline-offset-4">
                  terms of service
                </Link>{" "}
                and, for questions about a specific record,{" "}
                <Link href="/contact" className="font-medium text-primary underline underline-offset-4">
                  contact the care desk
                </Link>
                .
              </p>
            </section>

            <div className="max-w-3xl border-t border-border pt-6">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {siteConfig.legalName} · Last updated {lastUpdated} ·{" "}
                <Link href="/terms" className="underline underline-offset-4">
                  Terms of service
                </Link>{" "}
                ·{" "}
                <Link href="/contact" className="underline underline-offset-4">
                  Contact
                </Link>
              </p>
              <a
                href="#main"
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:border-primary/45 hover:text-primary"
              >
                <ArrowUp aria-hidden className="size-3.5" />
                Back to top
              </a>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
