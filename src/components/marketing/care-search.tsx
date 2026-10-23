"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { cities, specialties } from "@/data/providers";
import { cn } from "@/lib/utils";

type CareSearchProps = {
  variant?: "hero" | "inline";
  defaultQuery?: string;
  defaultCity?: string;
  className?: string;
};

const cityOptions = cities.filter((city) => city !== "All cities");

/**
 * The single entry point for provider discovery. Used in the homepage hero and
 * again in the "find care" section; both variants push a real query to
 * /hospitals, which renders filtered results from the same demo dataset.
 */
function CareSearch({ variant = "hero", defaultQuery = "", defaultCity = "", className }: CareSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [city, setCity] = useState(defaultCity);
  const [specialty, setSpecialty] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim() && !city && !specialty) {
      toast.error("Add a symptom, speciality or city so we can find care for you.");
      return;
    }

    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (city) params.set("city", city);
    if (specialty) params.set("specialty", specialty);
    router.push(`/hospitals?${params.toString()}`);
  }

  const stacked = variant === "hero";

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      aria-label="Search hospitals, doctors and specialities"
      className={cn(
        "w-full rounded-2xl border border-border bg-card/85 p-4 shadow-[var(--shadow-panel)] backdrop-blur-xl sm:p-5",
        className,
      )}
    >
      <div
        className={cn(
          "grid gap-4",
          stacked ? "lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end" : "md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end",
        )}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="care-search-query" className="text-xs tracking-wide text-muted-foreground uppercase">
            Symptom, doctor or hospital
          </Label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="care-search-query"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. chest pain, cardiologist, Sanjeevani"
              className="pl-10"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="care-search-city" className="text-xs tracking-wide text-muted-foreground uppercase">
            City
          </Label>
          <div className="relative">
            <MapPin aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Select
              id="care-search-city"
              name="city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="pl-10"
            >
              <option value="">Any city</option>
              {cityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="care-search-specialty" className="text-xs tracking-wide text-muted-foreground uppercase">
            Speciality
          </Label>
          <div className="relative">
            <Stethoscope
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Select
              id="care-search-specialty"
              name="specialty"
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
              className="pl-10"
            >
              <option value="">Any speciality</option>
              {specialties.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Button type="submit" variant="gradient" size="lg" className="w-full lg:w-auto">
          <Search aria-hidden />
          Search care
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Results open on the Hospitals &amp; Doctors page, filtered by your city and speciality.
      </p>
    </form>
  );
}

export { CareSearch };
