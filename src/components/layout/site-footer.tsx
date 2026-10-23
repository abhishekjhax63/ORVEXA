import Link from "next/link";
import { Mail, MapPin, Phone, Siren } from "lucide-react";

import { Container } from "@/components/layout/container";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { footerNav, copyrightYear, siteConfig } from "@/lib/site";

function SiteFooter() {
  return (
    <footer className="relative mt-auto border-t border-border bg-navy-900 text-navy-100 dark:bg-navy-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--brand-to),transparent)]"
      />
      <Container className="py-14 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div className="flex flex-col gap-5">
            <Link href="/" className="inline-flex items-center gap-2.5" aria-label={`${siteConfig.name} home`}>
              <LogoMark />
              <span className="text-[1.05rem] font-semibold tracking-[0.16em] text-white">ORVEXA</span>
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-navy-100/75">
              {siteConfig.description}
            </p>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-start gap-3">
                <dt className="sr-only">Emergency helpline</dt>
                <Siren aria-hidden className="mt-0.5 size-4 shrink-0 text-teal-300" />
                <dd>
                  <a
                    href={`tel:${siteConfig.emergencyNumber}`}
                    className="font-semibold text-white transition-colors hover:text-teal-200"
                  >
                    Emergency {siteConfig.emergencyNumber}
                  </a>
                  <span className="ml-2 text-navy-100/60">ambulance dispatch</span>
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="sr-only">Care desk phone</dt>
                <Phone aria-hidden className="mt-0.5 size-4 shrink-0 text-teal-300" />
                <dd>
                  <a
                    href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}
                    className="text-navy-100/85 transition-colors hover:text-white"
                  >
                    {siteConfig.supportPhone}
                  </a>
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="sr-only">Support email</dt>
                <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-teal-300" />
                <dd>
                  <a
                    href={`mailto:${siteConfig.supportEmail}`}
                    className="text-navy-100/85 transition-colors hover:text-white"
                  >
                    {siteConfig.supportEmail}
                  </a>
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="sr-only">Registered address</dt>
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-teal-300" />
                <dd className="text-navy-100/75">{siteConfig.address}</dd>
              </div>
            </dl>
            <Button asChild variant="gradient" size="lg" className="w-fit">
              <Link href="/hospitals">Find care near you</Link>
            </Button>
          </div>

          <nav aria-label="Footer" className="grid gap-10 sm:grid-cols-3">
            {footerNav.map((group) => (
              <div key={group.title} className="flex flex-col gap-4">
                <h2 className="text-xs font-semibold tracking-[0.16em] text-white uppercase">{group.title}</h2>
                <ul className="flex flex-col gap-2.5 text-sm">
                  {group.items.map((item) => (
                    <li key={`${group.title}-${item.href}-${item.title}`}>
                      <Link
                        href={item.href}
                        className="text-navy-100/75 transition-colors hover:text-white hover:underline hover:underline-offset-4"
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-6 border-t border-white/10 pt-8 text-xs text-navy-100/65 lg:flex-row lg:items-start lg:justify-between">
          <p className="max-w-3xl leading-relaxed">
            ORVEXA is a healthcare coordination platform, not a medical provider. Content here is for information
            only and never replaces advice from a registered medical practitioner. In an emergency, call{" "}
            {siteConfig.emergencyNumber} immediately. This Phase 1 build ships with clearly labelled demo data;
            provider, pharmacy and insurance integrations follow in later phases.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-white">
              Terms
            </Link>
            <Link href="/help" className="transition-colors hover:text-white">
              Help
            </Link>
            <span>© {copyrightYear} {siteConfig.legalName}</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}

export { SiteFooter };
