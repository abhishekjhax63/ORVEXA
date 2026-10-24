import type { LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ *
 * Shared primitives
 * ------------------------------------------------------------------ */

export type Accent = "aqua" | "teal" | "navy" | "cyan";

export type ConsultationMode = "in-person" | "video" | "chat";

export type Availability = "today" | "tomorrow" | "this-week";

/* ------------------------------------------------------------------ *
 * Services
 * ------------------------------------------------------------------ */

export type ServiceCategory =
  | "discovery"
  | "consultation"
  | "diagnostics"
  | "emergency"
  | "pharmacy"
  | "records"
  | "insurance"
  | "wellness";

export type CareService = {
  slug: string;
  title: string;
  category: ServiceCategory;
  icon: LucideIcon;
  summary: string;
  description: string;
  highlights: string[];
  /** Lowest indicative price in INR, or null when the service is free/covered. */
  priceFrom: number | null;
  turnaround: string;
  ctaLabel: string;
  ctaHref: string;
  accent: Accent;
};

/* ------------------------------------------------------------------ *
 * Providers
 * ------------------------------------------------------------------ */

export type HospitalType = "Multi-speciality" | "Super-speciality" | "Day-care" | "Clinic";

export type VerificationStatus = "Verified" | "Verification pending" | "Verification not confirmed";

export type Hospital = {
  id: string;
  name: string;
  type: HospitalType;
  city: string;
  locality: string;
  address: string;
  phone: string;
  accreditations: string[];
  specialties: string[];
  beds: number;
  rating: number;
  reviewCount: number;
  distanceKm: number;
  emergency24x7: boolean;
  cashlessInsurance: boolean;
  teleconsult: boolean;
  /** 1 = value, 2 = mid, 3 = premium. Used only for the cost filter. */
  priceTier: 1 | 2 | 3;
  imagePrompt?: string;
  verificationStatus?: VerificationStatus;
  verificationSource?: string;
  verificationDate?: string;
  registrationNumber?: string;
  coordinates?: { latitude: number; longitude: number };
  authenticImageUrl?: string;
  imageAttribution?: string;
};

export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  qualifications: string[];
  experienceYears: number;
  languages: string[];
  hospitalId: string;
  hospitalName: string;
  city: string;
  rating: number;
  reviewCount: number;
  consultationFee: number;
  modes: ConsultationMode[];
  availability: Availability;
  nextSlot: string;
  about: string;
  imagePrompt?: string;
  verificationStatus?: VerificationStatus;
  verificationSource?: string;
  verificationDate?: string;
  registrationNumber?: string;
  medicalCouncil?: string;
  authenticImageUrl?: string;
  imageAttribution?: string;
};

export type Specialty = {
  id: string;
  name: string;
  icon: LucideIcon;
  doctorCount: number;
  description: string;
};

/* ------------------------------------------------------------------ *
 * Pharmacy
 * ------------------------------------------------------------------ */

export type MedicineForm = "Tablet" | "Capsule" | "Syrup" | "Injection" | "Cream" | "Drops" | "Inhaler";

export type StockStatus = "in-stock" | "low-stock" | "out-of-stock";

export type Medicine = {
  id: string;
  name: string;
  brand: string;
  composition: string;
  form: MedicineForm;
  packSize: string;
  categoryId: string;
  price: number;
  mrp: number;
  prescriptionRequired: boolean;
  stock: StockStatus;
  deliveryEta: string;
  rating: number;
};

export type MedicineCategory = {
  id: string;
  name: string;
  icon: LucideIcon;
  itemCount: number;
};

/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */

export type DiagnosticPackage = {
  id: string;
  name: string;
  category: string;
  description: string;
  testCount: number;
  includes: string[];
  price: number;
  mrp: number;
  homeCollection: boolean;
  reportTime: string;
  fastingRequired: boolean;
  popular?: boolean;
};

export type DiagnosticCategory = {
  id: string;
  name: string;
  icon: LucideIcon;
  testCount: number;
};

/* ------------------------------------------------------------------ *
 * Insurance
 * ------------------------------------------------------------------ */

export type InsurancePlan = {
  id: string;
  provider: string;
  planName: string;
  coverAmount: number;
  premiumPerYear: number;
  claimSettlementRatio: number;
  cashlessHospitals: number;
  waitingPeriodMonths: number;
  coverType: "Individual" | "Family floater" | "Senior citizen";
  bestFor: string;
  features: string[];
  riders: string[];
  rating: number;
};

export type ClaimStep = {
  id: string;
  title: string;
  description: string;
  duration: string;
  icon: LucideIcon;
};

export type InsuranceGuide = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  points: string[];
};

/* ------------------------------------------------------------------ *
 * Patient dashboard (demo)
 * ------------------------------------------------------------------ */

export type AppointmentStatus = "confirmed" | "completed" | "cancelled" | "pending";

export type Appointment = {
  id: string;
  doctorName: string;
  specialty: string;
  hospitalName: string;
  mode: ConsultationMode;
  dateISO: string;
  time: string;
  status: AppointmentStatus;
  location: string;
  fee: number;
};

export type PrescriptionItem = {
  name: string;
  dosage: string;
  duration: string;
  status: "active" | "completed" | "refill-due";
};

export type Prescription = {
  id: string;
  issuedBy: string;
  issuedOn: string;
  hospitalName: string;
  diagnosis: string;
  items: PrescriptionItem[];
};

export type HealthRecordType = "lab-report" | "imaging" | "discharge" | "vaccination" | "invoice";

export type HealthRecord = {
  id: string;
  title: string;
  type: HealthRecordType;
  dateISO: string;
  provider: string;
  sizeKb: number;
  sharedWith: string[];
};

export type VitalStatus = "normal" | "watch" | "attention";

export type Vital = {
  id: string;
  label: string;
  value: string;
  unit: string;
  trend: "up" | "down" | "steady";
  status: VitalStatus;
  recordedAt: string;
};

export type CareTask = {
  id: string;
  title: string;
  detail: string;
  dueLabel: string;
  type: "medicine" | "test" | "follow-up" | "vaccination";
  done: boolean;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  timeLabel: string;
  unread: boolean;
};

export type FamilyMember = {
  id: string;
  name: string;
  relation: string;
  age: number;
  bloodGroup: string;
  abhaId: string;
  active: boolean;
};

export type PatientProfile = {
  id: string;
  name: string;
  abhaId: string;
  email: string;
  phone: string;
  bloodGroup: string;
  dateOfBirth: string;
  city: string;
  allergies: string[];
  conditions: string[];
  emergencyContact: { name: string; relation: string; phone: string };
};

/* ------------------------------------------------------------------ *
 * Content blocks
 * ------------------------------------------------------------------ */

export type Faq = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

export type HelpTopic = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  articleCount: number;
};

export type SupportChannel = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  icon: LucideIcon;
  meta: string;
};

export type Testimonial = {
  id: string;
  quote: string;
  name: string;
  role: string;
  city: string;
  rating: number;
};

export type TrustMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type PartnershipBenefit = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
};
