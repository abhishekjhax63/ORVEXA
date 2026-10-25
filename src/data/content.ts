import {
  AudioLines,
  Brain,
  Building2,
  CalendarClock,
  ChartLine,
  FileHeart,
  HeartHandshake,
  Image as ImageIcon,
  LockKeyhole,
  MessageSquare,
  Microscope,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Truck,
  Users,
  Video,
} from "lucide-react";

import type { PartnershipBenefit, TrustMetric } from "@/types";

export const trustMetrics: TrustMetric[] = [
  { id: "trust-1", label: "Provider directory", value: "Patna", detail: "Static source list: 20 hospital listings and 83 doctor records; not independently verified." },
  { id: "trust-2", label: "Provider verification", value: "Pending", detail: "Credentials and current affiliations have not been checked by ORVEXA." },
  { id: "trust-3", label: "Live appointment feed", value: "Not connected", detail: "No appointment availability or booking is provided by this directory." },
  { id: "trust-4", label: "Patient stories", value: "Not published", detail: "ORVEXA does not publish fabricated or composite testimonials as customer reviews." },
];

export const partnershipBenefits: PartnershipBenefit[] = [
  {
    id: "benefit-1",
    title: "Qualified patient demand",
    description:
      "Reach patients already searching for your speciality in your locality, with intent captured at the moment of need.",
    icon: Users,
  },
  {
    id: "benefit-2",
    title: "Guaranteed slot fill",
    description:
      "Fill cancellations and off-peak slots through automated recall, rescheduling and waitlist promotion.",
    icon: CalendarClock,
  },
  {
    id: "benefit-3",
    title: "Cashless claim desk",
    description:
      "Our team coordinates pre-authorisation with TPAs so your billing team stops chasing insurers on the phone.",
    icon: ShieldCheck,
  },
  {
    id: "benefit-4",
    title: "Digital records handover",
    description:
      "Discharge summaries, prescriptions and reports reach the patient's vault at discharge, reducing repeat calls.",
    icon: FileHeart,
  },
  {
    id: "benefit-5",
    title: "Pharmacy & lab integration",
    description: "In-house or partner pharmacy and lab orders flow through the same ORVEXA pipeline.",
    icon: Pill,
  },
  {
    id: "benefit-6",
    title: "Operational insight",
    description: "See demand patterns, no-show rates and turnaround performance in a monthly provider report.",
    icon: ChartLine,
  },
];

export const aiCapabilities = [
  {
    id: "ai-triage",
    title: "Symptom guidance",
    detail: "The live workspace can respond to symptom descriptions when an AI provider is configured. Responses are not diagnoses.",
    icon: Brain,
  },
  {
    id: "ai-images",
    title: "Medical image input",
    detail: "Image analysis requires a vision-capable AI provider, sign-in, private storage and a configured malware scanner.",
    icon: ImageIcon,
  },
  {
    id: "ai-reports",
    title: "Reports and documents",
    detail: "Document support depends on the configured provider and upload services. The workspace reports unavailable capabilities.",
    icon: Microscope,
  },
  {
    id: "ai-audio",
    title: "Audio and video input",
    detail: "Audio or video can be analyzed only when the selected provider supports that input and the upload services are available.",
    icon: AudioLines,
  },
  {
    id: "ai-uploads",
    title: "Upload safety controls",
    detail: "Files are checked against configured limits and scanning/storage requirements before analysis; unavailable checks fail closed.",
    icon: ShieldCheck,
  },
  {
    id: "ai-language",
    title: "Honest availability",
    detail: "If AI or required upload services are missing, the workspace shows that clearly instead of inventing an answer.",
    icon: LockKeyhole,
  },
];

