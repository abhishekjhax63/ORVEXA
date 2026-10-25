"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  FileText,
  Info,
  Lock,
  Minus,
  Pill,
  Plus,
  Search,
  SearchX,
  ShoppingCart,
  SlidersHorizontal,
  Trash,
  X,
} from "lucide-react";

import { RequestDialog } from "@/components/forms/request-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { medicineCategories, medicines } from "@/data/pharmacy";
import { useIsHydrated } from "@/hooks/use-hydrated";
import { cn, formatINR } from "@/lib/utils";
import type { Medicine, StockStatus } from "@/types";

type SortKey = "relevance" | "price-asc" | "discount" | "name";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "discount", label: "Highest discount" },
  { value: "name", label: "Name: A to Z" },
];

const stockMeta: Record<StockStatus, { label: string; variant: "success" | "warning" | "emergency" }> = {
  "in-stock": { label: "In stock", variant: "success" },
  "low-stock": { label: "Low stock", variant: "warning" },
  "out-of-stock": { label: "Out of stock", variant: "emergency" },
};

function discountOf(medicine: Medicine) {
  return Math.round(((medicine.mrp - medicine.price) / medicine.mrp) * 100);
}

type CartEntry = { medicine: Medicine; quantity: number };

/**
 * MediCare catalogue browser. Search, category filtering, sorting and the cart
 * all run client-side over the sample inventory. Checkout is not connected and
 * says so instead of faking a confirmed order.
 */
