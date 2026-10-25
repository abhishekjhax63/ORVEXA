import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUp } from "lucide-react";

import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms draft",
  description:
    "Draft terms for review. The legal entity, offered services and legal terms have not been verified or approved for this deployment.",
  alternates: { canonical: "/terms" },
};

/** Static by design: reading the clock during render breaks Cache Components. */
const lastUpdated = "Draft; date not verified";

const toc = [
  { id: "acceptance", title: "Acceptance of these terms" },
  { id: "phase-1-demo", title: "Phase 1 demo forms and no booking" },
  { id: "our-role", title: "Our role on the platform" },
  { id: "user-obligations", title: "Your obligations" },
  { id: "prescriptions-pharmacy", title: "Prescriptions and pharmacy rules" },
  { id: "payments-refunds", title: "Payments, fees and refunds" },
  { id: "intellectual-property", title: "Intellectual property" },
  { id: "liability", title: "Limitation of liability" },
  { id: "governing-law", title: "Governing law and jurisdiction" },
  { id: "changes", title: "Changes to these terms" },
  { id: "contact", title: "Contact" },
];

export default function TermsPage() {
  return (
    <>
      <PageHero
        eyebrow="Draft terms"
        title="Terms are not finalized"
        description="This unapproved draft is not a binding service agreement or legal advice. The legal entity and service terms have not been verified for this deployment."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Terms", href: "/terms" },
        ]}
      />

      <Section spacing="default">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-14">
          <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow text-primary">On this page</p>
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
              These draft terms have not been reviewed by qualified legal counsel. The legal identity, jurisdiction,
              service commitments and consumer-protection obligations require verification before publication. Do not
              rely on this page as an active contract.
            </DemoNotice>

            <section id="acceptance" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Acceptance of these terms</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                ORVEXA is the project name used on this website. This draft does not identify a verified legal entity
                and does not establish a binding agreement or service relationship.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>                The terms and service commitments shown below are unverified draft examples.</li>
                <li>
                  If you use the platform for a family member or another person, you confirm you are authorised to act
                  for them and that they have been told.
                </li>
                <li>
                  Provider onboarding and provider agreements are not available through this deployment.
                </li>
                <li>
                  Our{" "}
                  <Link href="/privacy" className="font-medium text-primary underline underline-offset-4">
                    privacy policy
                  </Link>{" "}
                  forms part of these terms.
                </li>
              </ul>
            </section>

            <section id="phase-1-demo" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Phase 1 demo forms and no booking</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                This build is a review release. Any remaining preview forms validate input locally only; they do not
                transmit information or create a booking, order, application, claim, or support ticket. Do not enter
                real personal, medical, facility or policy information.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>Do not rely on this build to arrange care, medicine, transport or a claim.</li>
                <li>
                  Provider names, prices, ratings, delivery windows and response times shown on the platform are
                  illustrative samples, not offers or commitments.
                </li>
                <li>
                  For anything real and urgent, use the care desk phone number{" "}
                  <a
                    href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    {siteConfig.supportPhone}
                  </a>{" "}
                  or, for a medical emergency, call{" "}
                  <a
                    href={`tel:${siteConfig.emergencyNumber}`}
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    {siteConfig.emergencyNumber}
                  </a>
                  .
                </li>
              </ul>
            </section>

            <section id="our-role" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Our role on the platform</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                ORVEXA is a facilitator and technology provider. We help you find providers, hold your records, and
                coordinate the administrative work around your care. We are not a hospital, clinic, laboratory,
                pharmacy, ambulance operator, insurer, broker or third-party administrator, and we do not practise
                medicine.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Clinical responsibility:</span> all clinical judgement,
                  diagnosis, treatment, prescription and procedure is the responsibility of the registered professional
                  or licensed facility you choose. The agreement for that care is between you and them.
                </li>
                <li>
                  <span className="font-medium text-foreground">Insurance:</span> cover, exclusions, approvals and
                  settlement rest with the insurer and its third-party administrator. We prepare and track paperwork on
                  your request, but we do not decide a claim.
                </li>
                <li>
                  <span className="font-medium text-foreground">Health information:</span> the AI assistant, help centre
                  and health content are informational. They do not diagnose, prescribe, or replace a consultation, and
                  they should not be used to delay seeking care.
                </li>
                <li>
                  <span className="font-medium text-foreground">Availability:</span> the platform may be unavailable
                  during maintenance, upgrades or events outside our control. Emergency services do not depend on this
                  website.
                </li>
              </ul>
            </section>

            <section id="user-obligations" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Your obligations</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                To keep the platform safe for everyone, you agree to the following.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>Give accurate information about yourself and the person receiving care, and keep it current.</li>
                <li>Keep your account credentials confidential, and tell us promptly about unauthorised access.</li>
                <li>
                  Use the platform only for lawful purposes, and do not misuse another person&apos;s records, attempt to
                  access accounts that are not yours, or probe our systems for vulnerabilities without written
                  permission.
                </li>
                <li>
                  Do not submit a prescription, document or image that is forged, altered, obtained unlawfully, or bears
                  another person&apos;s identity.
                </li>
                <li>Do not use the platform to harass a provider, coordinate an unlawful medicine purchase, or resell medicines.</li>
                <li>
                  If you are a provider partner, use the platform only within the scope of your registration and
                  licences, and keep your listing information accurate.
                </li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                We may suspend or close an account that breaches these obligations, or that we reasonably believe creates
                a safety or legal risk.
              </p>
            </section>

            <section id="prescriptions-pharmacy" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Prescriptions and pharmacy rules</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  Medicines in Schedule H and Schedule H1, and all other prescription-only medicines, are dispensed only
                  against a valid prescription issued by a registered medical practitioner. A licensed pharmacist
                  verifies every such order before dispatch.
                </li>
                <li>
                  You are responsible for the prescription you upload being genuine, current and issued to the person who
                  will take the medicine.
                </li>
                <li>
                  Schedule H1 supply is recorded in the statutory register, and the prescription is retained for the
                  period the rules require.
                </li>
                <li>
                  Correctly supplied medicines cannot be returned once delivered, because their storage cannot be
                  verified. Damaged, expired, short-supplied or wrongly dispensed items are replaced or refunded in full.
                </li>
                <li>
                  Cold-chain items are dispatched in validated packaging with a temperature log. Do not use a medicine if
                  the log shows an excursion; contact the pharmacy desk for a replacement.
                </li>
                <li>Medicine availability, delivery windows and pin code coverage shown on the platform are illustrative in this phase.</li>
              </ul>
            </section>

            <section id="payments-refunds" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Payments, fees and refunds</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Payments are not implemented in this phase. No part of this build takes a payment, issues an invoice or
                creates a financial obligation between you and ORVEXA.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  When payments go live, prices for a provider&apos;s service will be quoted by that provider, and ORVEXA
                  may charge a separate platform or convenience fee, disclosed before you confirm.
                </li>
                <li>
                  Refunds will follow the relevant provider&apos;s or pharmacy&apos;s published policy, with statutory
                  consumer rights prevailing where they are more favourable to you.
                </li>
                <li>
                  Fees shown anywhere on this build are sample values used for interface review, and are not offers,
                  quotes or guarantees.
                </li>
                <li>
                  Cancellation and rescheduling rules described in the help centre reflect the intended policy and will be
                  finalised, and shown at the point of booking, when bookings become live.
                </li>
              </ul>
            </section>

            <section id="intellectual-property" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Intellectual property</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  The ORVEXA name, logo, interface design, software, written content and datasets are owned by ORVEXA or
                  licensed to it, and are protected by Indian and international intellectual property law.
                </li>
                <li>
                  You may use the platform for personal, non-commercial purposes. You may not copy, scrape, resell,
                  reverse-engineer or build a competing dataset from it without written permission.
                </li>
                <li>
                  Your health records and the documents you upload remain yours. You grant us a limited licence to store,
                  process, transmit and display them for the purposes described in the privacy policy, and only for as
                  long as needed.
                </li>
                <li>
                  Provider partners retain ownership of their own names, marks and clinical content, and grant us a
                  licence to display listing information to patients.
                </li>
                <li>
                  Feedback you send us may be used to improve the platform without obligation to you. Please do not send
                  us information you consider confidential.
                </li>
              </ul>
            </section>

            <section id="liability" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Limitation of liability</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                To the maximum extent permitted by law, and subject to the paragraph below, the platform is provided on an
                &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We do not warrant that listings, prices,
                availability, delivery windows or response times are accurate or uninterrupted, particularly in this
                phase where much of that content is illustrative.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  We are not liable for the clinical acts or omissions of an independent provider, or for a decision you
                  take on the basis of informational content or the AI assistant.
                </li>
                <li>
                  We are not liable for indirect, incidental or consequential loss, including lost profits or lost
                  opportunity, arising from your use of the platform.
                </li>
                <li>
                  Where liability cannot be excluded, our aggregate liability arising out of or relating to the platform
                  is limited to the amount of platform fees you paid to ORVEXA in the twelve months preceding the claim,
                  or INR 10,000 if you paid nothing.
                </li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Nothing in these terms limits any liability that cannot lawfully be limited, including liability for
                fraud, wilful misconduct, or your statutory rights as a consumer under the Consumer Protection Act 2019.
              </p>
            </section>

            <section id="governing-law" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Governing law and jurisdiction</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                These terms are governed by the laws of India. Subject to any mandatory consumer forum rights you have
                where you live, the courts at Bengaluru, Karnataka have exclusive jurisdiction over disputes arising from
                these terms or from your use of the platform.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Before starting proceedings, we ask that you raise the issue with the care desk so it can be resolved
                directly — the escalation path is described in the{" "}
                <Link href="/help" className="font-medium text-primary underline underline-offset-4">
                  help centre
                </Link>
                .
              </p>
            </section>

            <section id="changes" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Changes to these terms</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>We may update these terms as the platform changes. The revised date is published at the top of the page.</li>
                <li>
                  Material changes will be notified to account holders before they take effect, with reasonable notice.
                </li>
                <li>
                  Continuing to use the platform after the effective date means you accept the revised terms. If you do
                  not accept them, stop using the platform and close your account.
                </li>
                <li>If any provision is held unenforceable, the rest of these terms continue to apply.</li>
              </ul>
            </section>

            <section id="contact" className="max-w-3xl">
              <h2 className="text-xl font-semibold sm:text-2xl">Contact</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Questions about these terms, notices and formal correspondence go to {siteConfig.legalName},{" "}
                {siteConfig.address}. Email{" "}
                <a href={`mailto:${siteConfig.supportEmail}`} className="font-medium text-primary underline underline-offset-4">
                  {siteConfig.supportEmail}
                </a>{" "}
                or call{" "}
                <a
                  href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {siteConfig.supportPhone}
                </a>
                .
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                See also the{" "}
                <Link href="/privacy" className="font-medium text-primary underline underline-offset-4">
                  privacy policy
                </Link>{" "}
                and{" "}
                <Link href="/contact" className="font-medium text-primary underline underline-offset-4">
                  our contact page
                </Link>
                . For a medical emergency, call{" "}
                <a
                  href={`tel:${siteConfig.emergencyNumber}`}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {siteConfig.emergencyNumber}
                </a>
                .
              </p>
            </section>

            <div className="max-w-3xl border-t border-border pt-6">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {siteConfig.legalName} · Last updated {lastUpdated} ·{" "}
                <Link href="/privacy" className="underline underline-offset-4">
                  Privacy policy
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
