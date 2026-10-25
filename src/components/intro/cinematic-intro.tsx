"use client";

import Image from "next/image";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * The skippable ORVEXA opening sequence.
 *
 * Built with CSS 3D transforms plus Framer Motion rather than a WebGL engine:
 * the emblem is real extruded geometry (stacked `translateZ` discs under
 * `transform-style: preserve-3d`), so it is a genuine depth reveal instead of a
 * flat image spun in place, and no 3D engine ships to a page that does not need
 * one.
 *
 * Access rules, per the brief ("the animation is a brand enhancement, not a
 * barrier to healthcare access"):
 * - it plays at most once per browser session,
 * - it is skipped entirely for `prefers-reduced-motion`,
 * - any scroll, pointer press, or Escape ends it immediately,
 * - `Skip intro` is always reachable by keyboard,
 * - it is only mounted on the homepage, never on emergency or inner routes.
 */

const SESSION_KEY = "orvexa:intro:v1";
const AUTO_DISMISS_MS = 2800;

const EASE_CINEMATIC = [0.16, 1, 0.3, 1] as const;

/**
 * `sessionStorage` is an external system, so it is read through
 * `useSyncExternalStore` rather than mirrored into React state. Reading it
 * lazily (instead of copying it into state inside an effect) avoids a cascading
 * render, and the server snapshot reports "already seen" so the overlay is
 * never part of the prerendered HTML.
 */
const introListeners = new Set<() => void>();

function subscribeToIntroState(listener: () => void) {
  introListeners.add(listener);
  return () => {
    introListeners.delete(listener);
  };
}

function getIntroSnapshot() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    // Storage unavailable (private window). Treat as seen and stay out of the way.
    return true;
  }
}

function getIntroServerSnapshot() {
  return true;
}

function markIntroSeen() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Nothing to persist; the overlay still unmounts for this visit.
  }
  introListeners.forEach((listener) => listener());
}

