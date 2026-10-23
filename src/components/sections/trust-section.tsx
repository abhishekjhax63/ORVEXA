import Link from "next/link";
import { ArrowRight, Building2, Quote, Star } from "lucide-react";

import { Section, SectionHeading } from "@/components/layout/section";
import { NewsletterForm } from "@/components/marketing/newsletter-form";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { providerOnboarding, testimonials, trustMetrics } from "@/data/content";

const featuredTestimonials = testimonials.slice(0, 3);

/** Homepage trust block: platform metrics, patient stories, provider onboarding. */
function TrustSection() {
  return (
    <>
      <Section id="trust" spacing="default">
        <Reveal>
          <SectionHeading
            eyebrow="Trust"
            title="Built to be accountable, not just convenient"
            description="Accreditation checks, published response times and clinical governance behind every module. Here is what the platform measures itself on."
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
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold sm:text-2xl">Patient and provider stories</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Composite examples written to reflect typical Phase 1 journeys.
              </p>
            </div>
            <Button asChild variant="link" className="px-0">
              <Link href="/about#stories">
                Read more stories
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>

          <ul className="mt-6 grid gap-5 lg:grid-cols-3">
            {featuredTestimonials.map((testimonial, index) => (
              <Reveal key={testimonial.id} delay={index * 0.06}>
                <li className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                  <Quote aria-hidden className="size-6 text-primary/40" />
                  <blockquote className="text-sm leading-relaxed text-foreground/90">{testimonial.quote}</blockquote>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
                    <div>
                      <p className="text-sm font-semibold">{testimonial.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {testimonial.role} · {testimonial.city}
                      </p>
                    </div>
                    <span className="flex items-center gap-0.5" aria-label={`${testimonial.rating} out of 5`}>
                      {Array.from({ length: 5 }).map((_, starIndex) => (
                        <Star
                          key={starIndex}
                          aria-hidden
                          className={
                            starIndex < testimonial.rating
                              ? "size-3.5 fill-amber-400 text-amber-400"
                              : "size-3.5 text-muted-foreground/40"
                          }
                        />
                      ))}
                    </span>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>
        </Reveal>
      </Section>

      <Section tone="muted" spacing="default">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              For providers
            </span>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]">
              Onboard your hospital in four steps
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Verification takes 72 hours. After that, bookings, pre-authorisation requests and pharmacy orders flow
              through one console with the paperwork already structured.
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
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5">
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
              <h3 className="mt-3 text-xl font-semibold sm:text-2xl">Health guidance, not marketing noise</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                New modules, clinical guidance and preventive health notes — reviewed by our medical advisory board
                before they go out.
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
