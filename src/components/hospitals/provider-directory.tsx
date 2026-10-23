"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, SearchX, SlidersHorizontal, X } from "lucide-react";

import { RequestDialog } from "@/components/forms/request-dialog";
import { buildDoctorFields, buildHospitalFields } from "@/components/hospitals/booking-fields";
import { DoctorCard, HospitalCard } from "@/components/provider/provider-cards";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { cities, doctors, hospitals, specialties } from "@/data/providers";
import { cn } from "@/lib/utils";

type View = "hospitals" | "doctors";
type SortKey = "recommended" | "rating" | "distance" | "price";

const cityOptions = cities.filter((city) => city !== "All cities");

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "rating", label: "Highest rated" },
  { value: "distance", label: "Nearest first" },
  { value: "price", label: "Lowest cost" },
];

type ProviderDirectoryProps = {
  initialQuery?: string;
  initialCity?: string;
  initialSpecialty?: string;
  initialView?: View;
};

/**
 * Provider discovery for hospitals and doctors. Filtering, sorting and the
 * booking request flow all run client-side over the typed demo directory.
 */
function ProviderDirectory({
  initialQuery = "",
  initialCity = "",
  initialSpecialty = "",
  initialView = "hospitals",
}: ProviderDirectoryProps) {
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const [specialty, setSpecialty] = useState(initialSpecialty);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [cashlessOnly, setCashlessOnly] = useState(false);
  const [teleconsultOnly, setTeleconsultOnly] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  const hospitalResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = hospitals.filter((hospital) => {
      if (city && hospital.city !== city) return false;
      if (specialty && !hospital.specialties.some((item) => item.toLowerCase().includes(specialty.toLowerCase())))
        return false;
      if (emergencyOnly && !hospital.emergency24x7) return false;
      if (cashlessOnly && !hospital.cashlessInsurance) return false;
      if (teleconsultOnly && !hospital.teleconsult) return false;
      if (!needle) return true;
      return (
        hospital.name.toLowerCase().includes(needle) ||
        hospital.city.toLowerCase().includes(needle) ||
        hospital.locality.toLowerCase().includes(needle) ||
        hospital.specialties.some((item) => item.toLowerCase().includes(needle))
      );
    });

    return filtered.sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "distance") return a.distanceKm - b.distanceKm;
      if (sort === "price") return a.priceTier - b.priceTier;
      return b.rating * b.reviewCount - a.rating * a.reviewCount;
    });
  }, [query, city, specialty, sort, emergencyOnly, cashlessOnly, teleconsultOnly]);

  const doctorResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = doctors.filter((doctor) => {
      if (city && doctor.city !== city) return false;
      if (specialty && !doctor.specialty.toLowerCase().includes(specialty.toLowerCase())) return false;
      if (teleconsultOnly && !doctor.modes.includes("video") && !doctor.modes.includes("chat")) return false;
      if (!needle) return true;
      return (
        doctor.name.toLowerCase().includes(needle) ||
        doctor.specialty.toLowerCase().includes(needle) ||
        doctor.hospitalName.toLowerCase().includes(needle) ||
        doctor.city.toLowerCase().includes(needle)
      );
    });

    return filtered.sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "price") return a.consultationFee - b.consultationFee;
      if (sort === "distance") return a.experienceYears - b.experienceYears;
      return b.rating * b.reviewCount - a.rating * a.reviewCount;
    });
  }, [query, city, specialty, sort, teleconsultOnly]);

  const filtersActive =
    Boolean(query.trim()) || Boolean(city) || Boolean(specialty) || emergencyOnly || cashlessOnly || teleconsultOnly;

  const activeCount = view === "hospitals" ? hospitalResults.length : doctorResults.length;
  const totalCount = view === "hospitals" ? hospitals.length : doctors.length;

  function reset() {
    setQuery("");
    setCity("");
    setSpecialty("");
    setEmergencyOnly(false);
    setCashlessOnly(false);
    setTeleconsultOnly(false);
    setSort("recommended");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose what to search">
          {(
            [
              { id: "hospitals", label: `Hospitals & clinics (${hospitals.length})` },
              { id: "doctors", label: `Doctors (${doctors.length})` },
            ] as const
          ).map((option) => {
            const active = view === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setView(option.id)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
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

        <div className="grid gap-4 lg:grid-cols-4">
          <div className="flex flex-col gap-2 lg:col-span-2">
            <Label htmlFor="provider-query" className="text-xs tracking-wide text-muted-foreground uppercase">
              Search
            </Label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="provider-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  view === "hospitals" ? "Hospital, locality or speciality" : "Doctor, speciality or hospital"
                }
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="provider-city" className="text-xs tracking-wide text-muted-foreground uppercase">
              City
            </Label>
            <Select id="provider-city" value={city} onChange={(event) => setCity(event.target.value)}>
              <option value="">Any city</option>
              {cityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="provider-specialty" className="text-xs tracking-wide text-muted-foreground uppercase">
              Speciality
            </Label>
            <Select id="provider-specialty" value={specialty} onChange={(event) => setSpecialty(event.target.value)}>
              <option value="">Any speciality</option>
              {specialties.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" />
            <Label htmlFor="provider-sort" className="text-xs tracking-wide text-muted-foreground uppercase">
              Sort
            </Label>
            <Select
              id="provider-sort"
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

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick filters">
            {view === "hospitals" ? (
              <>
                <FilterChip active={emergencyOnly} onClick={() => setEmergencyOnly((value) => !value)}>
                  24×7 emergency
                </FilterChip>
                <FilterChip active={cashlessOnly} onClick={() => setCashlessOnly((value) => !value)}>
                  Cashless insurance
                </FilterChip>
              </>
            ) : null}
            <FilterChip active={teleconsultOnly} onClick={() => setTeleconsultOnly((value) => !value)}>
              Teleconsult available
            </FilterChip>
          </div>

          <p aria-live="polite" className="ml-auto text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{activeCount}</span> of {totalCount} matches
          </p>
        </div>
      </div>

      {!hydrated ? (
        <SkeletonList count={6} label="Loading providers" />
      ) : activeCount === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No providers match those filters"
          description="Widen the city or clear the speciality filter. Our care desk can also find a provider outside the network for you."
          action={
            <Button variant="gradient" onClick={reset}>
              <X aria-hidden />
              Clear filters
            </Button>
          }
          secondaryAction={
            <Button asChild variant="outline">
              <a href="/contact">Ask the care desk</a>
            </Button>
          }
        />
      ) : view === "hospitals" ? (
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {hospitalResults.map((hospital) => (
            <li key={hospital.id} className="h-full">
              <HospitalCard
                hospital={hospital}
                action={
                  <RequestDialog
                    triggerLabel="Book appointment"
                    triggerVariant="soft"
                    triggerSize="sm"
                    title={`Book at ${hospital.name}`}
                    description={`${hospital.type} · ${hospital.locality}, ${hospital.city}. Choose a department and a preferred date and the hospital confirms the slot.`}
                    fields={buildHospitalFields(hospital)}
                    submitLabel="Request appointment"
                    successTitle="Appointment request ready"
                    successBody={`${hospital.name} would receive your request for ${hospital.specialties[0]} with the preferred date you chose.`}
                    footnote="Phase 1 has no booking backend yet. This form validates your details and shows the confirmation state, but no request leaves your browser."
                  />
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {doctorResults.map((doctor) => (
            <li key={doctor.id} className="h-full">
              <DoctorCard
                doctor={doctor}
                action={
                  <RequestDialog
                    triggerLabel="Request slot"
                    triggerVariant="soft"
                    triggerSize="sm"
                    title={`Consult ${doctor.name}`}
                    description={`${doctor.specialty} · ${doctor.hospitalName}, ${doctor.city}. Next available slot: ${doctor.nextSlot}.`}
                    fields={buildDoctorFields(doctor)}
                    submitLabel="Request slot"
                    successTitle="Consultation request ready"
                    successBody={`${doctor.name} would receive your request with the symptoms you described and the preferred date you chose.`}
                    footnote="Phase 1 has no booking backend yet. This form validates your details and shows the confirmation state, but no request leaves your browser."
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}

      {filtersActive ? (
        <div>
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
            <X aria-hidden />
            Clear all filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active
          ? "border-transparent bg-primary-soft text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

export { ProviderDirectory };