function MedicineBrowser() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  // Skeleton list covers the window before the filter controls become interactive.
  const hydrated = useIsHydrated();

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = medicines.filter((medicine) => {
      if (category !== "all" && medicine.categoryId !== category) return false;
      if (!needle) return true;
      return (
        medicine.name.toLowerCase().includes(needle) ||
        medicine.composition.toLowerCase().includes(needle) ||
        medicine.brand.toLowerCase().includes(needle)
      );
    });

    return filtered.sort((a, b) => {
      if (sort === "price-asc") return a.price - b.price;
      if (sort === "discount") return discountOf(b) - discountOf(a);
      if (sort === "name") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [query, category, sort]);

  const cartItems = useMemo<CartEntry[]>(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => {
          const medicine = medicines.find((item) => item.id === id);
          return medicine ? { medicine, quantity } : null;
        })
        .filter((entry): entry is CartEntry => entry !== null),
    [cart],
  );

  const itemCount = cartItems.reduce((total, entry) => total + entry.quantity, 0);
  const subtotal = cartItems.reduce((total, entry) => total + entry.medicine.price * entry.quantity, 0);
  const mrpTotal = cartItems.reduce((total, entry) => total + entry.medicine.mrp * entry.quantity, 0);
  const savings = mrpTotal - subtotal;

  const filtersActive = category !== "all" || query.trim().length > 0;

  function addToCart(id: string) {
    setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }

  function increment(id: string) {
    setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }

  function decrement(id: string) {
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[id] ?? 1) - 1;
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
  }

  function removeLine(id: string) {
    setCart((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function resetFilters() {
    setQuery("");
    setCategory("all");
    setSort("relevance");
  }

  const cartAnnouncement =
    itemCount === 0
      ? "Cart is empty."
      : `Cart updated. ${itemCount} ${itemCount === 1 ? "item" : "items"}, subtotal ${formatINR(subtotal)}.`;

  return (
    <div className="flex flex-col gap-6">
      <p role="status" aria-live="polite" className="sr-only">
        {cartAnnouncement}
      </p>

      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <label htmlFor="medicine-search" className="sr-only">
              Search medicines
            </label>
            <Input
              id="medicine-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, composition or manufacturer, e.g. metformin"
              className="pl-10"
            />
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{results.length}</span> of {medicines.length} medicines
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              category === "all"
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
            )}
          >
            All categories
          </button>
          {medicineCategories.map((option) => {
            const active = option.id === category;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(option.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
                )}
              >
                <option.icon aria-hidden className="size-3.5" />
                {option.name}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" />
            <Label htmlFor="medicine-sort" className="text-xs tracking-wide text-muted-foreground uppercase">
              Sort
            </Label>
            <Select
              id="medicine-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-9 w-auto min-w-40 text-xs"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          {filtersActive ? (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="ml-auto text-muted-foreground">
              <X aria-hidden />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start">
        <div>
          {!hydrated ? (
            <SkeletonList count={6} label="Loading the MediCare catalogue" />
          ) : results.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No medicines match those filters"
              description="Try a different spelling, or clear the filters to see the full sample catalogue again."
              action={
                <Button variant="gradient" onClick={resetFilters}>
                  <X aria-hidden />
                  Clear filters
                </Button>
              }
              secondaryAction={
                <Button asChild variant="outline">
                  <Link href="/help#pharmacy">Ask the pharmacy desk</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2">
              {results.map((medicine) => {
                const quantity = cart[medicine.id] ?? 0;
                const outOfStock = medicine.stock === "out-of-stock";
                const stock = stockMeta[medicine.stock];
                const discount = discountOf(medicine);

                return (
                  <li key={medicine.id} className="h-full">
                    <article className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
                      <div className="flex items-start gap-4">
                        <span
                          aria-hidden
                          className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
                        >
                          <Pill className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm leading-snug font-semibold">{medicine.name}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">{medicine.brand}</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                        <p className="leading-relaxed">{medicine.composition}</p>
                        <p>
                          {medicine.form} · {medicine.packSize}
                        </p>
                        <p>Delivery: {medicine.deliveryEta}</p>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={stock.variant}>{stock.label}</Badge>
                        {medicine.prescriptionRequired ? (
                          <Badge variant="emergency">
                            <FileText aria-hidden />
                            Prescription required
                          </Badge>
                        ) : (
                          <Badge variant="neutral">Over the counter</Badge>
                        )}
                      </div>

                      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4">
                        <div>
                          <p className="text-base font-semibold">{formatINR(medicine.price)}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="line-through">{formatINR(medicine.mrp)}</span>
                            <span className="ml-1.5 font-medium text-success">{discount}% off</span>
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={quantity > 0 ? "soft" : "gradient"}
                          disabled={outOfStock}
                          onClick={() => addToCart(medicine.id)}
                        >
                          <Plus aria-hidden />
                          Add to cart
                        </Button>
                      </div>

                      {outOfStock ? (
                        <p className="text-xs font-medium text-emergency">
                          Unavailable right now — we will alert you when this returns to stock.
                        </p>
                      ) : quantity > 0 ? (
                        <p className="text-xs font-medium text-primary">In cart: {quantity}</p>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside
          aria-label="Medicine cart"
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] lg:sticky lg:top-24"
        >
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
              <ShoppingCart className="size-4.5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Your cart</p>
              <p className="text-xs text-muted-foreground">
                {itemCount === 0 ? "No items yet" : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}
              </p>
            </div>
            <Badge variant="neutral" className="ml-auto">
              Sample data
            </Badge>
          </div>

          {itemCount === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              size="compact"
              title="Your cart is empty"
              description="Add a sample item to preview the local cart. Nothing is ordered, charged or delivered."
              secondaryAction={
                <Button asChild variant="outline" size="sm">
                  <Link href="/help#pharmacy">Prescription help</Link>
                </Button>
              }
            />
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-border">
                <AnimatePresence initial={false}>
                  {cartItems.map(({ medicine, quantity }) => (
                    <motion.li
                      key={medicine.id}
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: reduceMotion ? 0 : 0.2 }}
                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{medicine.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {medicine.packSize} · {formatINR(medicine.price)} each
                          </p>
                        </div>
                        <p className="text-sm font-semibold">{formatINR(medicine.price * quantity)}</p>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="icon-sm"
                            variant="outline"
                            onClick={() => decrement(medicine.id)}
                            aria-label={`Decrease quantity of ${medicine.name}`}
                          >
                            <Minus aria-hidden />
                          </Button>
                          <span aria-live="polite" className="w-8 text-center text-sm font-medium tabular-nums">
                            {quantity}
                          </span>
                          <Button
                            size="icon-sm"
                            variant="outline"
                            onClick={() => increment(medicine.id)}
                            aria-label={`Increase quantity of ${medicine.name}`}
                          >
                            <Plus aria-hidden />
                          </Button>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => removeLine(medicine.id)}
                          aria-label={`Remove ${medicine.name} from cart`}
                          className="text-muted-foreground"
                        >
                          <Trash aria-hidden />
                        </Button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>

              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{formatINR(subtotal)}</span>
                </div>
                {savings > 0 ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">You save vs MRP</span>
                    <span className="font-medium text-success">{formatINR(savings)}</span>
                  </div>
                ) : null}
                <Button variant="gradient" onClick={() => setCheckoutOpen(true)} className="mt-1 w-full">
                  <Lock aria-hidden />
                  Proceed to checkout
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Checkout and payment are not connected.
                </p>
              </div>
            </>
          )}
        </aside>
      </div>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checkout is not live yet</DialogTitle>
            <DialogDescription>
              MediCare ordering, payments and delivery tracking are not connected. Your
              cart lives in this browser only — no order is placed, no pharmacist is assigned and no payment is taken.
            </DialogDescription>
          </DialogHeader>

          <p className="flex items-start gap-2 rounded-xl border border-dashed border-warning/40 bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-warning">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {itemCount} {itemCount === 1 ? "item" : "items"} worth {formatINR(subtotal)} are held in your cart. Nothing
            has been transmitted.
          </p>

          <div className="flex flex-col gap-3">
            <RequestDialog
              triggerLabel="Preview the reminder form"
              triggerSize="lg"
              triggerClassName="w-full"
              title="Pharmacy reminder form preview"
              description="This local preview does not register a reminder or send a message. Do not enter real contact details."
              fields={[
                {
                  name: "patientName",
                  label: "Your name",
                  placeholder: "Full name",
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
                },
                {
                  name: "pinCode",
                  label: "Delivery pin code",
                  placeholder: "560038",
                  description: "We only alert pin codes that MediCare can serve.",
                },
              ]}
              footnote="Do not enter real contact details. This prototype has no notification backend."
            />
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/help#pharmacy">
                Read the pharmacy help pages
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { MedicineBrowser };
