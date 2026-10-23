import type { Metadata } from "next";

import { Hero } from "@/components/marketing/hero";
import { AiShowcaseSection } from "@/components/sections/ai-showcase";
import { FindCareSection } from "@/components/sections/find-care";
import { InsuranceDiagnosticsSection } from "@/components/sections/insurance-diagnostics";
import { PharmacyShowcaseSection } from "@/components/sections/pharmacy-showcase";
import { ServicesOverviewSection } from "@/components/sections/services-overview";
import { TelemedicineRecordsSection } from "@/components/sections/telemedicine-records";
import { TrustSection } from "@/components/sections/trust-section";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `${siteConfig.name} — Hospitals, doctors, diagnostics, pharmacy and emergency care in one place`,
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <FindCareSection />
      <ServicesOverviewSection />
      <AiShowcaseSection />
      <PharmacyShowcaseSection />
      <InsuranceDiagnosticsSection />
      <TelemedicineRecordsSection />
      <TrustSection />
    </>
  );
}
