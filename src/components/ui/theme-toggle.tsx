"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { useIsHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Segmented light / dark / system switch. Renders a stable placeholder until
 * mount so server and client markup never diverge.
 */
function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useIsHydrated();

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-card/70 p-0.5 backdrop-blur",
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={active}
            title={`${option.label} theme`}
            className={cn(
              "grid size-7 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
            <span className="sr-only">{option.label} theme</span>
          </button>
        );
      })}
    </div>
  );
}

export { ThemeToggle };
