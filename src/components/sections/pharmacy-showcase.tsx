import Link from "next/link";
import { ArrowRight, Clock, Pill, Truck } from "lucide-react";

import { DemoNotice } from "@/components/layout/demo-notice";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { medicineCategories, medicines, pharmacyHighlights } from "@/data/pharmacy";
import { formatINR } from "@/lib/utils";

const featuredMedicines = medicines.slice(0, 3);

/** Homepage MediCare pharmacy block: catalogue entry, trust points and delivery promise. */
function PharmacyShowcaseSection() {
  return (
    <Section id="pharmacy" tone="muted" spacing="default">
      <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16">
        <div>
          <Reveal>
            <SectionHeading
              eyebrow="MediCare pharmacy"
              title="Prescriptions filled and delivered in 90 minutes"
              description="Upload a prescription once and MediCare handles verification, generic substitution, cold-chain packing and monthly refills — with a licensed pharmacist approving every order."
            />
          </Reveal>

          <Reveal className="mt-8" delay={0.05}>
            <ul className="grid gap-4 sm:grid-cols-2">
              {pharmacyHighlights.map((highlight) => (
                <li key={highlight.title} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
                  >
                    <highlight.icon className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{highlight.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{highlight.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="mt-8" delay={0.1}>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/pharmacy">
                  <Pill aria-hidden />
                  Browse MediCare
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/help#pharmacy">Prescription help</Link>
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="rounded-[1.75rem] border border-border bg-card shadow-[var(--shadow-lift)]">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
              <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
                <Truck className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Chronic care refill</p>
                <p className="text-xs text-muted-foreground">Indiranagar, Bengaluru · arriving today</p>
              </div>
              <Badge variant="success" className="ml-auto shrink-0">
                Out for delivery
              </Badge>
            </div>

            <ul className="divide-y divide-border">
              {featuredMedicines.map((medicine) => {
                const discount = Math.round(((medicine.mrp - medicine.price) / medicine.mrp) * 100);
                return (
                  <li key={medicine.id} className="flex items-center gap-4 px-5 py-4">
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-primary"
                    >
                      <Pill className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{medicine.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {medicine.packSize} · {medicine.brand}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatINR(medicine.price)}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="line-through">{formatINR(medicine.mrp)}</span>
                        <span className="ml-1.5 font-medium text-success">{discount}% off</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock aria-hidden className="size-3.5" />
                Express window: 90 minutes in metro pin codes
              </p>
              <Link
                href="/pharmacy"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline hover:underline-offset-4"
              >
                Shop all {medicineCategories.length} categories
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </div>
          </div>

          <DemoNotice className="mt-4">
            Medicines, prices, discount percentages and delivery status are sample data. MediCare ordering goes live
            with the pharmacy integration.
          </DemoNotice>
        </Reveal>
      </div>
    </Section>
  );
}

export { PharmacyShowcaseSection };
