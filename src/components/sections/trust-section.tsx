import Link from "next/link";
import { Building2 } from "lucide-react";

import { Section, SectionHeading } from "@/components/layout/section";
import { NewsletterForm } from "@/components/marketing/newsletter-form";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { providerOnboarding, trustMetrics } from "@/data/content";

/** Homepage trust block: platform metrics, patient stories, provider onboarding. */
function TrustSection() {
  return (
    <>
      <Section id="trust" spacing="default">
        <Reveal>
          <SectionHeading
            eyebrow="Trust"
            title="Be clear about what is and is not verified"
            description="The figures below describe the current directory and integration status, not audited operating results."
          />
        </Reveal>

        <RevealGroup
          as="ul"
          className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4"
        >
          {trustMetrics.map((metric) => (
            <RevealItem as="li" key={metric.id} className="h-full bg-card">
              <div className="flex h-full flex-col gap-2 p-6">
                <p className="text-3xl font-semibold tracking-tight text-gradient-brand">{metric.value}</p>
                <p className="text-sm font-semibold">{metric.label}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{metric.detail}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal className="mt-16">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-xl font-semibold sm:text-2xl">Patient and provider stories</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              No verified customer testimonials are published yet. ORVEXA will only publish attributable stories with
              the person&apos;s consent.
            </p>
          </div>
        </Reveal>
      </Section>

      <Section tone="muted" spacing="default">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16">
          <Reveal>
            <span className="eyebrow inline-flex items-center gap-2.5 text-forest-700 dark:text-lime-300">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              For providers
            </span>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]">
              Provider onboarding is not live yet
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              The steps shown are a proposed onboarding outline, not a service commitment. Contact us to discuss
              provider interest; submitting a request does not activate a listing or integration.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/about#providers">
                  <Building2 aria-hidden />
                  List your facility
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/contact">Talk to partnerships</Link>
              </Button>
            </div>
          </Reveal>

          <RevealGroup as="ul" className="grid gap-4 sm:grid-cols-2">
            {providerOnboarding.map((step) => (
              <RevealItem as="li" key={step.id}>
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-[border-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-soft)] hover:border-primary/30 hover:shadow-[var(--shadow-soft)]">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-9 place-items-center rounded-xl bg-primary-soft text-xs font-semibold text-primary"
                    >
                      {step.step}
                    </span>
                    <step.icon aria-hidden className="size-4.5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>

        <Reveal className="mt-12">
          <div className="grid gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <Badge variant="outline" className="gap-2">
                Stay informed
              </Badge>
              <h3 className="mt-3 text-xl font-semibold sm:text-2xl">Get updates from ORVEXA</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Newsletter subscriptions are unavailable because no mailing-list integration is configured.
              </p>
            </div>
            <NewsletterForm />
          </div>
        </Reveal>
      </Section>
    </>
  );
}

export { TrustSection };
