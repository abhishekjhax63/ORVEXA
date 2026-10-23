import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Every screen that renders seeded demo content states this explicitly, so no
 * one mistakes placeholder data for a live provider network.
 */
function DemoNotice({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl border border-dashed border-warning/40 bg-warning-soft px-4 py-3 text-xs leading-relaxed text-warning",
        className,
      )}
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="font-semibold">Demo data.</span>{" "}
        {children ??
          "Providers, prices and availability on this screen are illustrative samples. Live data arrives once the provider APIs are connected."}
      </span>
    </p>
  );
}

export { DemoNotice };
