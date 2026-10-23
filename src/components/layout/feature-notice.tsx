import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

import { cn } from "@/lib/utils";

type FeatureNoticeProps = {
  /** Short heading naming the area, e.g. "Appointments". */
  title: string;
  /** Plain-language description of exactly what is not built yet. */
  description: string;
  /** Optional list of what will live here, so the page still informs. */
  planned?: string[];
  /** Optional override for the leading icon. */
  icon?: LucideIcon;
  className?: string;
};

/**
 * The honest stand-in for a workspace area that exists in navigation but has no
 * implementation yet.
 *
 * It exists so a placeholder never invents records, tables or queues: it says
 * what is missing, what the area will hold once it is built, and nothing that
 * could be mistaken for live data. Rendered as a labelled region with a real
 * heading so assistive technology announces it like any other section.
 */
function FeatureNotice({ title, description, planned, icon: Icon = Construction, className }: FeatureNoticeProps) {
  return (
    <section
      aria-labelledby="feature-notice-title"
      className={cn(
        "rounded-2xl border border-dashed border-primary/35 bg-primary-soft/60 px-6 py-8 sm:px-8 sm:py-10",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-11 items-center justify-center rounded-xl bg-card text-primary shadow-[var(--shadow-soft)]"
      >
        <Icon className="size-5" />
      </span>
      <h2 id="feature-notice-title" className="mt-5 text-lg font-semibold sm:text-xl">
        {title} is not available yet
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      {planned && planned.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            What will live here
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
            {planned.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export { FeatureNotice };
