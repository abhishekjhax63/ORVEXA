"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, ArrowRight, Building2, Search, ShieldCheck, Siren, Sparkles, Star } from "lucide-react";

import { Container } from "@/components/layout/container";
import { CareSearch } from "@/components/marketing/care-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { platformHighlights } from "@/data/content";
import { specialties as careSpecialties } from "@/data/providers";
import { generateAIImage } from "@/lib/images";

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

/**
 * Press/hover feedback for plain links, which carry no transition of their own.
 * `Button` already transitions `transform`, so it only needs the tap scale —
 * passing this whole string would clobber its multi-property transition.
 */
const pressLink =
  "transition-[transform,color,background-color,border-color] duration-200 ease-[var(--ease-soft)] motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97]";
const pressButton = "motion-safe:active:scale-[0.97]";

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

  /* A slow, permanent drift on the portrait so the hero never reads as a
     static screenshot. Neutered for reduced motion. */
  const drift = reduceMotion
    ? {}
    : { animate: { y: [0, -10, 0] }, transition: { duration: 8, repeat: Infinity, ease: "easeInOut" as const } };

  return (
    <section className="relative isolate overflow-hidden pt-12 pb-20 sm:pt-16 lg:pt-20 lg:pb-28">
      {/* Hospital ambience — a real clinical setting, graded back into the page
          so it sets the scene without competing with the copy. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
        <Image
          src={generateAIImage(
            "Professional architectural photography of a modern hospital atrium, clean glass ceilings, soft natural light, minimalist clinical design, premium healthcare ambience, realistic 8k photography",
            "landscape_16_9",
          )}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-[0.12]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_86%,transparent)_0%,var(--background)_74%)]" />
      </div>

      <div aria-hidden className="aurora pointer-events-none absolute inset-0 -z-10" />
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
              <Button asChild variant="gradient" size="lg" className={pressButton}>
                <Link href="/hospitals">
                  <Search aria-hidden />
                  Find Nearby Care
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className={pressButton}>
                <Link href="/assistant">
                  <Sparkles aria-hidden />
                  Explore AI Assistant
                </Link>
              </Button>
              <Link
                href="/emergency"
                className={`inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-emergency hover:bg-emergency-soft ${pressLink}`}
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
           * Sakha — the AI care guide, presented in a hospital setting
           * ---------------------------------------------------------------- */}
          <motion.div {...rise(0.14)} className="relative mx-auto w-full max-w-lg lg:max-w-none">
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[2.75rem] bg-[radial-gradient(60%_60%_at_70%_14%,color-mix(in_oklab,var(--accent)_34%,transparent),transparent_72%)] blur-2xl"
            />

            <div className="surface-panel relative rounded-[2rem] p-2 shadow-[var(--shadow-panel)]">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.6rem] bg-forest-950">
                <motion.div {...drift} className="absolute inset-0">
                  <Image
                    src={generateAIImage(
                      "Professional studio portrait of Sakha, a friendly Indian female AI doctor, clean white coat, warm approachable smile, modern hospital atrium background, cinematic lighting, realistic 8k photography",
                      "portrait_4_3",
                    )}
                    alt="Sakha, the ORVEXA AI care guide, standing in a modern hospital atrium"
                    fill
                    priority
                    sizes="(min-width: 1024px) 42vw, 100vw"
                    className="object-cover object-top"
                  />
                </motion.div>

                {/* Cinematic emerald grade keeps the portrait on-theme. */}
                <div
                  aria-hidden
                  className="absolute inset-0 [background:linear-gradient(180deg,rgba(8,41,29,0.32)_0%,rgba(8,41,29,0.06)_34%,rgba(8,41,29,0.55)_68%,rgba(8,41,29,0.92)_100%)]"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-[1.6rem] ring-1 ring-inset ring-white/15"
                />

                {/* Persona identity. */}
                <div className="absolute top-4 left-4 flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/10 px-2.5 py-1.5 backdrop-blur-md">
                  <span className="relative size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-white/30">
                    <Image
                      src={generateAIImage(
                        "Close-up portrait of Sakha AI doctor, friendly Indian female practitioner, soft approachable expression, clean professional medical attire, realistic photography",
                        "square",
                      )}
                      alt=""
                      fill
                      sizes="32px"
                      className="object-cover"
                    />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[0.72rem] font-semibold text-white">Sakha AI</span>
                    <span className="block text-[0.6rem] text-white/70">Your care guide</span>
                  </span>
                  <span aria-hidden className="ml-0.5 size-1.5 animate-pulse rounded-full bg-lime-300" />
                </div>

                <div className="absolute inset-x-4 bottom-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[0.65rem] font-medium text-white/85 backdrop-blur">
                    <Activity aria-hidden className="size-3" />
                    Care that stays connected
                  </span>
                  <p className="mt-2.5 text-lg leading-snug font-semibold text-white sm:text-xl">
                    One companion from first search to follow-up.
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                    Informational guidance only — never a diagnosis or a prescription. Emergency signs always need real
                    care.
                  </p>
                </div>
              </div>

              {/* Directory trust strip — real counts, neutral imagery policy. */}
              <div className="mt-2 flex items-center gap-3 rounded-[1.4rem] border border-border bg-card p-2.5">
                <span className="relative size-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-forest-950/10">
                  <Image
                    src={generateAIImage(
                      "Professional team photo of Indian healthcare practitioners, diverse group of doctors in clean white coats, standing in a modern clinic corridor, warm lighting, high-end professional photography",
                      "square",
                    )}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Patna care network</p>
                  <p className="truncate text-xs text-muted-foreground">
                    20 hospital listings · 83 doctor records
                  </p>
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
              <p className="mt-2 text-sm font-semibold">Ask, or paste a photo</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Share a report or a photo right in the chat. Guidance only — not a diagnosis.
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
                className={`rounded-lg border border-border bg-card/70 px-3 py-1 text-xs font-medium hover:border-primary/45 hover:text-primary ${pressLink}`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {heroSpecialties.map((specialty) => (
              <Link
                key={specialty.id}
                href={`/hospitals?specialty=${encodeURIComponent(specialty.name)}`}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/45 hover:text-primary ${pressLink}`}
              >
                <Building2 aria-hidden className="size-3.5 text-primary/70" />
                {specialty.name}
              </Link>
            ))}
          </div>
        </motion.div>
      </Container>
    </section>
  );
}

export { Hero };
