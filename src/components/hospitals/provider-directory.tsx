"use client";

import { useMemo, useState } from "react";
import { Search, SearchX, X } from "lucide-react";

import { DoctorCard, HospitalCard } from "@/components/provider/provider-cards";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { cities, doctors, hospitals, specialties } from "@/data/providers";
import { useIsHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

type View = "hospitals" | "doctors";

const cityOptions = cities.filter((city) => city !== "All cities");

type ProviderDirectoryProps = {
  initialQuery?: string;
  initialCity?: string;
  initialSpecialty?: string;
  initialView?: View;
};

/**
 * Provider discovery over the supplied static Patna directory. Only fields
 * present in the source are filterable; bookings are not simulated here.
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
  const hydrated = useIsHydrated();

  const hospitalResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = hospitals.filter((hospital) => {
      if (city && hospital.city !== city) return false;
      if (specialty && !hospital.specialties.some((item) => item.toLowerCase().includes(specialty.toLowerCase())))
        return false;
      if (!needle) return true;
      return (
        hospital.name.toLowerCase().includes(needle) ||
        hospital.city.toLowerCase().includes(needle) ||
        hospital.locality.toLowerCase().includes(needle) ||
        hospital.address?.toLowerCase().includes(needle) ||
        hospital.phone?.toLowerCase().includes(needle) ||
        hospital.email?.toLowerCase().includes(needle) ||
        hospital.specialties.some((item) => item.toLowerCase().includes(needle))
      );
    });

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [query, city, specialty]);

  const doctorResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = doctors.filter((doctor) => {
      if (city && doctor.city !== city) return false;
      if (specialty && !doctor.specialty.toLowerCase().includes(specialty.toLowerCase())) return false;
      if (!needle) return true;
      return (
        doctor.name.toLowerCase().includes(needle) ||
        doctor.specialty.toLowerCase().includes(needle) ||
        doctor.hospitalName.toLowerCase().includes(needle) ||
        doctor.address?.toLowerCase().includes(needle) ||
        doctor.phone?.toLowerCase().includes(needle) ||
        doctor.qualifications.some((item) => item.toLowerCase().includes(needle)) ||
        doctor.city.toLowerCase().includes(needle)
      );
    });

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [query, city, specialty]);

  const filtersActive = Boolean(query.trim()) || Boolean(city) || Boolean(specialty);

  const activeCount = view === "hospitals" ? hospitalResults.length : doctorResults.length;
  const totalCount = view === "hospitals" ? hospitals.length : doctors.length;

  function reset() {
    setQuery("");
    setCity("");
    setSpecialty("");
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

        <div className="flex flex-wrap items-center justify-end border-t border-border pt-4">
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
          description="Clear or broaden your filters. This static source list may be incomplete; contact providers directly to confirm current details."
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
              <HospitalCard hospital={hospital} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {doctorResults.map((doctor) => (
            <li key={doctor.id} className="h-full">
              <DoctorCard doctor={doctor} />
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

export { ProviderDirectory };
