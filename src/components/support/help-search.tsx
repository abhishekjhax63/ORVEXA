"use client";

import { useMemo, useState } from "react";
import { SearchX, Search, X } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { faqs, helpTopics } from "@/data/support";
import { useIsHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

const categoryLabels = new Map(helpTopics.map((topic) => [topic.id, topic.title]));

/** Only offer chips for categories that actually have answers in the dataset. */
const categoryOptions = helpTopics
  .filter((topic) => faqs.some((faq) => faq.category === topic.id))
  .map((topic) => ({ id: topic.id, label: topic.title }));

const allOption = { id: "all", label: "All answers" };

/**
 * Client-side help centre search. Filtering runs locally over the typed FAQ
 * dataset; replacing it with a server query later only changes the data source.
 */
function HelpSearch() {
  const [category, setCategory] = useState(allOption.id);
  const [query, setQuery] = useState("");
  // Skeletons cover the window before the filter controls become interactive.
  const hydrated = useIsHydrated();

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return faqs.filter((faq) => {
      if (category !== allOption.id && faq.category !== category) return false;
      if (!needle) return true;
      return faq.question.toLowerCase().includes(needle) || faq.answer.toLowerCase().includes(needle);
    });
  }, [category, query]);

  const filtersActive = category !== allOption.id || query.trim().length > 0;

  function reset() {
    setCategory(allOption.id);
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <label htmlFor="help-search-input" className="sr-only">
              Search help articles
            </label>
            <Input
              id="help-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search answers, e.g. prescription, fasting, cashless, cold chain"
              className="pl-10"
            />
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{results.length}</span> of {faqs.length} answers
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
          {[allOption, ...categoryOptions].map((option) => {
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
        <SkeletonList count={4} label="Loading help articles" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No answers match that search"
          description="Try a broader word such as prescription, report, refund or claim — or clear the filters to browse every answer."
          action={
            <Button variant="gradient" onClick={reset}>
              <X aria-hidden />
              Clear filters
            </Button>
          }
          secondaryAction={
            <Button asChild variant="outline">
              <a href="#escalate">Ask the care desk instead</a>
            </Button>
          }
        />
      ) : (
        <Accordion type="multiple" className="flex flex-col gap-3">
          {results.map((faq) => (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger>{faq.question}</AccordionTrigger>
              <AccordionContent>
                <p>{faq.answer}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Topic: {categoryLabels.get(faq.category) ?? "Help centre"}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
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

export { HelpSearch };
