import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";
import { Logo } from "@/components/layout/logo";
import { siteConfig } from "@/lib/site";

/**
 * Shell for every signed-out account screen.
 *
 * It renders the ORVEXA mark and a way back to the public site, and wraps the
 * page in a `<Suspense>` boundary because the pages inside read request-time
 * values (the session cookie and `searchParams`). With Cache Components enabled
 * that read cannot be part of the prerendered shell, so the static chrome paints
 * immediately and the form streams in behind the skeleton.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside
        aria-hidden
        className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(150deg,var(--brand-from),#08291d_60%,#04160f)] p-12 text-white lg:flex"
      >
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2.5 text-[1.05rem] font-semibold tracking-[0.16em]">
            <span className="grid size-9 place-items-center rounded-xl bg-white/12 ring-1 ring-white/20">
              <ShieldCheck className="size-5 text-lime-200" />
            </span>
            {siteConfig.name}
          </span>
          <p className="mt-12 max-w-md text-3xl leading-snug font-semibold">
            One secure account for every health decision you make.
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
            Appointments, records, prescriptions, diagnostics and claims stay in a single timeline, protected by
            role-based access and a full audit trail.
          </p>
        </div>
        <dl className="relative z-10 grid max-w-md gap-5 text-sm">
          <div>
            <dt className="font-semibold text-lime-200">Your records stay yours</dt>
            <dd className="mt-1 text-white/70">
              Health information is shared only with your explicit consent, and never sold.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-lime-200">Emergency help is never gated</dt>
            <dd className="mt-1 text-white/70">
              SOS access stays available on every account, whatever else you use ORVEXA for.
            </dd>
          </div>
        </dl>
        <span
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-lime-400/15 blur-3xl"
        />
      </aside>

      <div className="flex min-h-dvh flex-col bg-background">
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-6 lg:px-10">
          <Logo className="lg:hidden" />
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back to site
          </Link>
        </header>

        <main id="main" className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">
            <Suspense fallback={<AuthFormSkeleton />}>{children}</Suspense>
          </div>
        </main>

        <footer className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground sm:px-6 lg:px-10">
          Medical emergency? Call {siteConfig.emergencyNumber}. Need help?{" "}
          <a href={`mailto:${siteConfig.supportEmail}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {siteConfig.supportEmail}
          </a>
        </footer>
      </div>
    </div>
  );
}
