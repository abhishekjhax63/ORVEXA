import { Calculator, FileText, HeartHandshake, ReceiptIndianRupee, ShieldCheck, Wallet } from "lucide-react";

import type { ClaimStep, InsuranceGuide, InsurancePlan } from "@/types";

/**
 * DEMO DATA — illustrative plans and settlement figures. Not an offer of
 * insurance and not linked to any insurer's live pricing.
 */

export const insurancePlans: InsurancePlan[] = [
  {
    id: "plan-healthshield-5",
    provider: "Bharat Assure",
    planName: "HealthShield Plus",
    coverAmount: 500000,
    premiumPerYear: 8740,
    claimSettlementRatio: 96.4,
    cashlessHospitals: 9400,
    waitingPeriodMonths: 24,
    coverType: "Individual",
    bestFor: "Young professionals buying their first cover",
    features: [
      "Zero-copay on listed procedures",
      "60-day pre and 90-day post hospitalisation",
      "Day-care procedures covered",
    ],
    riders: ["Critical illness", "Hospital cash"],
    rating: 4.5,
  },
  {
    id: "plan-familyfloater-10",
    provider: "Suraksha General",
    planName: "Family Floater Secure",
    coverAmount: 1000000,
    premiumPerYear: 16480,
    claimSettlementRatio: 94.8,
    cashlessHospitals: 11200,
    waitingPeriodMonths: 24,
    coverType: "Family floater",
    bestFor: "Families of four sharing a single sum insured",
    features: ["Maternity after 24 months", "Newborn cover from day one", "Annual health check for all members"],
    riders: ["Maternity plus", "Personal accident"],
    rating: 4.6,
  },
  {
    id: "plan-senior-10",
    provider: "Bharat Assure",
    planName: "Senior Care Protect",
    coverAmount: 1000000,
    premiumPerYear: 41250,
    claimSettlementRatio: 92.1,
    cashlessHospitals: 8600,
    waitingPeriodMonths: 12,
    coverType: "Senior citizen",
    bestFor: "Parents aged 60+ with pre-existing conditions",
    features: [
      "Pre-existing disease cover after 12 months",
      "Domiciliary hospitalisation",
      "Annual preventive checkup",
    ],
    riders: ["Home care", "Dental"],
    rating: 4.3,
  },
  {
    id: "plan-critical-3",
    provider: "Nirmaya Life",
    planName: "Critical Illness Shield",
    coverAmount: 3000000,
    premiumPerYear: 12990,
    claimSettlementRatio: 97.2,
    cashlessHospitals: 0,
    waitingPeriodMonths: 3,
    coverType: "Individual",
    bestFor: "Adding a lump-sum buffer to an existing policy",
    features: [
      "Lump-sum payout on diagnosis of 42 conditions",
      "No hospitalisation required to claim",
      "Premium waived after first claim",
    ],
    riders: ["Cancer booster", "Income protection"],
    rating: 4.7,
  },
  {
    id: "plan-topup-15",
    provider: "Suraksha General",
    planName: "Super Top-Up Advantage",
    coverAmount: 1500000,
    premiumPerYear: 6980,
    claimSettlementRatio: 93.5,
    cashlessHospitals: 10400,
    waitingPeriodMonths: 36,
    coverType: "Individual",
    bestFor: "Extending employer cover beyond the deductible",
    features: ["Deductible from ₹3 lakh", "Covers entire family under one deductible", "No room-rent capping"],
    riders: ["Restore benefit"],
    rating: 4.4,
  },
  {
    id: "plan-maternity-5",
    provider: "Nirmaya Life",
    planName: "Maternity & Newborn Care",
    coverAmount: 500000,
    premiumPerYear: 21400,
    claimSettlementRatio: 95.1,
    cashlessHospitals: 7200,
    waitingPeriodMonths: 36,
    coverType: "Family floater",
    bestFor: "Planning a pregnancy within three years",
    features: ["Normal and caesarean delivery", "Newborn vaccination cover", "Lactation consultant support"],
    riders: ["Fertility assist"],
    rating: 4.5,
  },
];

export const claimSteps: ClaimStep[] = [
  {
    id: "step-coverage",
    title: "Coverage check unavailable",
    description: "ORVEXA is not connected to insurers or policy terms and cannot estimate coverage or costs.",
    duration: "Not available",
    icon: Calculator,
  },
  {
    id: "step-preauth",
    title: "Pre-authorisation unavailable",
    description: "ORVEXA does not prepare or submit pre-authorisation requests.",
    duration: "Not available",
    icon: FileText,
  },
  {
    id: "step-approval",
    title: "Claim tracking unavailable",
    description: "ORVEXA does not contact insurers or TPAs and cannot track approval status.",
    duration: "Not available",
    icon: ShieldCheck,
  },
  {
    id: "step-reimbursement",
    title: "Claims support unavailable",
    description: "ORVEXA does not submit reimbursement claims or determine claim outcomes.",
    duration: "Not available",
    icon: ReceiptIndianRupee,
  },
];

export const insuranceGuides: InsuranceGuide[] = [
  {
    id: "guide-choose-cover",
    title: "Choosing the right cover",
    description: "General points to discuss with a licensed insurance adviser; no personalized recommendation is provided.",
    icon: Wallet,
    points: [
      "Consider household needs, existing coverage and financial circumstances",
      "Compare limits, exclusions and out-of-pocket costs in the official policy wording",
      "Ask the insurer or a licensed adviser about suitable coverage",
    ],
  },
  {
    id: "guide-waiting-periods",
    title: "Waiting periods decoded",
    description: "Waiting periods and exclusions vary by policy; verify them in the official documents.",
    icon: HeartHandshake,
    points: [
      "Review the waiting-period definitions in the current policy wording",
      "Ask the insurer how declared pre-existing conditions are treated",
      "Confirm any maternity or condition-specific exclusions directly with the insurer",
    ],
  },
  {
    id: "guide-claim-rejection",
    title: "Avoiding claim rejections",
    description: "General record-keeping reminders; claim requirements depend on the insurer and policy.",
    icon: ShieldCheck,
    points: [
      "Provide accurate information when applying for cover",
      "Keep copies of documents requested by your insurer",
      "Contact your insurer promptly to confirm notification and submission deadlines",
    ],
  },
];
