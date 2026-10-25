import type { Metadata } from "next";

import { DemoNotice } from "@/components/layout/demo-notice";
import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy notice draft",
  description:
    "Draft privacy information for review. No privacy compliance assessment or data-handling verification has been completed for this deployment.",
  alternates: { canonical: "/privacy" },
};

const reviewItems = [
  {
    title: "Data collected and purposes",
    description:
      "The data collected by each enabled feature, its purpose, and any third-party processing have not been comprehensively verified.",
  },
  {
    title: "Storage, sharing, and retention",
    description:
      "Storage locations, recipients, retention periods, deletion behavior, and consent records have not been verified.",
  },
  {
    title: "Security and incident response",
    description:
      "Security controls, access logging, breach handling, and notification procedures have not been independently assessed.",
  },
  {
    title: "Rights, children, and grievances",
    description:
      "No operational process for privacy requests, children's data, or grievance handling has been verified.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        eyebrow="Draft notice"
        title="Privacy information is not finalized"
        description="This page is not an approved privacy policy or a statement of legal compliance. Do not submit real patient or sensitive personal data through this review deployment."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Privacy", href: "/privacy" },
        ]}
      />

      <Section spacing="default">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <DemoNotice>
            A privacy and data-protection assessment has not been completed. The legal entity, data-fiduciary role,
            processing purposes, service providers, retention, security controls, and rights-handling procedures have
            not been verified. Do not rely on this draft as a policy.
          </DemoNotice>

          <section>
            <h2 className="text-xl font-semibold sm:text-2xl">Items requiring review</h2>
            <ul className="mt-4 flex flex-col gap-4">
              {reviewItems.map((item) => (
                <li key={item.title} className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold sm:text-2xl">Contact</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The project owner provided{" "}
              <a
                href={`mailto:${siteConfig.supportEmail}`}
                className="font-medium text-primary underline underline-offset-4"
              >
                {siteConfig.supportEmail}
              </a>{" "}
              as a contact address. It has not been verified as a monitored privacy-request or grievance channel.
            </p>
          </section>
        </div>
      </Section>
    </>
  );
}
