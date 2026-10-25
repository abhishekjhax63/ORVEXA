"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  Search,
  ShieldCheck,
  Siren,
  Sparkles,
  Star,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { CareSearch } from "@/components/marketing/care-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { platformHighlights } from "@/data/content";

const easeOut = [0.22, 1, 0.36, 1] as const;

const popularSearches = [
  { label: "Chest pain", href: "/hospitals?q=chest%20pain" },
  { label: "Cardiology", href: "/hospitals?specialty=Cardiology" },
  { label: "Full body checkup", href: "/diagnostics" },
  { label: "Diabetes care", href: "/diagnostics?category=diabetes" },
  { label: "Child vaccination", href: "/services#wellness" },
];

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

  return (
    <section className="relative isolate overflow-hidden pt-10 pb-16 sm:pt-14 lg:pt-16 lg:pb-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 aurora" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 grid-backdrop opacity-40" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 -z-10 size-[32rem] rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--brand-to)_22%,transparent),transparent_68%)] blur-2xl"
      />

      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[1.06fr_0.94fr] lg:gap-16">
          <div className="flex flex-col items-start gap-7">
            <motion.div {...rise(0)}>
              <Badge variant="outline" className="gap-2 border-primary/25 bg-card/80 py-1.5 pr-3 pl-2 text-[0.7rem] tracking-[0.12em] uppercase">
                <Sparkles aria-hidden className="size-3.5" />
                India&apos;s unified health ecosystem
              </Badge>
            </motion.div>

            <motion.h1
              {...rise(0.06)}
              className="max-w-2xl text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-[3.4rem]"
            >
              Every health decision, <span className="text-gradient-brand">one connected platform</span>.
            </motion.h1>

            <motion.p {...rise(0.12)} className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Browse the supplied Patna hospital and doctor list, and explore ORVEXA&apos;s care tools. Provider details
              are unverified; appointments and AI image analysis require their respective services to be configured.
            </motion.p>

            <motion.div {...rise(0.18)} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild variant="gradient" size="lg">
                <Link href="/hospitals">
                  <Search aria-hidden />
                  Search hospitals
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/hospitals#doctors">
                  <Sparkles aria-hidden />
                  AI health assistant
                </Link>
              </Button>
              <Button asChild variant="emergency" size="lg">
                <Link href="/emergency">
                  <Siren aria-hidden />
                  Emergency SOS
                </Link>
              </Button>
            </motion.div>

            <motion.dl {...rise(0.24)} className="grid w-full max-w-xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {platformHighlights.map((item) => (
                <div key={item.id} className="flex flex-col gap-0.5 border-l-2 border-primary/25 pl-3">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="text-lg font-semibold tracking-tight">{item.value}</dd>
                </div>
              ))}
            </motion.dl>
          </div>

          <motion.div {...rise(0.14)} className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div aria-hidden className="absolute -inset-4 -z-10 rounded-[2rem] bg-[linear-gradient(140deg,var(--brand-from),var(--brand-to))] opacity-10 blur-2xl" />

            <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-[var(--shadow-lift)]">
              <div className="relative aspect-[4/5] w-full bg-primary-soft">
                <Image
                  src="/orvexa-logo.png"
                  alt="ORVEXA logo"
                  fill
                  priority
                  sizes="(min-width: 1024px) 40vw, 90vw"
                  className="object-contain p-10 sm:p-16"
                />
              </div>

              <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-2xl border border-white/15 bg-navy-950/70 p-3 text-white backdrop-blur-xl">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
                  <Search className="size-5 text-teal-300" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Patna provider directory</p>
                  <p className="truncate text-xs text-white/70">20 hospital listings · 83 doctor records</p>
                </div>
                <Badge variant="warning" className="ml-auto shrink-0">Unverified</Badge>
              </div>
            </div>

            <motion.div
              {...(reduceMotion
                ? {}
                : {
                    initial: { opacity: 0, y: 16 },
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: 0.6, delay: 0.4, ease: easeOut },
                  })}
              className="absolute -bottom-6 -left-2 w-56 rounded-2xl border border-border bg-card/85 p-3.5 shadow-[var(--shadow-panel)] backdrop-blur-xl sm:-left-6"
            >
              <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <Sparkles aria-hidden className="size-3.5 text-primary" />
                AI image analysis
              </p>
              <p className="mt-2 text-sm font-semibold">Vision provider required</p>
              <p className="text-xs text-muted-foreground">Requires configured AI and upload services; not a diagnosis.</p>
            </motion.div>

            <motion.div
              {...(reduceMotion
                ? {}
                : {
                    initial: { opacity: 0, y: 16 },
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: 0.6, delay: 0.5, ease: easeOut },
                  })}
              className="absolute -top-4 -right-1 flex items-center gap-2.5 rounded-2xl border border-border bg-card/85 px-3.5 py-2.5 shadow-[var(--shadow-panel)] backdrop-blur-xl sm:-right-5"
            >
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-warning-soft text-warning">
                <ShieldCheck className="size-4" />
              </span>
              <div className="leading-tight">
                <p className="text-xs font-semibold">Provider verification</p>
                <p className="text-[0.68rem] text-muted-foreground">Pending; confirm details directly</p>
              </div>
            </motion.div>
          </motion.div>
        </div>

        <motion.div {...rise(0.28)} className="mt-12 lg:mt-16">
          <CareSearch variant="hero" />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Star aria-hidden className="size-3.5 text-amber-500" />
              Popular searches
            </span>
            {popularSearches.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
            <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <ShieldCheck aria-hidden className="size-3.5 text-warning" />
              Patna directory is unverified; confirm provider details directly
            </span>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}

export { Hero };
