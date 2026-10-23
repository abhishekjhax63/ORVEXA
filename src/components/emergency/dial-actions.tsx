import { Siren } from "lucide-react";

import { emergencyConfig, dialHref, emergencyDialTargets } from "@/lib/emergency/config";
import { cn } from "@/lib/utils";

/**
 * Direct dial actions.
 *
 * A phone call is the only fallback that does not depend on this deployment, so
 * the numbers are always rendered — a missing env var changes the label, never
 * whether the number is reachable. When the release owner has not confirmed the
 * configured numbers for this region, the UI says so instead of hiding them.
 */
function DialActions({ className, compact = false }: { className?: string; compact?: boolean }) {
  const targets = emergencyDialTargets();

  return (
    <div className={cn("space-y-4", className)}>
      <ul className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {targets.map((target) => (
          <li key={target.channel}>
            <a
              href={dialHref(target.number)}
              className={cn(
                "flex h-full flex-col gap-1 rounded-2xl border-2 border-emergency/40 bg-emergency-soft px-5 text-left transition-colors",
                "hover:border-emergency hover:bg-emergency/15 focus-visible:ring-2 focus-visible:ring-emergency focus-visible:ring-offset-2 focus-visible:outline-none",
                compact ? "py-4" : "py-5",
              )}
            >
              <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-emergency uppercase">
                <Siren aria-hidden className="size-3.5" />
                {target.label}
              </span>
              <span className="text-3xl font-semibold text-emergency tabular-nums">{target.number}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{target.detail}</span>
            </a>
          </li>
        ))}
      </ul>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {emergencyConfig.numbersVerified ? (
          <>
            These numbers are confirmed for {emergencyConfig.label} for this release. A phone call reaches a human
            dispatcher directly, without going through ORVEXA.
          </>
        ) : (
          <>
            <strong className="font-semibold text-foreground">
              These numbers are published defaults for {emergencyConfig.label} and have not been confirmed for this
              release.
            </strong>{" "}
            Check the number for your state before relying on it. A phone call reaches a human dispatcher directly,
            without going through ORVEXA.
          </>
        )}
      </p>
    </div>
  );
}

export { DialActions };
