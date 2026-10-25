/**
 * Single source of truth for brand copy, contact details and navigation.
 * Keeping this centralised avoids drift between the header, footer, sitemap
 * and marketing pages.
 */

export const siteConfig = {
  name: "ORVEXA",
  legalName: "ORVEXA",
  tagline: "One ecosystem for every health decision",
  description:
    "ORVEXA is a healthcare platform prototype with a supplied Patna provider directory and AI-assisted guidance features that depend on deployment configuration.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.orvexa.health",
  supportEmail: "flex8india@gmail.com",
  supportPhone: "7061241812",
  emergencyNumber: "108",
  address: "Amity University Patna, Bailey Road, 801503, Patna, Bihar",
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
  { title: "Hospitals & Doctors", href: "/hospitals", description: "Supplied, unverified Patna listings" },
  { title: "Pharmacy", href: "/pharmacy", description: "Browse pharmacy information" },
  { title: "AI Assistant", href: "/assistant", description: "AI workspace and image analysis" },
];

/** Grouped links surfaced through the navbar "More" menu. */
export const secondaryNav: NavGroup[] = [
  {
    title: "Care Services",
    items: [
      { title: "Diagnostics", href: "/diagnostics", description: "Sample packages; no lab booking" },
      { title: "Insurance", href: "/insurance", description: "Information; no insurer integration" },
      { title: "Telemedicine", href: "/services#telemedicine", description: "Telemedicine service status" },
    ],
  },
  {
    title: "Emergency",
    items: [
      { title: "Emergency information", href: "/emergency", description: "Call 108 directly; ORVEXA cannot dispatch" },
    ],
  },
  {
    title: "AI workspace",
    items: [
      { title: "AI Assistant", href: "/assistant", description: "AI workspace and image analysis" },
    ],
  },
  {
    title: "Account",
    items: [
      { title: "Sign in", href: "/login", description: "Access your dashboard" },
      { title: "Create account", href: "/register", description: "Join ORVEXA" },
    ],
  },
  {
    title: "Company",
    items: [
      { title: "About", href: "/about", description: "About ORVEXA" },
      { title: "Help centre", href: "/help", description: "Project information and service status" },
      { title: "Contact", href: "/contact", description: "Provided contact details" },
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
      { title: "AI Health Assistant", href: "/assistant" },
    ],
  },
  {
    title: "Patients",
    items: [
      { title: "Browse provider listings", href: "/hospitals" },
      { title: "Emergency information", href: "/emergency" },
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
