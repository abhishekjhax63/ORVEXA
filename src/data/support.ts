import {
  BookOpen,
  CreditCard,
  FileText,
  LifeBuoy,
  MessageSquare,
  Microscope,
  PackageCheck,
  PhoneCall,
  Pill,
  ShieldCheck,
  Siren,
  UserRound,
} from "lucide-react";

import type { Faq, HelpTopic, SupportChannel } from "@/types";

/** DEMO DATA — support content for the help centre and contact page. */

export const helpTopics: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Create your ORVEXA account, add family members and link ABHA.",
    icon: BookOpen,
    articleCount: 14,
  },
  {
    id: "appointments",
    title: "Appointments & consultations",
    description: "Booking, rescheduling, cancellations, refunds and video setup.",
    icon: UserRound,
    articleCount: 21,
  },
  {
    id: "pharmacy",
    title: "MediCare pharmacy",
    description: "Prescription upload, delivery windows, returns and cold chain items.",
    icon: Pill,
    articleCount: 18,
  },
  {
    id: "diagnostics",
    title: "Diagnostics & reports",
    description: "Home collection prep, fasting rules, report access and corrections.",
    icon: Microscope,
    articleCount: 16,
  },
  {
    id: "insurance",
    title: "Insurance & payments",
    description: "Coverage checks, cashless approvals, invoices and reimbursement.",
    icon: ShieldCheck,
    articleCount: 19,
  },
  {
    id: "account-privacy",
    title: "Account & privacy",
    description: "Data sharing controls, consent history, deletion and security.",
    icon: FileText,
    articleCount: 12,
  },
];

export const supportChannels: SupportChannel[] = [
  {
    id: "chat",
    title: "In-app chat",
    description: "Fastest route for booking, order and dashboard questions.",
    actionLabel: "Open chat",
    href: "/contact#chat",
    icon: MessageSquare,
    meta: "Average first reply: 90 seconds",
  },
  {
    id: "call",
    title: "Care desk phone",
    description: "Speak to a human coordinator, available round the clock.",
    actionLabel: "Call 1800 200 4000",
    href: "tel:+9118002004000",
    icon: PhoneCall,
    meta: "24×7, toll free in India",
  },
  {
    id: "emergency",
    title: "Emergency line",
    description: "Ambulance dispatch and trauma coordination.",
    actionLabel: "Call 108",
    href: "tel:108",
    icon: Siren,
    meta: "Immediate dispatch",
  },
  {
    id: "email",
    title: "Email support",
    description: "Documentation, claims paperwork and formal escalations.",
    actionLabel: "Email care desk",
    href: "mailto:care@orvexa.health",
    icon: LifeBuoy,
    meta: "Reply within 8 working hours",
  },
];

export const faqs: Faq[] = [
  {
    id: "faq-1",
    category: "getting-started",
    question: "How do I create an ORVEXA account?",
    answer:
      "Create an account from the registration page using your mobile number or email. We verify with an OTP, then ask for basic details so records and appointments stay linked to the right person. You can add family members immediately after.",
  },
  {
    id: "faq-2",
    category: "getting-started",
    question: "Is ORVEXA available across India?",
    answer:
      "Provider discovery, telemedicine, diagnostics and MediCare pharmacy already cover 40 Indian cities. Emergency ambulance dispatch is live in 18 cities during this phase and continues to expand.",
  },
  {
    id: "faq-3",
    category: "appointments",
    question: "Can I reschedule or cancel an appointment?",
    answer:
      "Yes. Open the appointment in your dashboard and choose Reschedule or Cancel. Rescheduling is free up to two hours before the slot; cancellations within two hours may be subject to the provider's policy.",
  },
  {
    id: "faq-4",
    category: "appointments",
    question: "What happens if a video consultation drops?",
    answer:
      "The consultation stays open for 15 minutes and the doctor can restart the call. If it cannot be completed, our care desk arranges a free re-consult or a full refund automatically.",
  },
  {
    id: "faq-5",
    category: "appointments",
    question: "Are the consultation fees on ORVEXA final?",
    answer:
      "The fee shown at booking is the provider's consultation charge. Procedure, investigation and facility costs are quoted separately by the hospital before you consent to treatment.",
  },
  {
    id: "faq-6",
    category: "pharmacy",
    question: "Do I need a prescription to order medicines?",
    answer:
      "Schedule H and H1 medicines require a valid prescription, which you can upload as a photo or PDF. Over-the-counter products and devices do not need one. A licensed pharmacist reviews every order before dispatch.",
  },
  {
    id: "faq-7",
    category: "pharmacy",
    question: "How fast is delivery, and what about cold chain items?",
    answer:
      "Express delivery in metro pin codes is typically 90 minutes, same-day elsewhere. Insulin and other cold-chain items travel in validated temperature-controlled packaging with a temperature log.",
  },
  {
    id: "faq-8",
    category: "diagnostics",
    question: "Which tests need fasting?",
    answer:
      "Fasting blood sugar, lipid profile and most full-body panels need 10–12 hours of fasting with water permitted. Each test page lists its requirement before you confirm the booking, and the phlebotomist repeats it on the day.",
  },
  {
    id: "faq-9",
    category: "diagnostics",
    question: "How do I access my diagnostic reports?",
    answer:
      "Reports are pushed to your ORVEXA records as soon as the lab validates them, with a notification. You can download a PDF or share a time-bound link with any doctor, including those outside ORVEXA.",
  },
  {
    id: "faq-10",
    category: "insurance",
    question: "How does the free coverage check work?",
    answer:
      "Enter your policy number and insurer. We match it against the hospital you selected, show the approved room category, estimated out-of-pocket cost and whether cashless approval is available.",
  },
  {
    id: "faq-11",
    category: "insurance",
    question: "Who files the claim paperwork?",
    answer:
      "The ORVEXA claims desk prepares and submits pre-authorisation and reimbursement packs, tracks queries from the insurer's TPA and alerts you only when a patient signature or document is required.",
  },
  {
    id: "faq-12",
    category: "account-privacy",
    question: "Who can see my health records?",
    answer:
      "Only you control access. Records are encrypted at rest, and every share is a time-bound, revocable link with an audit entry in your consent history.",
  },
];

export const contactTopics = [
  { id: "general", label: "General enquiry" },
  { id: "booking", label: "Appointment help" },
  { id: "pharmacy", label: "Pharmacy order" },
  { id: "diagnostics", label: "Diagnostics and reports" },
  { id: "insurance", label: "Insurance and claims" },
  { id: "provider", label: "List my hospital or clinic" },
  { id: "press", label: "Press and partnerships" },
];

export const quickActions = [
  { id: "track-order", label: "Track a MediCare order", icon: PackageCheck, href: "/dashboard" },
  { id: "refund", label: "Request a refund", icon: CreditCard, href: "/contact" },
  { id: "reports", label: "Download a report", icon: FileText, href: "/dashboard/records" },
  { id: "records", label: "Share records with a doctor", icon: ShieldCheck, href: "/dashboard/records" },
];
