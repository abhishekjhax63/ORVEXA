import Link from "next/link";
import { ArrowRight, Check, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import type { CareService } from "@/types";

/** Accent treatments are mapped to static class names so Tailwind can see them. */
const accentStyles: Record<CareService["accent"], string> = {
  aqua: "bg-lime-100 text-lime-800 dark:bg-lime-400/15 dark:text-lime-300",
  teal: "bg-leaf-soft text-leaf-deep dark:bg-leaf-mid/15 dark:text-leaf-mid",
  cyan: "bg-mint-soft text-mint-deep dark:bg-mint-mid/15 dark:text-mint-mid",
  navy: "bg-forest-100 text-forest-800 dark:bg-forest-400/15 dark:text-forest-200",
};

function priceLabel(priceFrom: number | null) {
  if (priceFrom === null) return "Covered by insurance";
  if (priceFrom === 0) return "Free to start";
  return `From ${formatINR(priceFrom)}`;
}

/** Compact service tile used in the homepage grid and the services directory. */
function ServiceCard({ service, className }: { service: CareService; className?: string }) {
  return (
    <article
      className={`group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[var(--shadow-panel)] ${className ?? ""}`}
    >
      <span
        aria-hidden
        className={`grid size-12 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-105 ${accentStyles[service.accent]}`}
      >
        <service.icon className="size-6" />
      </span>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">
          <Link href={service.ctaHref} className="transition-colors hover:text-primary">
            {service.title}
          </Link>
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{service.summary}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {service.highlights.slice(0, 2).map((highlight) => (
          <li key={highlight} className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
            {highlight}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <Badge variant="default">{priceLabel(service.priceFrom)}</Badge>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock aria-hidden className="size-3.5" />
            {service.turnaround}
          </span>
        </p>
        <Button asChild variant="ghost" size="sm" className="w-fit px-0 text-primary hover:bg-transparent">
          <Link href={service.ctaHref}>
            {service.ctaLabel}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </article>
  );
}

/** Expanded service block used for in-page deep dives on the services directory. */
function ServiceDetailCard({ service, className }: { service: CareService; className?: string }) {
  return (
    <article
      className={`flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-7 ${className ?? ""}`}
    >
      <div className="flex items-start gap-4">
        <span aria-hidden className={`grid size-12 shrink-0 place-items-center rounded-2xl ${accentStyles[service.accent]}`}>
          <service.icon className="size-6" />
        </span>
        <div>
          <Badge variant="neutral" className="mb-2 capitalize">
            {service.category}
          </Badge>
          <h3 className="text-xl font-semibold">{service.title}</h3>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{service.description}</p>

      <ul className="flex flex-col gap-2.5">
        {service.highlights.map((highlight) => (
          <li key={highlight} className="flex items-start gap-2.5 text-sm">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            {highlight}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button asChild variant="gradient">
          <Link href={service.ctaHref}>
            {service.ctaLabel}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          {priceLabel(service.priceFrom)} · {service.turnaround}
        </p>
      </div>
    </article>
  );
}

export { ServiceCard, ServiceDetailCard, accentStyles, priceLabel };
