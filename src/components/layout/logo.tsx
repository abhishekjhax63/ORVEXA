import Link from "next/link";

import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

/** ORVEXA wordmark: a heartbeat pulse inside a shield. */
function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(140deg,var(--brand-from),var(--brand-to))] shadow-[var(--shadow-glow)]",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-5 text-white" fill="none">
        <path
          d="M16 4.5c5.6 0 10 3.5 10 8.3 0 4.3-3.2 7.9-7.6 9.8L16 28l-2.4-5.4C9.2 20.7 6 17.1 6 12.8c0-4.8 4.4-8.3 10-8.3Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
          opacity="0.55"
        />
        <path
          d="M9.5 14.4h3.1l1.7-3.4 2.3 6.8 1.6-3.4h3.8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-xl focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
      aria-label={`${siteConfig.name} home`}
    >
      <LogoMark className="transition-transform duration-300 group-hover:scale-105" />
      <span className="flex flex-col leading-none">
        <span className="text-[1.05rem] font-semibold tracking-[0.16em]">ORVEXA</span>
        <span className="mt-1 text-[0.6rem] font-medium tracking-[0.22em] text-muted-foreground uppercase">
          Health ecosystem
        </span>
      </span>
    </Link>
  );
}

export { Logo, LogoMark };
