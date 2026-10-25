import {
  BookOpen,
  FileText,
  LifeBuoy,
  Microscope,
  PhoneCall,
  Pill,
  ShieldCheck,
  Siren,
  UserRound,
} from "lucide-react";

import { siteConfig } from "@/lib/site";
import type { Faq, HelpTopic, SupportChannel } from "@/types";

/** DEMO DATA — support content for the help centre and contact page. */

export const helpTopics: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Sign-in and registration depend on the authentication and database configuration.",
    icon: BookOpen,
    articleCount: 2,
  },
  {
    id: "appointments",
    title: "Appointments & consultations",
    description: "The supplied provider directory is static; appointments and video consultations are not connected.",
    icon: UserRound,
    articleCount: 3,
  },
  {
    id: "pharmacy",
    title: "MediCare pharmacy",
    description: "Sample product information only; prescription checks, orders and delivery are not available.",
    icon: Pill,
    articleCount: 2,
  },
  {
    id: "diagnostics",
    title: "Diagnostics & reports",
    description: "Sample package listings only; there is no connected laboratory, booking or report delivery.",
    icon: Microscope,
    articleCount: 2,
  },
  {
    id: "insurance",
    title: "Insurance & payments",
    description: "No insurer or claims workflow is connected to this project.",
    icon: ShieldCheck,
    articleCount: 2,
  },
  {
    id: "account-privacy",
    title: "Account & privacy",
    description: "Review the current project status; patient dashboard and health-record features are not available.",
    icon: FileText,
    articleCount: 1,
  },
];

export const supportChannels: SupportChannel[] = [
  {
    id: "call",
    title: "Phone",
    description: "Call the phone number provided for this project.",
    actionLabel: `Call ${siteConfig.supportPhone}`,
    href: `tel:${siteConfig.supportPhone.replace(/\s/g, "")}`,
    icon: PhoneCall,
    meta: "Availability and response times are not verified",
  },
  {
    id: "emergency",
    title: "Emergency line",
    description: "Call 108 directly for an emergency; ORVEXA cannot dispatch.",
    actionLabel: "Call 108",
    href: "tel:108",
    icon: Siren,
    meta: "External emergency service",
  },
  {
    id: "email",
    title: "Email",
    description: "Email the address provided for this project.",
    actionLabel: "Email ORVEXA",
    href: `mailto:${siteConfig.supportEmail}`,
    icon: LifeBuoy,
    meta: "No response-time commitment is confirmed",
  },
];

export const faqs: Faq[] = [
  {
    id: "faq-1",
    category: "getting-started",
    question: "How do I create an ORVEXA account?",
    answer:
      "Use the registration page to start creating an account. Sign-up, verification and account features require the deployment's authentication and database services to be configured; do not assume they are available.",
  },
  {
    id: "faq-2",
    category: "getting-started",
    question: "Is ORVEXA available across India?",
    answer:
      "The provider directory currently contains static, unverified Patna listings. Other services depend on deployment configuration and connected providers; the website does not claim nationwide availability or guarantee emergency dispatch.",
  },
  {
    id: "faq-3",
    category: "appointments",
    question: "Can I reschedule or cancel an appointment?",
    answer:
      "ORVEXA does not currently book appointments from the static provider directory. Contact a provider directly to ask about scheduling or cancellation.",
  },
  {
    id: "faq-4",
    category: "appointments",
    question: "What happens if a video consultation drops?",
    answer:
      "Video consultations and doctor handoff are not connected in this project. Contact a qualified provider directly for care.",
  },
  {
    id: "faq-5",
    category: "appointments",
    question: "Are the consultation fees on ORVEXA final?",
    answer:
      "The provider directory does not list verified consultation fees and has no booking flow. Confirm all charges with the provider before an appointment.",
  },
  {
    id: "faq-6",
    category: "pharmacy",
    question: "Do I need a prescription to order medicines?",
    answer:
      "ORVEXA's pharmacy page is a sample catalogue only. It does not accept prescriptions, sell medicines or dispatch orders. Ask a licensed pharmacist about prescription requirements.",
  },
  {
    id: "faq-7",
    category: "pharmacy",
    question: "How fast is delivery, and what about cold chain items?",
    answer:
      "No delivery or cold-chain service is connected to the sample catalogue. Do not rely on its illustrative delivery estimates.",
  },
  {
    id: "faq-8",
    category: "diagnostics",
    question: "Which tests need fasting?",
    answer:
      "The diagnostic package listings are sample data and are not medical instructions. Ask the licensed laboratory or clinician responsible for your test whether fasting is required.",
  },
  {
    id: "faq-9",
    category: "diagnostics",
    question: "How do I access my diagnostic reports?",
    answer:
      "ORVEXA has no connected laboratory or report-delivery integration. The patient records area is not available in this build.",
  },
  {
    id: "faq-10",
    category: "insurance",
    question: "How does the free coverage check work?",
    answer:
      "Insurance coverage checks are not connected. Confirm benefits and cashless eligibility directly with your insurer and hospital.",
  },
  {
    id: "faq-11",
    category: "insurance",
    question: "Who files the claim paperwork?",
    answer:
      "ORVEXA does not have a connected claims desk or submit insurance paperwork. Contact your insurer or TPA directly.",
  },
  {
    id: "faq-12",
    category: "account-privacy",
    question: "Who can see my health records?",
    answer:
      "The patient health-record dashboard is not available in this build. Do not upload or share sensitive medical information unless a specific feature clearly confirms that it is configured and describes how it is handled.",
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
  { id: "providers", label: "Open provider directory", icon: UserRound, href: "/hospitals" },
  { id: "pharmacy", label: "Browse sample pharmacy catalogue", icon: Pill, href: "/pharmacy" },
  { id: "diagnostics", label: "Browse sample diagnostics", icon: Microscope, href: "/diagnostics" },
  { id: "emergency", label: "Emergency information", icon: Siren, href: "/emergency" },
];
