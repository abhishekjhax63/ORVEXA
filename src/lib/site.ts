/**
 * Single source of truth for brand copy, contact details and navigation.
 * Keeping this centralised avoids drift between the header, footer, sitemap
 * and marketing pages.
 */

export const siteConfig = {
  name: "ORVEXA",
  legalName: "ORVEXA Health Technologies Pvt. Ltd.",
  tagline: "One ecosystem for every health decision",
  description:
    "ORVEXA brings hospitals, doctors, diagnostics, pharmacy delivery, insurance and AI-assisted care guidance into a single, trusted healthcare platform built for India.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.orvexa.health",
  supportEmail: "care@orvexa.health",
  supportPhone: "+91 1800 200 4000",
  emergencyNumber: "108",
  address: "Prestige Tech Park, Outer Ring Road, Bengaluru, Karnataka 560103",
  locale: "en-IN",
} as const;

/**
 * Resolved once when the module loads so prerendered routes never read the
 * clock during render (Cache Components rejects that as an unstable value).
 */
export const copyrightYear = new Date().getFullYear();

export type NavItem = {
  title: string;
  href: string;
  description?: string;
  badge?: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

/** Links rendered inline in the desktop navbar. */
export const primaryNav: NavItem[] = [
  { title: "Services", href: "/services", description: "Every ORVEXA care module" },
  { title: "Hospitals & Doctors", href: "/hospitals", description: "Verified providers near you" },
  { title: "Pharmacy", href: "/pharmacy", description: "Medicines delivered in 90 minutes" },
  { title: "AI Assistant", href: "/ai-assistant", description: "Guided symptom triage" },
];

/** Grouped links surfaced through the navbar "More" menu. */
export const secondaryNav: NavGroup[] = [
  {
    title: "Care services",
    items: [
      { title: "Diagnostics", href: "/diagnostics", description: "Lab tests and home collection" },
      { title: "Insurance", href: "/insurance", description: "Compare and claim easily" },
      { title: "Telemedicine", href: "/services#telemedicine", description: "Consult in minutes" },
      { title: "Emergency SOS", href: "/emergency", description: "Raise an incident, find nearby care", badge: "24×7" },
    ],
  },
  {
    title: "Company",
    items: [
      { title: "About ORVEXA", href: "/about", description: "Our clinical mission" },
      { title: "For providers", href: "/about#providers", description: "List your hospital" },
      { title: "Help centre", href: "/help", description: "Answers and support" },
      { title: "Contact", href: "/contact", description: "Talk to our team" },
    ],
  },
];

export const footerNav: NavGroup[] = [
  {
    title: "Care",
    items: [
      { title: "All services", href: "/services" },
      { title: "Hospitals & Doctors", href: "/hospitals" },
      { title: "Diagnostics", href: "/diagnostics" },
      { title: "Pharmacy", href: "/pharmacy" },
      { title: "Insurance", href: "/insurance" },
      { title: "AI Health Assistant", href: "/ai-assistant" },
    ],
  },
  {
    title: "Patients",
    items: [
      { title: "Patient dashboard", href: "/dashboard" },
      { title: "Book an appointment", href: "/hospitals" },
      { title: "Health records", href: "/dashboard/records" },
      { title: "Emergency SOS", href: "/emergency" },
      { title: "Sign in", href: "/login" },
      { title: "Create account", href: "/register" },
    ],
  },
  {
    title: "Company",
    items: [
      { title: "About", href: "/about" },
      { title: "Contact", href: "/contact" },
      { title: "Help centre", href: "/help" },
      { title: "Privacy policy", href: "/privacy" },
      { title: "Terms of service", href: "/terms" },
    ],
  },
];

/** Named anchors used by in-page "jump to section" navigation. */
export const homeSections = [
  { id: "search", label: "Find care" },
  { id: "services", label: "Services" },
  { id: "ai-assistant", label: "AI assistant" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "insurance", label: "Insurance" },
  { id: "telemedicine", label: "Telemedicine" },
  { id: "trust", label: "Trust" },
] as const;
