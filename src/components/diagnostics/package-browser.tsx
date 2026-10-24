"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, Check, Home, PackageSearch, Search, X } from "lucide-react";

import { RequestDialog, type RequestField } from "@/components/forms/request-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { diagnosticCategories, diagnosticPackages } from "@/data/diagnostics";
import { useIsHydrated } from "@/hooks/use-hydrated";
import { cn, formatINR } from "@/lib/utils";
import type { DiagnosticCategory, DiagnosticPackage } from "@/types";

type SortKey = "recommended" | "price" | "report" | "discount";
type CategoryId = "all" | DiagnosticCategory["id"];

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price", label: "Price: low to high" },
  { value: "report", label: "Fastest report" },
  { value: "discount", label: "Highest discount" },
];

const collectionSlots = ["6-8 AM", "8-10 AM", "10-12 PM", "4-6 PM", "6-8 PM"];

const categoryNames = new Map(diagnosticCategories.map((category) => [category.id, category.name]));

/** Discount is always derived from the listed price and MRP — never hard-coded. */
function discountPercent(pkg: DiagnosticPackage) {
  if (pkg.mrp <= pkg.price) return 0;
  return Math.round(((pkg.mrp - pkg.price) / pkg.mrp) * 100);
}

function reportHours(pkg: DiagnosticPackage) {
  return Number(pkg.reportTime.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
}

function buildCollectionFields(pkg: DiagnosticPackage): RequestField[] {
  return [
    {
      name: "patientName",
      label: "Patient name",
      placeholder: "Full name as per records",
      required: true,
      autoComplete: "name",
    },
    {
      name: "phone",
      label: "Mobile number",
      type: "tel",
      placeholder: "+91 98450 12093",
      required: true,
      autoComplete: "tel",
      description: "Used only to confirm the collection slot.",
    },
    {
      name: "pinCode",
      label: "PIN code",
      placeholder: "560103",
      required: true,
      description: pkg.homeCollection
        ? "Confirms home collection is available on your street."
        : "Lets us point you to the nearest partner centre.",
    },
    {
      name: "address",
      label: "Full address",
      type: "textarea",
      placeholder: "Flat, building, street and a landmark",
      required: true,
      description: pkg.homeCollection
        ? "The address the phlebotomist should reach."
        : "Used to route you to the closest collection centre.",
    },
    { name: "date", label: "Preferred date", type: "date", required: true },
    {
      name: "slot",
      label: "Preferred slot",
      type: "select",
      options: collectionSlots,
      defaultValue: collectionSlots[0],
      required: true,
      description: pkg.fastingRequired ? "Fasting is required, so an early slot usually works best." : undefined,
    },
    {
      name: "package",
      label: "Package",
      type: "select",
      options: [pkg.name],
      defaultValue: pkg.name,
      required: true,
    },
    {
      name: "notes",
      label: "Notes for the phlebotomist",
      type: "textarea",
      placeholder: "Known allergies, difficult veins or gate access",
    },
  ];
}

/**
 * Diagnostics package browser. Search, category chips, sorting and the
 * collection request all run client-side over the typed demo catalogue, so the
 * only change needed to go live is the data source.
 */
function PackageBrowser() {
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recommended");

  // Skeletons cover the window before the filter controls become interactive.
  const hydrated = useIsHydrated();

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = diagnosticPackages.filter((pkg) => {
      if (category !== "all" && pkg.category !== category) return false;
      if (!needle) return true;
      return (
        pkg.name.toLowerCase().includes(needle) ||
        pkg.description.toLowerCase().includes(needle) ||
        pkg.includes.some((test) => test.toLowerCase().includes(needle)) ||
        (categoryNames.get(pkg.category) ?? "").toLowerCase().includes(needle)
      );
    });

    const sorted = [...filtered];
    if (sort === "price") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "report") sorted.sort((a, b) => reportHours(a) - reportHours(b));
    else if (sort === "discount") sorted.sort((a, b) => discountPercent(b) - discountPercent(a));
    else sorted.sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)));
    return sorted;
  }, [category, query, sort]);

  const filtersActive = category !== "all" || query.trim().length > 0 || sort !== "recommended";

  function reset() {
    setCategory("all");
    setQuery("");
    setSort("recommended");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <label htmlFor="package-search" className="sr-only">
              Search packages and included tests
            </label>
            <Input
              id="package-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a package or a test, e.g. HbA1c, lipid, thyroid"
              className="pl-10"
            />
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{results.length}</span> of {diagnosticPackages.length}{" "}
            packages
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4" role="group" aria-label="Filter by category">
          {([{ id: "all", name: "All packages" }, ...diagnosticCategories] as { id: CategoryId; name: string }[]).map(
            (option) => {
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
                  {option.name}
                </button>
              );
            },
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <ArrowDownUp aria-hidden className="size-4 text-muted-foreground" />
            <Label htmlFor="package-sort" className="text-xs tracking-wide text-muted-foreground uppercase">
              Sort
            </Label>
            <Select
              id="package-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-9 w-auto min-w-44 text-xs"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          {filtersActive ? (
            <Button variant="ghost" size="sm" onClick={reset} className="ml-auto text-muted-foreground">
              <X aria-hidden />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {!hydrated ? (
        <SkeletonList count={6} label="Loading the package catalogue" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No packages match those filters"
          description="Try a different test name, or clear the filters to see the full catalogue again. The care desk can also build a custom panel for you."
          action={
            <Button variant="gradient" onClick={reset}>
              <X aria-hidden />
              Clear filters
            </Button>
          }
          secondaryAction={
            <Button asChild variant="outline">
              <Link href="/help">Ask the care desk</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {results.map((pkg) => {
            const discount = discountPercent(pkg);
            return (
              <li key={pkg.id} className="h-full">
                <article className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="neutral">{categoryNames.get(pkg.category) ?? pkg.category}</Badge>
                        {pkg.popular ? <Badge variant="default">Popular</Badge> : null}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold">{pkg.name}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-semibold">{formatINR(pkg.price)}</p>
                      <p className="text-xs text-muted-foreground line-through">{formatINR(pkg.mrp)}</p>
                      {discount > 0 ? (
                        <Badge variant="success" className="mt-1.5">
                          {discount}% off
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-muted-foreground">{pkg.description}</p>

                  <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card-elevated p-3.5 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Tests included</dt>
                      <dd className="mt-0.5 font-semibold">{pkg.testCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Report time</dt>
                      <dd className="mt-0.5 font-semibold">{pkg.reportTime}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Fasting</dt>
                      <dd className="mt-0.5 font-semibold">{pkg.fastingRequired ? "Required" : "Not required"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Sample collection</dt>
                      <dd className="mt-0.5 font-semibold">{pkg.homeCollection ? "Home or centre" : "At centre"}</dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2">
                    {pkg.homeCollection ? (
                      <Badge variant="success">
                        <Home aria-hidden />
                        Home collection
                      </Badge>
                    ) : (
                      <Badge variant="neutral">Partner centre visit</Badge>
                    )}
                    {pkg.fastingRequired ? <Badge variant="warning">Fasting required</Badge> : null}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-4">
                    <RequestDialog
                      triggerLabel={pkg.homeCollection ? "Book home collection" : "Request this package"}
                      triggerVariant="gradient"
                      triggerSize="sm"
                      title={
                        pkg.homeCollection
                          ? `Book home collection — ${pkg.name}`
                          : `Request ${pkg.name} at a centre`
                      }
                      description={
                        pkg.homeCollection
                          ? `${pkg.testCount} tests · ${pkg.reportTime}. Choose a slot and a certified phlebotomist is assigned to your address.`
                          : `${pkg.testCount} tests · ${pkg.reportTime}. This panel needs a visit to a partner centre; we confirm the closest one after you submit.`
                      }
                      fields={buildCollectionFields(pkg)}
                      submitLabel={pkg.homeCollection ? "Confirm collection" : "Request booking"}
                      successTitle="Collection request ready"
                      successBody={`A phlebotomist slot for ${pkg.name} would be held for the date and time you chose, with a confirmation on your mobile number.`}
                      footnote="Phase 1 has no laboratory backend yet. This form validates your details and shows the confirmation state, but no request leaves your browser."
                    />
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          View all {pkg.testCount} tests
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{pkg.name}</DialogTitle>
                          <DialogDescription>
                            {pkg.testCount} tests · {pkg.reportTime}. Headline markers are listed below; the complete
                            assay list is shared before collection.
                          </DialogDescription>
                        </DialogHeader>
                        <ul className="grid gap-2 sm:grid-cols-2">
                          {pkg.includes.map((test) => (
                            <li key={test} className="flex items-start gap-2 text-sm">
                              <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                              {test}
                            </li>
                          ))}
                        </ul>
                        <p className="rounded-xl border border-dashed border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
                          Test counts are indicative demo values for Phase 1 reviews.
                        </p>
                      </DialogContent>
                    </Dialog>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { PackageBrowser };
