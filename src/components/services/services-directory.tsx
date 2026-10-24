"use client";

import { useMemo, useState } from "react";
import { PackageSearch, Search, X } from "lucide-react";

import { ServiceCard } from "@/components/services/service-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { careServices, serviceCategories } from "@/data/services";
import { useIsHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

type CategoryId = (typeof serviceCategories)[number]["id"];

/**
 * Client-side service directory. Filtering runs locally over the typed demo
 * catalogue; swapping in a server query later only changes the data source.
 */
function ServicesDirectory() {
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");
  // Skeletons cover the window before the filter controls become interactive.
  const hydrated = useIsHydrated();

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return careServices.filter((service) => {
      const matchesCategory = category === "all" || service.category === category;
      if (!matchesCategory) return false;
      if (!needle) return true;
      return (
        service.title.toLowerCase().includes(needle) ||
        service.summary.toLowerCase().includes(needle) ||
        service.highlights.some((highlight) => highlight.toLowerCase().includes(needle))
      );
    });
  }, [category, query]);

  const filtersActive = category !== "all" || query.trim().length > 0;

  function reset() {
    setCategory("all");
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="service-filter" className="sr-only">
              Filter services
            </label>
            <Input
              id="service-filter"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter services, e.g. ambulance, refill, second opinion"
              className="pl-10"
            />
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{results.length}</span> of {careServices.length} modules
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {serviceCategories.map((option) => {
            const active = option.id === category;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(option.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {!hydrated ? (
        <SkeletonList count={6} label="Loading the service directory" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No services match those filters"
          description="Try a different keyword, or clear the filters to see every ORVEXA care module again."
          action={
            <Button variant="gradient" onClick={reset}>
              <X aria-hidden />
              Clear filters
            </Button>
          }
          secondaryAction={
            <Button asChild variant="outline">
              <a href="/help">Get help finding care</a>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {results.map((service) => (
            <li key={service.slug} className="h-full">
              <ServiceCard service={service} />
            </li>
          ))}
        </ul>
      )}

      {filtersActive && results.length > 0 ? (
        <div>
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
            <X aria-hidden />
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export { ServicesDirectory };
