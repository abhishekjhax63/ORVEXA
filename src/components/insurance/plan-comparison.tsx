"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Info, Scale, SlidersHorizontal, Star, X } from "lucide-react";
import { toast } from "sonner";

import { RequestDialog, type RequestField } from "@/components/forms/request-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Label, Select } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { insurancePlans } from "@/data/insurance";
import { hospitals } from "@/data/providers";
import { useIsHydrated } from "@/hooks/use-hydrated";
import { cn, formatINR } from "@/lib/utils";
import type { InsurancePlan } from "@/types";

const MAX_COMPARE = 3;

const coverOptions = [
  { value: "0", label: "Any cover amount" },
  { value: "500000", label: "₹5 lakh and above" },
  { value: "1000000", label: "₹10 lakh and above" },
  { value: "1500000", label: "₹15 lakh and above" },
  { value: "3000000", label: "₹30 lakh and above" },
];

const premiumOptions = [
  { value: "0", label: "Any premium" },
  { value: "10000", label: "Under ₹10,000 a year" },
  { value: "15000", label: "Under ₹15,000 a year" },
  { value: "25000", label: "Under ₹25,000 a year" },
  { value: "50000", label: "Under ₹50,000 a year" },
];

const networkOptions = [
  { value: "0", label: "Any network size" },
  { value: "5000", label: "5,000+ hospitals" },
  { value: "8000", label: "8,000+ hospitals" },
  { value: "10000", label: "10,000+ hospitals" },
];

const coverChoices = [
  { amount: 500000, label: "₹5 lakh" },
  { amount: 1000000, label: "₹10 lakh" },
  { amount: 1500000, label: "₹15 lakh" },
  { amount: 3000000, label: "₹30 lakh" },
];

const hospitalCities = Array.from(new Set(hospitals.map((hospital) => hospital.city))).sort();

function coverLabel(amount: number) {
  return coverChoices.find((choice) => choice.amount === amount)?.label ?? "₹10 lakh";
}

