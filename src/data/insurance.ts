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
    title: "Run a coverage check",
    description:
      "Add your policy number and ORVEXA maps it against the hospital you chose, showing approved limits and likely out-of-pocket cost.",
    duration: "2 minutes",
    icon: Calculator,
  },
  {
    id: "step-preauth",
    title: "Send pre-authorisation",
    description:
      "Our claims desk files the pre-auth with treating-doctor notes, cost estimate and policy documents on your behalf.",
    duration: "Same day",
    icon: FileText,
  },
  {
    id: "step-approval",
    title: "Get hospital approval",
    description:
      "Track approval status in the dashboard. We chase the insurer's TPA and flag every query that needs your action.",
    duration: "24–72 hours",
    icon: ShieldCheck,
  },
  {
    id: "step-reimbursement",
    title: "Settle and reimburse",
    description:
      "For cashless admissions the hospital bills the insurer directly. For reimbursement, we assemble the claim pack and follow it to payout.",
    duration: "7–15 days",
    icon: ReceiptIndianRupee,
  },
];

export const insuranceGuides: InsuranceGuide[] = [
  {
    id: "guide-choose-cover",
    title: "Choosing the right cover",
    description: "A practical rule of thumb for how much sum insured a household actually needs.",
    icon: Wallet,
    points: [
      "Aim for at least 50% of annual household income as sum insured",
      "Metro households should start at ₹10 lakh given private room tariffs",
      "Prefer a plan with a low room-rent cap or none at all",
    ],
  },
  {
    id: "guide-waiting-periods",
    title: "Waiting periods decoded",
    description: "What the initial, pre-existing and specific-disease waiting periods really mean.",
    icon: HeartHandshake,
    points: [
      "Initial waiting period of 30 days covers accidents immediately, illness later",
      "Pre-existing conditions are covered only after the declared waiting period",
      "Maternity typically needs 24–36 months of continuous cover",
    ],
  },
  {
    id: "guide-claim-rejection",
    title: "Avoiding claim rejections",
    description: "The four documentation gaps that cause most rejections in India.",
    icon: ShieldCheck,
    points: [
      "Disclose pre-existing conditions at purchase, not at claim time",
      "Keep discharge summary and investigation reports in one folder",
      "Inform the insurer within 24 hours of an emergency admission",
    ],
  },
];
