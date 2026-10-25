"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, MapPin, Search, ShieldCheck, Siren, Sparkles, Star } from "lucide-react";

import { Container } from "@/components/layout/container";
import { CareSearch } from "@/components/marketing/care-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { platformHighlights } from "@/data/content";
import { specialties as careSpecialties } from "@/data/providers";

const easeOut = [0.22, 1, 0.36, 1] as const;

const popularSearches = [
  { label: "Chest pain", href: "/hospitals?q=chest%20pain" },
  { label: "Cardiology", href: "/hospitals?specialty=Cardiology" },
  { label: "Full body checkup", href: "/diagnostics" },
  { label: "Diabetes care", href: "/diagnostics?category=diabetes" },
  { label: "Child vaccination", href: "/services#wellness" },
];

/** First entries of the application's own speciality taxonomy. */
const heroSpecialties = careSpecialties.slice(0, 6);

function Hero() {
  const reduceMotion = useReducedMotion();

  const rise = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: easeOut },
        };

  const float = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: easeOut },
        };

  return (
    <section className="relative isolate overflow-hidden pt-12 pb-20 sm:pt-16 lg:pt-20 lg:pb-28">
      <div aria-hidden className="aurora pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="grid-backdrop pointer-events-none absolute inset-0 -z-10 opacity-40" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-32 -z-10 size-[34rem] rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--accent)_26%,transparent),transparent_68%)] blur-3xl"
      />

      <Container>
        <div className="grid items-center gap-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14">
          {/* ---------------------------------------------------------------- *
           * Editorial column
           * ---------------------------------------------------------------- */}
          <div className="flex flex-col items-start gap-8">
            <motion.div {...rise(0)} className="flex items-center gap-3">
              <span aria-hidden className="h-px w-8 bg-accent" />
              <span className="eyebrow text-forest-700 dark:text-lime-300">India&apos;s connected health ecosystem</span>
            </motion.div>

            <motion.h1
              {...rise(0.06)}
              className="max-w-2xl text-[2.5rem] leading-[1.06] font-semibold sm:text-5xl lg:text-[3.5rem] lg:leading-[1.03]"
            >
              Better Healthcare Starts With the{" "}
              <span className="relative inline-block">
                <span className="text-gradient-brand">Right Connection</span>
                <span aria-hidden className="absolute inset-x-0 -bottom-1 h-1 rounded-full bg-accent/60" />
              </span>
              .
            </motion.h1>

            <motion.p {...rise(0.12)} className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Discover healthcare providers, explore medical information, and navigate your next step with ORVEXA.
            </motion.p>

            <motion.div {...rise(0.18)} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button asChild variant="gradient" size="lg">
                <Link href="/hospitals">
                  <Search aria-hidden />
                  Find Nearby Care
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/assistant">
                  <Sparkles aria-hidden />
                  Explore AI Assistant
                </Link>
              </Button>
              <Link
                href="/emergency"
                className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-emergency transition-colors duration-[var(--duration-base)] ease-[var(--ease-soft)] hover:bg-emergency-soft"
              >
                <Siren aria-hidden className="size-4" />
                Emergency SOS
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </motion.div>

            <motion.p {...rise(0.22)} className="flex max-w-xl items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                The Patna directory ships as supplied and is <strong className="font-semibold text-foreground">not
                verified</strong> by ORVEXA. Confirm provider details directly before acting on them.
              </span>
            </motion.p>

            <motion.dl {...rise(0.26)} className="grid w-full max-w-xl grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {platformHighlights.map((item) => (
                <div key={item.id} className="flex flex-col gap-1 border-t border-border pt-3">
                  <dd className="[font-family:var(--font-display)] text-xl font-semibold tracking-tight">{item.value}</dd>
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                </div>
              ))}
            </motion.dl>
          </div>

          {/* ---------------------------------------------------------------- *
           * Layered interface composition
           * ---------------------------------------------------------------- */}
          <motion.div {...rise(0.14)} className="relative mx-auto w-full max-w-lg lg:max-w-none">
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(58%_58%_at_72%_18%,color-mix(in_oklab,var(--accent)_30%,transparent),transparent_72%)] blur-2xl"
            />

            <div className="surface-panel relative rounded-3xl p-3">
              {/* Map preview. Nothing is plotted because no maps provider is
                  configured, so the panel says so instead of implying live data. */}
              <div className="relative aspect-[5/4] overflow-hidden rounded-2xl bg-[linear-gradient(152deg,#0a3226,#08291d_56%,#061d14)] ring-1 ring-inset ring-white/10">
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(to_right,rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:44px_44px]"
                />
                <div
                  aria-hidden
                  className="absolute -top-14 left-1/3 size-56 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent)_34%,transparent),transparent_70%)] blur-2xl"
                />

                <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[0.68rem] font-medium text-white backdrop-blur">
                    <MapPin aria-hidden className="size-3" />
                    Patna
                  </span>
                  <span className="inline-flex items-center rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[0.68rem] font-medium text-white/75 backdrop-blur">
                    Maps provider not configured
                  </span>
                </div>

                <div className="absolute inset-0 grid place-items-center px-6 text-center">
                  <div className="max-w-xs">
                    <span
                      aria-hidden
                      className="mx-auto grid size-11 place-items-center rounded-xl bg-white/10 text-lime-300 ring-1 ring-white/15"
                    >
                      <MapPin className="size-5" />
                    </span>
                    <p className="mt-4 text-sm font-semibold text-white">Interactive provider map</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/65">
                      Location search, routing and plotted facilities need a configured maps provider, so nothing is
                      shown here yet.
                    </p>
                    <Button asChild variant="gradient" size="sm" className="mt-4">
                      <Link href="/emergency/nearby">
                        Open nearby care
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Search filter entry point — the real speciality taxonomy. */}
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
                {heroSpecialties.map((specialty) => (
                  <Link
                    key={specialty.id}
                    href={`/hospitals?specialty=${encodeURIComponent(specialty.name)}`}
                    className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--duration-base)] ease-[var(--ease-soft)] hover:border-primary/45 hover:text-primary"
                  >
                    {specialty.name}
                  </Link>
                ))}
              </div>

              {/* Provider result preview, backed by the supplied directory counts. */}
              <div className="mt-1 flex items-center gap-3 px-2 py-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Search className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Patna provider directory</p>
                  <p className="truncate text-xs text-muted-foreground">20 hospital listings · 83 doctor records</p>
                </div>
                <Badge variant="warning" className="ml-auto shrink-0">
                  Unverified
                </Badge>
              </div>
            </div>

            {/* Verification status. */}
            <motion.div
              {...float(0.42)}
              className="absolute -top-5 right-2 flex items-center gap-2.5 rounded-2xl border border-border bg-card/90 px-3.5 py-2.5 shadow-[var(--shadow-panel)] backdrop-blur-xl sm:-right-6"
            >
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-warning-soft text-warning">
                <ShieldCheck className="size-4" />
              </span>
              <div className="leading-tight">
                <p className="text-xs font-semibold">Provider verification</p>
                <p className="text-[0.68rem] text-muted-foreground">Pending · confirm details directly</p>
              </div>
            </motion.div>

            {/* AI assistant entry point. */}
            <motion.div
              {...float(0.5)}
              className="absolute -bottom-6 left-2 w-60 rounded-2xl border border-border bg-card/90 p-3.5 shadow-[var(--shadow-panel)] backdrop-blur-xl sm:-left-7"
            >
              <p className="eyebrow flex items-center gap-2 text-muted-foreground">
                <Sparkles aria-hidden className="size-3.5 text-primary" />
                AI health assistant
              </p>
              <p className="mt-2 text-sm font-semibold">Informational guidance only</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Not a diagnosis or prescription. Emergency signs always need real care.
              </p>
              <Button asChild variant="ghost" size="sm" className="-ml-2 mt-1.5 h-7 px-2 text-xs">
                <Link href="/assistant">
                  Open assistant
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>

        {/* ------------------------------------------------------------------ *
         * Discovery entry point
         * ------------------------------------------------------------------ */}
        <motion.div {...rise(0.3)} className="mt-16 lg:mt-20">
          <CareSearch variant="hero" />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Star aria-hidden className="size-3.5 text-warning" />
              Popular searches
            </span>
            {popularSearches.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-lg border border-border bg-card/70 px-3 py-1 text-xs font-medium transition-colors duration-[var(--duration-base)] ease-[var(--ease-soft)] hover:border-primary/45 hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </motion.div>
      </Container>
    </section>
  );
}

export { Hero };