export const aiConversation = [
  {
    id: "msg-1",
    from: "patient" as const,
    text: "I have had a throbbing headache for three days with some light sensitivity. No fever.",
  },
  {
    id: "msg-2",
    from: "assistant" as const,
    text: "Thanks. Three days of throbbing pain with light sensitivity is a pattern I take seriously. Two quick questions: does the pain worsen when you bend forward, and have you noticed any blurred vision or neck stiffness?",
  },
  {
    id: "msg-3",
    from: "patient" as const,
    text: "No blurred vision or neck stiffness. It does get worse when I bend down.",
  },
  {
    id: "msg-4",
    from: "assistant" as const,
    text: "Understood. Urgency: see a doctor within 24 hours (not an emergency since there are no red-flag signs). I would book Neurology, or General medicine if you want the earliest slot. I can also add a blood pressure log for the next three days and share this summary with the doctor before your visit.",
  },
];

export const telemedicineFeatures = [
  {
    id: "tm-video",
    title: "Video consultations",
    description: "No video-consultation provider or clinician booking service is connected.",
    icon: Video,
  },
  {
    id: "tm-rx",
    title: "Digital prescriptions",
    description: "ORVEXA does not issue digital prescriptions or connect consultations to a pharmacy.",
    icon: FileHeart,
  },
  {
    id: "tm-followup",
    title: "Consultation follow-up",
    description: "No clinician chat or follow-up messaging service is connected.",
    icon: MessageSquare,
  },
  {
    id: "tm-family",
    title: "Family profiles",
    description: "Family profiles are not connected to a clinical consultation workflow.",
    icon: Users,
  },
];

export const recordsFeatures = [
  {
    id: "rec-timeline",
    title: "Patient record dashboard",
    description: "A patient health-record dashboard is not available in this build.",
    icon: CalendarClock,
  },
  {
    id: "rec-share",
    title: "Record sharing",
    description: "No record-sharing links or revocation workflow are connected.",
    icon: ShieldCheck,
  },
  {
    id: "rec-abha",
    title: "ABHA linkage",
    description: "ABHA integration is not configured.",
    icon: LockKeyhole,
  },
  {
    id: "rec-trends",
    title: "Health trends",
    description: "No clinical record data is connected for trend analysis.",
    icon: TrendingUp,
  },
];

export const providerOnboarding = [
  {
    id: "onb-1",
    step: "01",
    title: "Submit your facility",
    description: "Registration number, accreditations, specialities, bed count and tariff sheet.",
    icon: Building2,
  },
  {
    id: "onb-2",
    step: "02",
    title: "Credential checks (planned)",
    description: "Provider credentials would need independent verification before any listing is marked verified.",
    icon: ShieldCheck,
  },
  {
    id: "onb-3",
    step: "03",
    title: "Connect availability (planned)",
    description: "A provider integration would be required before appointment availability could be displayed.",
    icon: CalendarClock,
  },
  {
    id: "onb-4",
    step: "04",
    title: "Enable provider workflows (planned)",
    description: "Bookings, claims and pharmacy requests are not currently connected to provider systems.",
    icon: Sparkles,
  },
];

export const platformHighlights = [
  { id: "ph-1", label: "Hospital listings", value: "20" },
  { id: "ph-2", label: "Doctor records", value: "83" },
  { id: "ph-3", label: "City in supplied list", value: "Patna" },
  { id: "ph-4", label: "Verification", value: "Pending" },
];

export const careJourney = [
  {
    id: "journey-1",
    title: "Browse provider listings",
    description: "Search the static Patna directory. Listings are unverified; availability, prices and outcomes are not provided.",
    icon: Stethoscope,
  },
  {
    id: "journey-2",
    title: "Contact providers directly",
    description: "Telemedicine, digital prescriptions and second-opinion workflows are not connected to ORVEXA.",
    icon: Video,
  },
  {
    id: "journey-3",
    title: "Review sample catalogues",
    description: "Diagnostic and pharmacy listings are illustrative; no orders, collection or delivery are available.",
    icon: Truck,
  },
  {
    id: "journey-4",
    title: "Check service availability",
    description: "Patient records, payments and insurance claims are not connected in this build.",
    icon: HeartHandshake,
  },
];
