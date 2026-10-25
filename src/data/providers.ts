import {
  Baby,
  Bone,
  Brain,
  Ear,
  Eye,
  HeartPulse,
  Microscope,
  Stethoscope,
  UserRound,
} from "lucide-react";

import directoryData from "@/data/provider-directory.json";
import type { Doctor, Hospital, Specialty } from "@/types";

const PATNA = "Patna";

export const hospitals: Hospital[] = directoryData.hospitals.map((entry) => ({
  id: entry.id,
  name: entry.name,
  type: "Hospital",
  city: PATNA,
  locality: entry.locality,
  address: entry.address,
  phone: entry.phone,
  email: entry.email,
  verificationNotes: entry.verificationNotes,
  accreditations: [],
  specialties: entry.specialty ? [entry.specialty] : [],
  beds: null,
  rating: null,
  reviewCount: null,
  distanceKm: null,
  emergency24x7: null,
  cashlessInsurance: null,
  teleconsult: null,
  priceTier: null,
  imagePrompt: null,
  sourceUrl: entry.sourceUrl,
  profileUrl: entry.profileUrl,
}));

export const doctors: Doctor[] = directoryData.doctors.map((entry) => ({
  id: entry.id,
  name: entry.name,
  specialty: entry.specialty,
  qualifications: entry.qualification ? [entry.qualification] : [],
  experienceYears: null,
  experience: entry.experience,
  schedule: entry.schedule,
  languages: [],
  hospitalId: entry.hospitalId,
  hospitalName: entry.hospitalName,
  address: entry.address,
  phone: entry.phone,
  city: PATNA,
  rating: null,
  reviewCount: null,
  consultationFee: null,
  modes: [],
  availability: null,
  nextSlot: null,
  about: null,
  imagePrompt: null,
  sourceUrl: entry.sourceUrl,
  profileUrl: entry.profileUrl,
  verificationStatus: entry.verificationStatus,
}));

const specialtyIcons: Record<string, Specialty["icon"]> = {
  cardiology: HeartPulse,
  cardiac: HeartPulse,
  gynecology: Baby,
  obstetrics: Baby,
  orthopedics: Bone,
  neurology: Brain,
  neurosurgery: Brain,
  ophthalmology: Eye,
  pathology: Microscope,
  pediatric: Baby,
  anesthesia: Stethoscope,
  surgery: Stethoscope,
  medicine: Stethoscope,
  urology: UserRound,
  dentistry: Stethoscope,
  renal: Stethoscope,
  spine: Bone,
};

const specialtyNames = [...new Set(doctors.map((doctor) => doctor.specialty))].sort((a, b) => a.localeCompare(b));

export const specialties: Specialty[] = specialtyNames.map((name) => {
  const icon = Object.entries(specialtyIcons).find(([keyword]) => name.toLowerCase().includes(keyword))?.[1] ?? Ear;
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    name,
    icon,
    doctorCount: doctors.filter((doctor) => doctor.specialty === name).length,
    description: "Listed in the supplied Patna directory; confirm details with the provider.",
  };
});

export const cities = ["All cities", PATNA];

export const providerDirectorySource = {
  label: "User-supplied Patna hospital and doctor spreadsheets",
  status: "Verification pending",
  updatedAt: null,
  note:
    "This directory was imported from the supplied spreadsheets and is not a live feed. The source marks affiliations, credentials, contacts and schedules as requiring confirmation. One Dr. S. K. Jha entry is retained separately because the spreadsheets use different names; verify whether it duplicates another listing. Contact each facility directly before relying on any listing; ORVEXA does not book appointments from this static directory.",
  sources: directoryData.sourceFiles,
} as const;
