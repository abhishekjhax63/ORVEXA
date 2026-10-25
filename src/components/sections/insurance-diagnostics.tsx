import Link from "next/link";
import { ArrowRight, Home, Microscope, ShieldCheck, Zap } from "lucide-react";

import { DemoNotice } from "@/components/layout/demo-notice";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { diagnosticPackages } from "@/data/diagnostics";
import { claimSteps } from "@/data/insurance";
import { formatINR } from "@/lib/utils";

const popularPackages = diagnosticPackages.filter((item) => item.popular).slice(0, 2);

/** Homepage insurance + diagnostics block, presented as two coordinated panels. */
function InsuranceDiagnosticsSection() {
  return (
    <Section id="insurance" spacing="default">
      <Reveal>
        <SectionHeading
          eyebrow="Insurance & diagnostics"
          title="Know the cost before you consent to care"
          description="These are sample flows only. ORVEXA is not currently connected to insurers, claims desks, laboratories or home-collection services."
        />
      </Reveal>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <article className="flex h-full flex-col gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
            <div className="flex items-start gap-4">
              <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-leaf-soft text-leaf-deep dark:bg-leaf-mid/15 dark:text-leaf-mid">
                <ShieldCheck className="size-6" />
              </span>
              <div>
                <h3 className="text-xl font-semibold">Insurance &amp; cashless claims</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Coverage checks and claims submission are not connected. The steps below are illustrative and do not
                  contact an insurer or TPA.
                </p>
              </div>
            </div>

            <ol className="flex flex-col gap-4">
              {claimSteps.map((step, index) => (
                <li key={step.id} className="flex gap-4">
                  <span className="flex flex-col items-center">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card text-xs font-semibold text-primary"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {index < claimSteps.length - 1 ? (
                      <span aria-hidden className="mt-1 w-px flex-1 bg-border" />
                    ) : null}
                  </span>
                  <div className="pb-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {step.title}
                      <Badge variant="neutral">{step.duration}</Badge>
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-5">
              <Button asChild variant="gradient">
                <Link href="/insurance">
                  Check my coverage
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap aria-hidden className="size-3.5 text-warning" />
                Claims service not connected
              </p>
            </div>
          </article>
        </Reveal>

        <Reveal delay={0.07}>
          <article className="flex h-full flex-col gap-6 rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className="grid size-12 shrink-0 place-items-center rounded-2xl bg-mint-soft text-mint-deep dark:bg-mint-mid/15 dark:text-mint-mid"
              >
                <Microscope className="size-6" />
              </span>
              <div>
                <h3 className="text-xl font-semibold">Diagnostics &amp; lab tests</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Package names, prices and collection details are sample data. No laboratory booking or report delivery
                  is connected.
                </p>
              </div>
            </div>

            <ul className="flex flex-col gap-4">
              {popularPackages.map((item) => (
                <li key={item.id} className="rounded-2xl border border-border bg-card-elevated p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.testCount} tests · {item.reportTime}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatINR(item.price)}</p>
                      <p className="text-xs text-muted-foreground line-through">{formatINR(item.mrp)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.homeCollection ? (
                      <Badge variant="success">
                        <Home aria-hidden />
                        Free home collection
                      </Badge>
                    ) : (
                      <Badge variant="neutral">At centre</Badge>
                    )}
                    {item.fastingRequired ? <Badge variant="warning">Fasting required</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-5">
              <Button asChild variant="gradient">
                <Link href="/diagnostics">
                  Book a test
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Link
                href="/diagnostics#packages"
                className="text-xs font-semibold text-primary hover:underline hover:underline-offset-4"
              >
                See all packages
              </Link>
            </div>
          </article>
        </Reveal>
      </div>

      <DemoNotice className="mt-6">
        Package prices, test counts and claim timelines are illustrative samples. These controls do not submit real
        bookings or claims.
      </DemoNotice>
    </Section>
  );
}

export { InsuranceDiagnosticsSection };
