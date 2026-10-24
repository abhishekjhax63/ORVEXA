"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  MapPin,
  Navigation,
  PhoneCall,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Stethoscope,
} from "lucide-react";

import { RequestDialog } from "@/components/forms/request-dialog";
import { buildDoctorFields, buildHospitalFields } from "@/components/hospitals/booking-fields";
import { doctors, hospitals, specialties } from "@/data/providers";
import type { Doctor, Hospital } from "@/types";
import type { StoredUserLocation } from "@/components/auth/location-permission-prompt";

type CareLevel = "EMERGENCY" | "SPECIALIST_CLINIC" | "TELECONSULT" | "GENERAL_PHYSICIAN";

type RankedProvider = {
  provider: Hospital | Doctor;
  kind: "hospital" | "doctor";
  distanceKm: number;
  matchScore: number;
  recommendationReason: string;
};

// Calculate distance in km between two coordinate pairs
function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function AiRecommendationFlow() {
  const [isOpen, setIsOpen] = useState(true);
  const [userLocation, setUserLocation] = useState<StoredUserLocation | null>(null);
  const [manualCity, setManualCity] = useState("");

  // Flow states
  const [step, setStep] = useState<"choose_need" | "symptoms_questions" | "results">("choose_need");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("");
  const [freeTextNeed, setFreeTextNeed] = useState("");

  // Symptom contextual questions
  const [duration, setDuration] = useState<"today" | "few_days" | "weeks">("today");
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe">("moderate");
  const [hasRedFlags, setHasRedFlags] = useState(false);

  // Load stored location from storage
  useEffect(() => {
    const readLocation = () => {
      try {
        const stored = localStorage.getItem("orvexa_user_location") || sessionStorage.getItem("orvexa_user_location");
        if (stored) {
          setUserLocation(JSON.parse(stored));
        }
      } catch {}
    };

    readLocation();
    window.addEventListener("orvexa:location-updated", readLocation);
    return () => window.removeEventListener("orvexa:location-updated", readLocation);
  }, []);

  const handleManualLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCity.trim()) return;

    // Approximate known coordinates for Indian cities
    const cityCoords: Record<string, { lat: number; lng: number }> = {
      bengaluru: { lat: 12.9716, lng: 77.5946 },
      bangalore: { lat: 12.9716, lng: 77.5946 },
      mumbai: { lat: 19.076, lng: 72.8777 },
      delhi: { lat: 28.6139, lng: 77.209 },
      gurugram: { lat: 28.4595, lng: 77.0725 },
      hyderabad: { lat: 17.385, lng: 78.4867 },
      chennai: { lat: 13.0827, lng: 80.2707 },
      kolkata: { lat: 22.5726, lng: 88.3639 },
      pune: { lat: 18.5204, lng: 73.8567 },
    };

    const key = manualCity.trim().toLowerCase();
    const match = cityCoords[key] || { lat: 12.9716, lng: 77.5946 };

    const loc: StoredUserLocation = {
      latitude: match.lat,
      longitude: match.lng,
      label: manualCity.trim(),
      city: manualCity.trim(),
      source: "manual",
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem("orvexa_user_location", JSON.stringify(loc));
      sessionStorage.setItem("orvexa_user_location", JSON.stringify(loc));
    } catch {}

    setUserLocation(loc);
    setManualCity("");
  };

  const handleSelectSpecialty = (specName: string) => {
    setSelectedSpecialty(specName);
    setStep("results");
  };

  const handleAnalyzeSymptoms = () => {
    // Check if symptoms text mentions red flags
    const text = freeTextNeed.toLowerCase();
    const isEmergencyText =
      text.includes("chest pain") ||
      text.includes("difficulty breathing") ||
      text.includes("breathless") ||
      text.includes("stroke") ||
      text.includes("unconscious") ||
      text.includes("fainted") ||
      text.includes("paralysis") ||
      text.includes("severe bleed") ||
      hasRedFlags ||
      severity === "severe";

    if (isEmergencyText) {
      setHasRedFlags(true);
      setSelectedSpecialty("Emergency Medicine");
    } else {
      // Map common symptoms to specialties
      if (text.includes("heart") || text.includes("palpitation") || text.includes("bp") || text.includes("pressure")) {
        setSelectedSpecialty("Cardiology");
      } else if (text.includes("headache") || text.includes("migraine") || text.includes("dizzy") || text.includes("numb")) {
        setSelectedSpecialty("Neurology and Neurosurgery");
      } else if (text.includes("bone") || text.includes("joint") || text.includes("fracture") || text.includes("knee") || text.includes("back pain")) {
        setSelectedSpecialty("Orthopedics");
      } else if (text.includes("skin") || text.includes("rash") || text.includes("acne") || text.includes("itch")) {
        setSelectedSpecialty("Dermatology");
      } else if (text.includes("ear") || text.includes("nose") || text.includes("throat") || text.includes("sinus")) {
        setSelectedSpecialty("ENT / Otolaryngology");
      } else if (text.includes("eye") || text.includes("vision") || text.includes("blur")) {
        setSelectedSpecialty("Ophthalmology");
      } else if (text.includes("stomach") || text.includes("acid") || text.includes("digestion") || text.includes("gut")) {
        setSelectedSpecialty("Gastroenterology");
      } else if (text.includes("period") || text.includes("pregnancy") || text.includes("gynec")) {
        setSelectedSpecialty("Gynecology and Obstetrics");
      } else if (text.includes("child") || text.includes("baby") || text.includes("infant")) {
        setSelectedSpecialty("Pediatrics");
      } else if (text.includes("lung") || text.includes("cough") || text.includes("asthma")) {
        setSelectedSpecialty("Pulmonology");
      } else if (text.includes("kidney") || text.includes("dialysis")) {
        setSelectedSpecialty("Nephrology");
      } else if (text.includes("diabetes") || text.includes("thyroid") || text.includes("sugar")) {
        setSelectedSpecialty("Endocrinology");
      } else if (text.includes("anxiety") || text.includes("depression") || text.includes("stress") || text.includes("sleep")) {
        setSelectedSpecialty("Psychiatry and Mental Health");
      } else if (text.includes("tooth") || text.includes("teeth") || text.includes("dental") || text.includes("gum")) {
        setSelectedSpecialty("Dentistry");
      } else if (text.includes("cancer") || text.includes("tumor") || text.includes("oncology")) {
        setSelectedSpecialty("Oncology");
      } else {
        setSelectedSpecialty(selectedSpecialty || "General Medicine");
      }
    }

    setStep("results");
  };

  // Derive care level
  const careLevel: CareLevel = useMemo(() => {
    if (hasRedFlags || severity === "severe" || selectedSpecialty === "Emergency Medicine") {
      return "EMERGENCY";
    }
    if (duration === "today" && severity === "moderate") {
      return "SPECIALIST_CLINIC";
    }
    if (duration === "few_days" && severity === "mild") {
      return "TELECONSULT";
    }
    return "GENERAL_PHYSICIAN";
  }, [hasRedFlags, severity, selectedSpecialty, duration]);

  // Rank eligible nearby providers
  const rankedProviders: RankedProvider[] = useMemo(() => {
    if (!selectedSpecialty) return [];

    const userLat = userLocation?.latitude ?? 12.9716;
    const userLon = userLocation?.longitude ?? 77.5946;

    const list: RankedProvider[] = [];

    // Eligible Hospitals
    hospitals.forEach((hosp) => {
      const match = hosp.specialties.some(
        (s) =>
          s.toLowerCase().includes(selectedSpecialty.toLowerCase()) ||
          selectedSpecialty.toLowerCase().includes(s.toLowerCase()),
      );
      if (match || hosp.emergency24x7) {
        const hospLat = hosp.coordinates?.latitude ?? userLat;
        const hospLon = hosp.coordinates?.longitude ?? userLon;
        const dist = hosp.coordinates
          ? calculateHaversineKm(userLat, userLon, hospLat, hospLon)
          : hosp.distanceKm;

        let score = 100 - dist * 2;
        if (hosp.verificationStatus === "Verified") score += 30;
        if (hosp.emergency24x7 && careLevel === "EMERGENCY") score += 50;

        let reason = `Offers confirmed department in ${selectedSpecialty}.`;
        if (hosp.verificationStatus === "Verified") {
          reason += ` Officially accredited under ${hosp.accreditations.join(", ")} (Reg: ${hosp.registrationNumber || "Audited"}).`;
        }
        if (dist <= 15) {
          reason += ` Within proximity (${dist} km away).`;
        }
        if (hosp.emergency24x7) {
          reason += ` 24×7 emergency & critical care ready.`;
        }

        list.push({
          provider: hosp,
          kind: "hospital",
          distanceKm: dist,
          matchScore: score,
          recommendationReason: reason,
        });
      }
    });

    // Eligible Doctors
    doctors.forEach((doc) => {
      const match =
        doc.specialty.toLowerCase().includes(selectedSpecialty.toLowerCase()) ||
        selectedSpecialty.toLowerCase().includes(doc.specialty.toLowerCase());
      if (match) {
        const docLat = doc.coordinates?.latitude ?? userLat;
        const docLon = doc.coordinates?.longitude ?? userLon;
        const dist = doc.coordinates
          ? calculateHaversineKm(userLat, userLon, docLat, docLon)
          : 5.0;

        let score = 90 - dist * 2;
        if (doc.verificationStatus === "Verified") score += 35;
        if (doc.modes.includes("video") && careLevel === "TELECONSULT") score += 40;

        let reason = `Direct specialist in ${doc.specialty} with ${doc.experienceYears} years clinical experience.`;
        if (doc.verificationStatus === "Verified") {
          reason += ` Verified with ${doc.verificationSource} (Council Reg: ${doc.registrationNumber || "Verified"}).`;
        }
        if (doc.modes.includes("video")) {
          reason += ` Same-day teleconsult available.`;
        }

        list.push({
          provider: doc,
          kind: "doctor",
          distanceKm: dist,
          matchScore: score,
          recommendationReason: reason,
        });
      }
    });

    return list.sort((a, b) => b.matchScore - a.matchScore);
  }, [selectedSpecialty, userLocation, careLevel]);

  const resetFlow = () => {
    setStep("choose_need");
    setSelectedSpecialty("");
    setFreeTextNeed("");
    setSeverity("moderate");
    setDuration("today");
    setHasRedFlags(false);
  };

  return (
    <section
      aria-label="AI Healthcare Provider Recommendation Flow"
      className="rounded-3xl border border-primary/25 bg-card-elevated shadow-xs transition-all mb-8 overflow-hidden"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border bg-primary/5 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground sm:text-base">
              AI Location-Based Healthcare Recommendation
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Intelligent specialty matching & nearby verified clinician ranking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {userLocation ? (
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              <MapPin className="size-3.5 text-primary" />
              <span className="font-medium text-foreground max-w-44 truncate">
                {userLocation.label}
              </span>
            </div>
          ) : (
            <span className="hidden sm:inline text-xs text-muted-foreground">
              Location not set
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={isOpen ? "Collapse section" : "Expand section"}
          >
            {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-5 sm:p-6 space-y-6">
          {/* Location status / quick set */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-3.5 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Navigation className="size-4 text-primary shrink-0" />
              <span>
                {userLocation ? (
                  <>
                    Recommendations calibrated for <strong className="text-foreground">{userLocation.label}</strong>
                  </>
                ) : (
                  "Using standard network view. Enter your city or area to calculate exact travel distance:"
                )}
              </span>
            </div>

            <form onSubmit={handleManualLocationSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={manualCity}
                onChange={(e) => setManualCity(e.target.value)}
                placeholder="Change city or locality..."
                className="rounded-xl border border-border bg-background px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden w-40 sm:w-48"
              />
              <button
                type="submit"
                disabled={!manualCity.trim()}
                className="rounded-xl bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Set
              </button>
            </form>
          </div>

          {/* STEP 1: Choose healthcare need */}
          {step === "choose_need" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  What medical help or specialty do you need today?
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select a medical specialty or describe what symptoms you are experiencing:
                </p>
              </div>

              {/* 20 Major Specialties Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 pt-1">
                {specialties.map((spec) => {
                  const Icon = spec.icon;
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => handleSelectSpecialty(spec.name)}
                      className="flex flex-col items-start gap-1 rounded-xl border border-border bg-background p-2.5 text-left text-xs transition-all hover:border-primary/50 hover:bg-primary/5"
                    >
                      <Icon className="size-4 text-primary" />
                      <span className="font-semibold text-foreground line-clamp-1">{spec.name}</span>
                      <span className="text-[10px] text-muted-foreground line-clamp-1">{spec.commonConditions[0]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Free text description alternative */}
              <div className="rounded-2xl border border-border bg-background p-4 space-y-3 mt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Stethoscope className="size-3.5 text-primary" />
                    Or describe what you are feeling (AI Symptom Triage):
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={freeTextNeed}
                  onChange={(e) => setFreeTextNeed(e.target.value)}
                  placeholder="e.g. Constant throbbing in my temple for two days, slight nausea when reading..."
                  className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!freeTextNeed.trim()}
                    onClick={() => setStep("symptoms_questions")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Proceed with Symptom Triage
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Concise symptom context questions */}
          {step === "symptoms_questions" && (
            <div className="space-y-4 rounded-2xl border border-border bg-background p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Clarifying Clinical Questions
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Brief details help the AI determine the appropriate care level and medical specialty.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("choose_need")}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Back
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-foreground mb-1.5">
                    How long have symptoms lasted?
                  </label>
                  <div className="flex gap-2">
                    {(
                      [
                        { id: "today", label: "Started today" },
                        { id: "few_days", label: "2 - 4 days" },
                        { id: "weeks", label: "Over a week" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDuration(opt.id)}
                        className={`flex-1 rounded-xl border py-2 px-2 text-center font-medium ${
                          duration === opt.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1.5">
                    Reported severity level:
                  </label>
                  <div className="flex gap-2">
                    {(
                      [
                        { id: "mild", label: "Mild / Tolerable" },
                        { id: "moderate", label: "Moderate" },
                        { id: "severe", label: "Severe / Acute" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSeverity(opt.id)}
                        className={`flex-1 rounded-xl border py-2 px-2 text-center font-medium ${
                          severity === opt.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Red-flag questions */}
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 space-y-2">
                <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                  <ShieldAlert className="size-4" />
                  Emergency Red Flag Screening:
                </p>
                <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasRedFlags}
                    onChange={(e) => setHasRedFlags(e.target.checked)}
                    className="size-4 rounded border-border text-destructive focus:ring-destructive mt-0.5"
                  />
                  <span>
                    Do you have any of: severe crushing chest pain, difficulty breathing, stroke symptoms (face drooping, arm weakness, slurred speech), sudden unconsciousness, or heavy uncontrollable bleeding?
                  </span>
                </label>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setStep("choose_need")}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAnalyzeSymptoms}
                  className="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Analyze & Rank Nearby Providers
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Results, Care Level & Provider Ranking */}
          {step === "results" && (
            <div className="space-y-6">
              {/* Emergency Banner if red flags detected */}
              {(hasRedFlags || careLevel === "EMERGENCY") && (
                <div className="rounded-2xl border-2 border-destructive bg-destructive/15 p-5 text-destructive-foreground animate-pulse">
                  <div className="flex items-start gap-3.5">
                    <Siren className="size-7 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-2 flex-1">
                      <h4 className="text-base font-bold text-destructive">
                        URGENT: POSSIBLE EMERGENCY CARE REQUIRED
                      </h4>
                      <p className="text-xs leading-relaxed text-foreground">
                        Reported symptoms indicate possible acute emergency (e.g. cardiac distress, severe respiratory difficulty, or neuro-vascular event). <strong>Do not delay care for online analysis or standard outpatient appointments.</strong> Contact emergency response or proceed immediately to the closest emergency room.
                      </p>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <a
                          href="tel:108"
                          className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-destructive/90"
                        >
                          <PhoneCall className="size-4" />
                          Call 108 Emergency
                        </a>
                        <Link
                          href="/emergency"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-destructive bg-background px-3.5 py-2 text-xs font-bold text-destructive hover:bg-destructive/10"
                        >
                          Open SOS Dispatch
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Recommendation Summary Box */}
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      AI Triage Recommendation
                    </span>
                    <h4 className="text-base font-bold text-foreground">
                      Suggested Specialty: {selectedSpecialty}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Recommended Care Level:{" "}
                      <strong className="text-foreground">
                        {careLevel === "EMERGENCY"
                          ? "Immediate Emergency (24×7 Hospital)"
                          : careLevel === "SPECIALIST_CLINIC"
                          ? "In-Person Specialist Clinic (Within 24-48 Hours)"
                          : careLevel === "TELECONSULT"
                          ? "Remote Teleconsultation (Same-Day Video)"
                          : "Primary Care / General Physician"}
                      </strong>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={resetFlow}
                    className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline self-start sm:self-auto"
                  >
                    <RotateCcw className="size-3.5" />
                    Change need or symptoms
                  </button>
                </div>

                <div className="rounded-xl border border-border bg-background/80 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">Clinical & Verification Boundary:</strong> Medical specialty matching is based on reported symptoms and is not a definitive diagnosis. Provider verification badges reflect official government registry and NABH audits — AI does not independently verify medical credentials.
                </div>
              </div>

              {/* Ranked Provider Cards */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Ranked Nearby Providers ({rankedProviders.length} matching)
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    Sorted by specialty relevance, confirmed credentials & proximity
                  </span>
                </div>

                {rankedProviders.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">No matching facilities in your immediate radius.</p>
                    <p className="mt-1">Try expanding your search to all cities or consult via remote teleconsultation.</p>
                    <button
                      type="button"
                      onClick={() => setSelectedSpecialty("General Medicine")}
                      className="mt-3 inline-flex items-center gap-1.5 text-primary font-medium hover:underline"
                    >
                      Show General Medicine providers instead
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rankedProviders.slice(0, 4).map((item, idx) => {
                      const isHosp = item.kind === "hospital";
                      const p = item.provider;

                      return (
                        <div
                          key={p.id}
                          className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all hover:border-primary/40 space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                  #{idx + 1} Best Match
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {item.distanceKm} km away ({p.city})
                                </span>
                                {p.verificationStatus === "Verified" ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
                                    <ShieldCheck className="size-3" />
                                    Verified
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                    Verification pending
                                  </span>
                                )}
                              </div>
                              <h5 className="text-sm sm:text-base font-bold text-foreground">
                                {p.name}
                              </h5>
                              <p className="text-xs text-muted-foreground">
                                {isHosp
                                  ? `${(p as Hospital).locality}, ${(p as Hospital).city} · ${(p as Hospital).type}`
                                  : `${(p as Doctor).specialty} · ${(p as Doctor).hospitalName}, ${(p as Doctor).city}`}
                              </p>
                            </div>

                            {/* Action Button */}
                            <div className="shrink-0">
                              {isHosp ? (
                                <RequestDialog
                                  triggerLabel="Book Hospital"
                                  triggerVariant="default"
                                  triggerSize="sm"
                                  title={`Book at ${(p as Hospital).name}`}
                                  description={`${(p as Hospital).type} · ${(p as Hospital).locality}, ${(p as Hospital).city}. Choose a department and preferred date.`}
                                  fields={buildHospitalFields(p as Hospital)}
                                  submitLabel="Request appointment"
                                  successTitle="Appointment request ready"
                                  successBody={`${p.name} would receive your request with the preferred date you chose.`}
                                  footnote="Phase 1 validates your details and shows the confirmation state."
                                />
                              ) : (
                                <RequestDialog
                                  triggerLabel="Consult Doctor"
                                  triggerVariant="default"
                                  triggerSize="sm"
                                  title={`Consult ${(p as Doctor).name}`}
                                  description={`${(p as Doctor).specialty} · ${(p as Doctor).hospitalName}, ${(p as Doctor).city}. Next slot: ${(p as Doctor).nextSlot}.`}
                                  fields={buildDoctorFields(p as Doctor)}
                                  submitLabel="Request slot"
                                  successTitle="Consultation request ready"
                                  successBody={`${p.name} would receive your request with the preferred date you chose.`}
                                  footnote="Phase 1 validates your details and shows the confirmation state."
                                />
                              )}
                            </div>
                          </div>

                          {/* Reason for recommendation */}
                          <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs">
                            <span className="font-semibold text-primary">Why recommended: </span>
                            <span className="text-muted-foreground">{item.recommendationReason}</span>
                          </div>

                          {/* Coordinates / directions note */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                            <span>Phone: {p.phone}</span>
                            {p.coordinates && (
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${p.coordinates.latitude},${p.coordinates.longitude}`}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                              >
                                <Navigation className="size-3" />
                                Turn-by-turn directions ({item.distanceKm} km)
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
