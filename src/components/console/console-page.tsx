import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Presentational blocks shared by the console workspaces.
 *
 * These carry no data and no permissions: they exist so thirty queue pages do
 * not each invent their own header, metric tile and notice box. Every one of
 * them is a plain server component, so a workspace page can stay a `async`
 * function that loads its own data and hands it to these.
 */

function ConsolePageHeader({
  eyebrow,
  title,
  description,
  back,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6">
      {back ? (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-2">
          {eyebrow ? (
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">{eyebrow}</p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description ? <p className="text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

const STAT_TONES = {
  default: "text-foreground",
  positive: "text-success",
  caution: "text-warning",
  critical: "text-emergency",
  muted: "text-muted-foreground",
} as const;

function ConsoleStatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

/**
 * One number, its label and — always — what the number does not include. A
 * console that shows "0 pending" without saying whether it looked at every
 * record is worse than showing nothing, so the `hint` is a first-class prop.
 */
function ConsoleStat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof STAT_TONES;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card/70 p-4">
      <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", STAT_TONES[tone])}>{value}</p>
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const CALLOUT_TONES = {
  info: "border-primary/25 bg-primary-soft/50",
  success: "border-success/25 bg-success-soft/50",
  warning: "border-warning/30 bg-warning-soft/50",
  danger: "border-emergency/30 bg-emergency-soft/50",
} as const;

/**
 * A standing statement about the page — a service that is not configured, a
 * queue that is truncated, a decision that cannot be undone. Deliberately
 * plain: it is read, not dismissed.
 */
function ConsoleCallout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-2xl border px-4 py-3.5 text-sm leading-relaxed", CALLOUT_TONES[tone], className)}
    >
      <h2 className="font-semibold text-foreground">{title}</h2>
      <div className="mt-1.5 space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}

function ConsoleSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export { ConsoleCallout, ConsolePageHeader, ConsoleSection, ConsoleStat, ConsoleStatGrid };