function CinematicIntro() {
  const prefersReducedMotion = useReducedMotion();
  const hasSeenIntro = useSyncExternalStore(subscribeToIntroState, getIntroSnapshot, getIntroServerSnapshot);
  const isPlaying = !hasSeenIntro && !prefersReducedMotion;

  const dismiss = useCallback(() => {
    markIntroSeen();
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);

    // Any key press ends the sequence, so a keyboard visitor is never held up
    // by it — pressing Tab both reaches `Skip intro` and dismisses.
    const onKeyDown = () => dismiss();

    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("wheel", dismiss, { passive: true });
    window.addEventListener("touchmove", dismiss, { passive: true });
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("wheel", dismiss);
      window.removeEventListener("touchmove", dismiss);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isPlaying, dismiss]);

  return (
    <AnimatePresence>
      {isPlaying ? (
        <motion.div
          key="orvexa-intro"
          className="fixed inset-0 z-[var(--z-intro)] flex items-center justify-center overflow-hidden bg-[linear-gradient(162deg,#f1f5ef_0%,#fafbf8_52%,#eaf3e8_100%)]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.015 }}
          transition={{ duration: 0.62, ease: EASE_CINEMATIC }}
        >
          {/* Ambient brand light — a single soft emerald wash, no grid. */}
          <div aria-hidden className="aurora pointer-events-none absolute inset-0 opacity-80" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background:radial-gradient(46%_38%_at_50%_42%,color-mix(in_oklab,var(--color-lime-400)_26%,transparent),transparent_72%)]"
          />

          <p role="status" className="sr-only">
            ORVEXA brand introduction. Press Escape, scroll, or use the skip button to continue to the site.
          </p>

          <button
            type="button"
            onClick={dismiss}
            className="absolute top-5 right-5 z-10 rounded-xl border border-forest-950/10 bg-white/70 px-4 py-2 eyebrow text-forest-800 shadow-[var(--shadow-soft)] backdrop-blur transition-colors duration-[var(--duration-base)] ease-[var(--ease-soft)] hover:bg-white hover:text-forest-950 sm:top-8 sm:right-8"
          >
            Skip intro
          </button>

          <div aria-hidden className="relative flex flex-col items-center px-6">
            <div className="relative [perspective:1500px]">
              <motion.div
                className="relative grid place-items-center [transform-style:preserve-3d]"
                initial={{ opacity: 0, rotateY: -56, rotateX: 18, scale: 0.76, y: 28 }}
                animate={{ opacity: 1, rotateY: 0, rotateX: 0, scale: 1, y: 0 }}
                transition={{ duration: 1.5, ease: EASE_CINEMATIC }}
              >
                {/* Extruded body of the sealed medallion. Each plate sits on its
                    own Z plane, so the perspective rotation exposes real depth. */}
                <span className="absolute size-[12.5rem] rounded-[2.4rem] bg-forest-950/35 blur-[6px] [transform:translateZ(-76px)_scale(0.9)]" />
                <span className="absolute size-[12.5rem] rounded-[2.4rem] bg-forest-950 [transform:translateZ(-60px)]" />
                <span className="absolute size-[12.5rem] rounded-[2.4rem] bg-forest-900 [transform:translateZ(-45px)]" />
                <span className="absolute size-[12.5rem] rounded-[2.4rem] bg-forest-800 [transform:translateZ(-30px)]" />
                <span className="absolute size-[12.5rem] rounded-[2.4rem] bg-forest-700 [transform:translateZ(-15px)]" />

                {/* Polished face. */}
                <span className="relative grid size-[12.5rem] place-items-center overflow-hidden rounded-[2.4rem] bg-[#eaf3ee] shadow-[0_30px_70px_-30px_rgba(8,41,29,0.55)] ring-1 ring-forest-950/10 [transform:translateZ(6px)]">
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-[2.4rem] opacity-[0.45] [background:conic-gradient(from_140deg,rgba(184,243,107,0.5),transparent_30%,transparent_62%,rgba(18,59,42,0.3))]"
                  />
                  <span
                    aria-hidden
                    className="animate-spin-slow absolute -inset-1/4 [background:conic-gradient(from_0deg,transparent_0%,rgba(184,243,107,0.35)_12%,transparent_26%)]"
                  />
                  <Image
                    src="/brand/logo-emerald-mark.png"
                    alt=""
                    width={220}
                    height={220}
                    priority
                    className="relative size-[10.25rem] object-contain"
                  />
                </span>

                {/* Chromatic light streaks, in the brand's emerald/mint/teal. */}
                <span className="pointer-events-none absolute inset-[-42%] [transform:translateZ(24px)]">
                  <motion.span
                    className="absolute top-[28%] left-[-20%] h-px w-[86%] bg-[linear-gradient(90deg,transparent,rgba(45,212,191,0.85),transparent)] blur-[1.5px]"
                    initial={{ x: "-40%", opacity: 0 }}
                    animate={{ x: "60%", opacity: [0, 0.9, 0] }}
                    transition={{ duration: 1.9, delay: 0.32, ease: "easeInOut" }}
                  />
                  <motion.span
                    className="absolute top-[52%] left-[-14%] h-px w-[80%] bg-[linear-gradient(90deg,transparent,rgba(184,243,107,0.8),transparent)] blur-[1.5px]"
                    initial={{ x: "45%", opacity: 0 }}
                    animate={{ x: "-55%", opacity: [0, 0.8, 0] }}
                    transition={{ duration: 2, delay: 0.44, ease: "easeInOut" }}
                  />
                  <motion.span
                    className="absolute top-[70%] left-[-24%] h-px w-[92%] bg-[linear-gradient(90deg,transparent,rgba(74,138,98,0.8),transparent)] blur-[1.5px]"
                    initial={{ x: "-30%", opacity: 0 }}
                    animate={{ x: "55%", opacity: [0, 0.75, 0] }}
                    transition={{ duration: 1.85, delay: 0.56, ease: "easeInOut" }}
                  />
                  <motion.span
                    className="absolute top-[12%] left-[6%] h-24 w-px bg-[linear-gradient(180deg,transparent,rgba(45,212,191,0.8),transparent)] blur-[1.5px]"
                    initial={{ y: "-25%", opacity: 0 }}
                    animate={{ y: "25%", opacity: [0, 0.85, 0] }}
                    transition={{ duration: 1.7, delay: 0.5, ease: "easeInOut" }}
                  />
                </span>
              </motion.div>
            </div>

            <motion.div
              className="mt-14 text-center"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: EASE_CINEMATIC }}
            >
              <p className="[font-family:var(--font-display)] text-[2.1rem] leading-none font-semibold tracking-[0.34em] text-forest-950 sm:text-[2.6rem]">
                ORVEXA
              </p>
              <p className="mt-4 text-[0.7rem] font-semibold tracking-[0.28em] text-forest-700 uppercase sm:text-xs">
                Healthcare, Connected.
              </p>
            </motion.div>
          </div>

          {/* Sequence progress. Reaches full width as the intro auto-dismisses. */}
          <motion.span
            aria-hidden
            className="absolute bottom-0 left-0 h-0.5 bg-[linear-gradient(90deg,var(--brand-from),var(--brand-via),var(--brand-to))]"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: AUTO_DISMISS_MS / 1000, ease: "linear" }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export { CinematicIntro };