function buildQuoteFields(plan: InsurancePlan): RequestField[] {
  return [
    {
      name: "fullName",
      label: "Full name",
      placeholder: "As it should appear on the policy",
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
    { name: "city", label: "City", type: "select", options: hospitalCities, required: true },
    {
      name: "cover",
      label: "Cover amount needed",
      type: "select",
      options: coverChoices.map((choice) => choice.label),
      defaultValue: coverLabel(plan.coverAmount),
      required: true,
      description: `Preselected from ${plan.planName}.`,
    },
    {
      name: "notes",
      label: "Anything we should know?",
      type: "textarea",
      placeholder: "Age of members, existing conditions, cover already held",
    },
  ];
}

/**
 * Plan comparison for the insurance page. Every filter, the compare selection
 * and the side-by-side table run client-side over the typed demo plan data; no
 * insurer system is contacted in Phase 1.
 */
function PlanComparison() {
  const [cover, setCover] = useState("0");
  const [premium, setPremium] = useState("0");
  const [network, setNetwork] = useState("0");
  const [hospitalId, setHospitalId] = useState("");
  const [cashlessOnly, setCashlessOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const hydrated = useIsHydrated();

  const chosenHospital = hospitals.find((hospital) => hospital.id === hospitalId) ?? null;

  const results = useMemo(() => {
    const minCover = Number(cover);
    const maxPremium = Number(premium);
    const minNetwork = Number(network);

    return insurancePlans.filter((plan) => {
      if (minCover && plan.coverAmount < minCover) return false;
      if (maxPremium && plan.premiumPerYear > maxPremium) return false;
      if (minNetwork && plan.cashlessHospitals < minNetwork) return false;
      if (cashlessOnly) {
        if (!chosenHospital || !chosenHospital.cashlessInsurance) return false;
        if (plan.cashlessHospitals === 0) return false;
      }
      return true;
    });
  }, [cover, premium, network, cashlessOnly, chosenHospital]);

  const selectedPlans = useMemo(
    () =>
      selected
        .map((id) => insurancePlans.find((plan) => plan.id === id))
        .filter((plan): plan is InsurancePlan => plan !== undefined),
    [selected],
  );

  const filtersActive = cover !== "0" || premium !== "0" || network !== "0" || cashlessOnly || hospitalId !== "";

  function reset() {
    setCover("0");
    setPremium("0");
    setNetwork("0");
    setHospitalId("");
    setCashlessOnly(false);
  }

  function toggleCompare(plan: InsurancePlan) {
    setSelected((current) => {
      if (current.includes(plan.id)) return current.filter((id) => id !== plan.id);
      if (current.length >= MAX_COMPARE) {
        toast.error(`You can compare up to ${MAX_COMPARE} plans. Remove one to add ${plan.planName}.`);
        return current;
      }
      return [...current, plan.id];
    });
  }

  const noCashlessAtHospital = cashlessOnly && chosenHospital !== null && chosenHospital.cashlessInsurance === false;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-cover" className="text-xs tracking-wide text-muted-foreground uppercase">
              Cover amount
            </Label>
            <Select id="plan-cover" value={cover} onChange={(event) => setCover(event.target.value)}>
              {coverOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-premium" className="text-xs tracking-wide text-muted-foreground uppercase">
              Annual premium
            </Label>
            <Select id="plan-premium" value={premium} onChange={(event) => setPremium(event.target.value)}>
              {premiumOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-network" className="text-xs tracking-wide text-muted-foreground uppercase">
              Cashless network
            </Label>
            <Select id="plan-network" value={network} onChange={(event) => setNetwork(event.target.value)}>
              {networkOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-hospital" className="text-xs tracking-wide text-muted-foreground uppercase">
              My hospital
            </Label>
            <Select id="plan-hospital" value={hospitalId} onChange={(event) => setHospitalId(event.target.value)}>
              <option value="">Any hospital</option>
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name} — {hospital.city}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-2.5">
            <Switch
              id="cashless-only"
              checked={cashlessOnly}
              onCheckedChange={setCashlessOnly}
              disabled={!hospitalId}
              aria-describedby="cashless-only-hint"
            />
            <Label htmlFor="cashless-only" className="text-sm">
              Sample network data for this hospital
            </Label>
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{results.length}</span> of {insurancePlans.length} plans
          </p>
        </div>

        <p id="cashless-only-hint" className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {hospitalId
            ? `Cashless status for ${chosenHospital?.name} is not verified. These sample plans cannot determine eligibility.`
            : "Choose a hospital to filter the illustrative network figures; this does not verify cashless eligibility."}
        </p>

        {filtersActive ? (
          <div className="border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
              <X aria-hidden />
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>

      {!hydrated ? (
        <SkeletonList count={6} label="Loading the plan comparison" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Scale}
          title={
            noCashlessAtHospital
              ? `${chosenHospital?.name} is not listed in the sample network figures`
              : "No plans match those filters"
          }
          description={
            noCashlessAtHospital
              ? "This sample catalogue cannot determine whether a claim would be cashless or reimbursed. Clear the filter to review the sample plans."
              : "Adjust the sample filters to review more illustrative plan entries."
          }
          action={
            <Button variant="gradient" onClick={reset}>
              <X aria-hidden />
              Clear filters
            </Button>
          }
          secondaryAction={
            <Button asChild variant="outline">
              <Link href="/contact">Ask the care desk</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {results.map((plan) => {
            const isSelected = selected.includes(plan.id);
            return (
              <li key={plan.id} className="h-full">
                <article
                  className={cn(
                    "flex h-full flex-col gap-5 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]",
                    isSelected ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
                  )}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{plan.provider}</Badge>
                      <Badge variant="outline">{plan.coverType}</Badge>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold">{plan.planName}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{plan.bestFor}</p>
                  </div>

                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Sum insured</p>
                      <p className="text-xl font-semibold">{formatINR(plan.coverAmount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Premium</p>
                      <p className="text-xl font-semibold">{formatINR(plan.premiumPerYear)}</p>
                      <p className="text-xs text-muted-foreground">per year</p>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card-elevated p-3.5 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Sample network count</dt>
                      <dd className="mt-0.5 font-semibold">
                        {plan.cashlessHospitals > 0 ? plan.cashlessHospitals.toLocaleString("en-IN") : "Not offered"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Waiting period</dt>
                      <dd className="mt-0.5 font-semibold">{plan.waitingPeriodMonths} months</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Claim settlement</dt>
                      <dd className="mt-0.5 font-semibold">{plan.claimSettlementRatio}%</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Rating</dt>
                      <dd className="mt-0.5 flex items-center gap-1 font-semibold">
                        <Star aria-hidden className="size-3 fill-amber-400 text-amber-400" />
                        {plan.rating}
                      </dd>
                    </div>
                  </dl>

                  <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
                    {plan.features.slice(0, 3).map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto flex flex-col gap-4 border-t border-border pt-4">
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        id={`compare-${plan.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleCompare(plan)}
                      />
                      <Label htmlFor={`compare-${plan.id}`} className="text-xs text-muted-foreground">
                        Add to compare
                      </Label>
                    </div>
                    <RequestDialog
                      triggerLabel="Preview quote form"
                      triggerVariant="soft"
                      triggerSize="sm"
                      title={`Get a quote — ${plan.planName}`}
                      description={`${plan.provider} · ${plan.coverType} · ${formatINR(plan.coverAmount)} cover. This sample plan is not an offer; no insurer quote service is connected.`}
                      fields={buildQuoteFields(plan)}
                      footnote="Do not enter real personal or policy details. This browser-only preview does not query an insurer, request a quote or transmit your information."
                    />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {selectedPlans.length >= 2 ? (
        <section
          aria-labelledby="comparison-heading"
          className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="comparison-heading" className="flex items-center gap-2 text-lg font-semibold">
              <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" />
              Comparing {selectedPlans.length} plans
            </h3>
            <Button variant="outline" size="sm" onClick={() => setSelected([])}>
              <X aria-hidden />
              Clear comparison
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <caption className="sr-only">
                Side-by-side comparison of the selected health insurance plans across cover amount, annual premium,
                cashless network hospitals, waiting period, room-rent limit, co-payment and key features. All figures are
                illustrative Phase 1 samples.
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Plan
                  </th>
                  {selectedPlans.map((plan) => (
                    <th key={plan.id} scope="col" className="px-3 py-3 text-left align-top">
                      <span className="block text-sm font-semibold">{plan.planName}</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{plan.provider}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <th scope="row" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
                    Cover amount
                  </th>
                  {selectedPlans.map((plan) => (
                    <td key={plan.id} className="px-3 py-3 align-top font-semibold">
                      {formatINR(plan.coverAmount)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
                    Annual premium
                  </th>
                  {selectedPlans.map((plan) => (
                    <td key={plan.id} className="px-3 py-3 align-top">
                      {formatINR(plan.premiumPerYear)}
                      <span className="block text-xs text-muted-foreground">per year</span>
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
                    Cashless network hospitals
                  </th>
                  {selectedPlans.map((plan) => (
                    <td key={plan.id} className="px-3 py-3 align-top">
                      {plan.cashlessHospitals > 0
                        ? `${plan.cashlessHospitals.toLocaleString("en-IN")} hospitals`
                        : "Not offered on this plan"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
                    Waiting period
                  </th>
                  {selectedPlans.map((plan) => (
                    <td key={plan.id} className="px-3 py-3 align-top">
                      {plan.waitingPeriodMonths} months
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
                    Room-rent limit
                  </th>
                  {selectedPlans.map((plan) => (
                    <td key={plan.id} className="px-3 py-3 align-top">
                      {plan.features.find((feature) => /room[- ]?rent/i.test(feature)) ??
                        "Not specified in the plan listing"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
                    Co-payment
                  </th>
                  {selectedPlans.map((plan) => (
                    <td key={plan.id} className="px-3 py-3 align-top">
                      {plan.features.find((feature) => /co-?pay/i.test(feature)) ?? "Not specified in the plan listing"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
                    Key features
                  </th>
                  {selectedPlans.map((plan) => (
                    <td key={plan.id} className="px-3 py-3 align-top">
                      <ul className="flex flex-col gap-1.5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2">
                            <Check aria-hidden className="mt-0.5 size-3 shrink-0 text-success" />
                            <span className="text-xs leading-relaxed">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Room-rent limits and co-payment terms are shown only where the plan listing states them. Confirm both in the
            policy wording before you buy.
          </p>
        </section>
      ) : (
        <EmptyState
          icon={Scale}
          title="Select two plans to compare them side by side"
          description="Tick “Add to compare” on up to three plans. The comparison then lines up cover, premium, cashless network size, waiting periods and the terms that decide most claims."
          action={
            <Button variant="gradient" onClick={() => setSelected(insurancePlans.slice(0, 2).map((plan) => plan.id))}>
              Compare the first two plans
            </Button>
          }
          secondaryAction={
            <Button asChild variant="outline">
              <Link href="/help">Read the claims guide</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

export { PlanComparison };
