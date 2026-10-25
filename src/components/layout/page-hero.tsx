import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";

type Crumb = { title: string; href: string };

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
};

/**
 * Shared hero for every inner page. Keeps the aurora backdrop, breadcrumbs and
 * typographic rhythm consistent so new modules look native to the platform.
 */
function PageHero({
  eyebrow,
  title,
  description,
  breadcrumbs,
  actions,
  aside,
  className,
  children,
}: PageHeroProps) {
  return (
    <div className={cn("relative overflow-hidden border-b border-border bg-card", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 aurora opacity-70" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(40%_60%_at_88%_0%,color-mix(in_oklab,var(--accent)_18%,transparent),transparent_70%)]"
      />
      <Container className="relative py-14 sm:py-18 lg:py-20">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  {index > 0 ? <ChevronRight aria-hidden className="size-3.5 opacity-60" /> : null}
                  {index === breadcrumbs.length - 1 ? (
                    <span aria-current="page" className="font-medium text-foreground">
                      {crumb.title}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="transition-colors hover:text-primary">
                      {crumb.title}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className={cn("grid gap-10", aside ? "lg:grid-cols-[1.15fr_0.85fr] lg:items-center" : "")}>
          <div className="flex max-w-3xl flex-col gap-5">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 eyebrow text-primary">
              {eyebrow}
            </span>
            <h1 className="text-3xl font-semibold sm:text-4xl lg:text-5xl lg:leading-[1.1]">{title}</h1>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{description}</p>
            {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
            {children}
          </div>
          {aside ? <div className="relative">{aside}</div> : null}
        </div>
      </Container>
    </div>
  );
}

export { PageHero };
export type { Crumb };
