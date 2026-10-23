import {
  BellRing,
  Brain,
  Building2,
  CalendarClock,
  ChartLine,
  FileHeart,
  HeartHandshake,
  Languages,
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

import type { PartnershipBenefit, Testimonial, TrustMetric } from "@/types";

/** DEMO DATA — marketing proof points, clearly illustrative. */

export const trustMetrics: TrustMetric[] = [
  { id: "trust-1", label: "Verified providers", value: "9,400+", detail: "Hospitals, clinics and diagnostic labs across 40 cities" },
  { id: "trust-2", label: "Consultations delivered", value: "2.6M", detail: "Telemedicine and in-person visits coordinated on ORVEXA" },
  { id: "trust-3", label: "Median ambulance ETA", value: "12 min", detail: "Across live dispatch cities, reviewed monthly" },
  { id: "trust-4", label: "Records encrypted", value: "100%", detail: "AES-256 at rest with per-share access audit trails" },
];

export const testimonials: Testimonial[] = [
  {
    id: "t-1",
    quote:
      "My father's angioplasty was booked, pre-authorised and paid for before we reached the hospital. The claims desk handled paperwork I would never have managed alone.",
    name: "Ramesh Iyer",
    role: "Caregiver for parent",
    city: "Chennai",
    rating: 5,
  },
  {
    id: "t-2",
    quote:
      "The SOS button genuinely works. An ALS ambulance reached us in 11 minutes and the hospital already had his vitals when we arrived.",
    name: "Fatima Ansari",
    role: "Patient",
    city: "Hyderabad",
    rating: 5,
  },
  {
    id: "t-3",
    quote:
      "Chronic medication for my mother arrives every month without me remembering a thing. The refill reminders alone saved us two hospital visits.",
    name: "Aditya Kulkarni",
    role: "MediCare subscriber",
    city: "Pune",
    rating: 5,
  },
  {
    id: "t-4",
    quote:
      "I compared four hospitals on price and waiting time in one screen, then booked a specialist whose fee was half of what I was quoted elsewhere.",
    name: "Sneha Mehra",
    role: "Patient",
    city: "Delhi NCR",
    rating: 4,
  },
  {
    id: "t-5",
    quote:
      "Sending reports to a panel for a second opinion took two days and gave me confidence to avoid an unnecessary surgery.",
    name: "Ganesh Prabhu",
    role: "Patient",
    city: "Bengaluru",
    rating: 5,
  },
  {
    id: "t-6",
    quote:
      "As a clinic, listing on ORVEXA filled our evening slots. Appointments, payments and records all arrive already structured.",
    name: "Dr. Meenal Joshi",
    role: "Provider partner",
    city: "Ahmedabad",
    rating: 5,
  },
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
    title: "Symptom triage",
    detail: "Converts free-text symptoms into a structured urgency band with the reasoning shown.",
    icon: Brain,
  },
  {
    id: "ai-specialist",
    title: "Specialist matching",
    detail: "Recommends the right department and three suitable doctors, filtered by your city and budget.",
    icon: Stethoscope,
  },
  {
    id: "ai-reports",
    title: "Report explainer",
    detail: "Turns a lab report into plain-language findings and flags values outside the reference range.",
    icon: Microscope,
  },
  {
    id: "ai-medicines",
    title: "Medicine guidance",
    detail: "Explains what a prescription does, common interactions and how to take it correctly.",
    icon: Pill,
  },
  {
    id: "ai-reminders",
    title: "Proactive reminders",
    detail: "Learns your schedule and nudges tests, refills and follow-ups before they lapse.",
    icon: BellRing,
  },
  {
    id: "ai-language",
    title: "11 Indian languages",
    detail: "Ask in Hindi, Tamil, Telugu, Bengali, Marathi and more without switching keyboards.",
    icon: Languages,
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
    title: "End-to-end encrypted video",
    description: "Consultations run over encrypted WebRTC with automatic quality fallback on weak networks.",
    icon: Video,
  },
  {
    id: "tm-rx",
    title: "Digital prescription",
    description: "E-signed prescriptions reach your records and MediCare cart the moment the call ends.",
    icon: FileHeart,
  },
  {
    id: "tm-followup",
    title: "7-day follow-up chat",
    description: "Ask follow-up questions inside the same consultation thread at no extra cost.",
    icon: MessageSquare,
  },
  {
    id: "tm-family",
    title: "Family profiles",
    description: "Consult for parents or children from your account with the right medical history attached.",
    icon: Users,
  },
];

export const recordsFeatures = [
  {
    id: "rec-timeline",
    title: "One clinical timeline",
    description: "Prescriptions, lab reports, imaging and discharges arranged chronologically, newest first.",
    icon: CalendarClock,
  },
  {
    id: "rec-share",
    title: "Time-bound sharing",
    description: "Generate a link that expires in 24 hours or 7 days, and revoke it whenever you want.",
    icon: ShieldCheck,
  },
  {
    id: "rec-abha",
    title: "ABHA linkage",
    description: "Link your ABHA address so records stay portable across hospitals and states.",
    icon: LockKeyhole,
  },
  {
    id: "rec-trends",
    title: "Trend intelligence",
    description: "See how HbA1c, lipids or BP move over time instead of reading isolated reports.",
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
    title: "Verification in 72 hours",
    description: "We validate licences, accreditation and doctor credentials against council registries.",
    icon: ShieldCheck,
  },
  {
    id: "onb-3",
    step: "03",
    title: "Publish your slots",
    description: "Sync your existing HIS or use the ORVEXA provider console to open appointment slots.",
    icon: CalendarClock,
  },
  {
    id: "onb-4",
    step: "04",
    title: "Start receiving patients",
    description: "Bookings, pre-auth requests and pharmacy orders start flowing with dashboards attached.",
    icon: Sparkles,
  },
];

export const platformHighlights = [
  { id: "ph-1", label: "Hospitals & clinics", value: "9,400+" },
  { id: "ph-2", label: "Verified doctors", value: "48,000+" },
  { id: "ph-3", label: "Partner labs", value: "1,260+" },
  { id: "ph-4", label: "Cities covered", value: "40" },
];

export const careJourney = [
  {
    id: "journey-1",
    title: "Find the right care",
    description: "Search by symptom, speciality or hospital and compare cost, distance and outcomes side by side.",
    icon: Stethoscope,
  },
  {
    id: "journey-2",
    title: "Consult and decide",
    description: "Meet in person or on video, get a digital prescription, and ask for a second opinion when it matters.",
    icon: Video,
  },
  {
    id: "journey-3",
    title: "Get tests and medicines",
    description: "Home sample collection and 90-minute medicine delivery, coordinated around your schedule.",
    icon: Truck,
  },
  {
    id: "journey-4",
    title: "Track, pay and follow up",
    description: "Cashless claims, invoices and reminders in one dashboard so nothing slips after discharge.",
    icon: HeartHandshake,
  },
];
