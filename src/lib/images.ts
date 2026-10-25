import { cn } from "@/lib/utils";
import type { Doctor, Hospital } from "@/types";

/**
 * ORVEXA Authentic Healthcare Imagery Service.
 *
 * In accordance with medical ethics and accuracy standards:
 * - Real doctors and hospitals are NEVER depicted using synthetic or AI-generated portraits/facades.
 * - Where an authentic verified photograph is available, it is served with clear provenance and licensing attribution.
 * - When an authentic photograph has not been verified or is unavailable, a neutral, dignified medical placeholder is rendered.
 */

export type ImageSize =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";

/**
 * Neutral clinical SVG placeholder data URI for facilities and providers.
 * Pure SVG, zero external network dependency, hermetic and WCAG accessible.
 */
export function getNeutralMedicalPlaceholder(
  type: "hospital" | "doctor" | "clinic" | "general" = "hospital",
  title?: string,
): string {
  const icon =
    type === "doctor"
      ? `<circle cx="50" cy="38" r="18" fill="#4a8a62" opacity="0.85"/>
         <path d="M22 82c0-15.464 12.536-28 28-28s28 12.536 28 28" fill="#4a8a62" opacity="0.6"/>
         <path d="M44 48c0 4 2.5 8 6 8s6-4 6-8" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
         <path d="M50 56v10m-4 10h8" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
      : `<rect x="25" y="28" width="50" height="52" rx="4" fill="#356e4b" opacity="0.75"/>
         <path d="M20 80h60" stroke="#24563a" stroke-width="4" stroke-linecap="round"/>
         <rect x="33" y="38" width="8" height="10" rx="1.5" fill="#ffffff" opacity="0.9"/>
         <rect x="59" y="38" width="8" height="10" rx="1.5" fill="#ffffff" opacity="0.9"/>
         <rect x="33" y="54" width="8" height="10" rx="1.5" fill="#ffffff" opacity="0.9"/>
         <rect x="59" y="54" width="8" height="10" rx="1.5" fill="#ffffff" opacity="0.9"/>
         <path d="M50 34v16m-8-8h16" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
         <path d="M46 80v-14h8v14" fill="#123b2a"/>`;

  const label = title ? title.slice(0, 32) : type === "doctor" ? "Doctor Profile" : "Healthcare Facility";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#08291d" />
        <stop offset="100%" stop-color="#123b2a" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#bgGrad)"/>
    <g transform="translate(0, -4)">
      ${icon}
    </g>
    <text x="50" y="93" font-family="system-ui, sans-serif" font-size="5" font-weight="600" fill="#9bc7a8" text-anchor="middle" letter-spacing="0.5">
      ${label.toUpperCase()}
    </text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Curated authentic editorial photography with confirmed license & provenance.
 * Used for general educational topics and marketing backgrounds.
 */
export const AUTHENTIC_EDITORIAL_ASSETS = {
  heroDoctor:
    "https://images.unsplash.com/photo-1594824813629-6e3e1dfb5c90?auto=format&fit=crop&w=1200&q=80",
  heroDoctorAttribution: "Photo by Usman Yousaf on Unsplash (Unsplash Commercial License)",
  consultation:
    "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1200&q=80",
  consultationAttribution: "Photo by National Cancer Institute on Unsplash (Public Domain / US Gov)",
  records:
    "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80",
  recordsAttribution: "Photo by National Cancer Institute on Unsplash (Public Domain)",
  pharmacyQuality:
    "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1200&q=80",
  pharmacyQualityAttribution: "Photo by Kendal on Unsplash (Unsplash License)",
  hospitalArchitecture:
    "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80",
  hospitalArchitectureAttribution: "Photo by Martha Dominguez on Unsplash (Unsplash License)",
} as const;

/**
 * Replaces synthetic AI generation with authentic photography or neutral clinical placeholder.
 */
export function healthImage(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("consult") || p.includes("video") || p.includes("telemedicine")) {
    return AUTHENTIC_EDITORIAL_ASSETS.consultation;
  }
  if (p.includes("record") || p.includes("lab") || p.includes("diagnostic")) {
    return AUTHENTIC_EDITORIAL_ASSETS.records;
  }
  if (p.includes("pharmacy") || p.includes("medicine")) {
    return AUTHENTIC_EDITORIAL_ASSETS.pharmacyQuality;
  }
  if (p.includes("doctor") || p.includes("physician") || p.includes("specialist")) {
    return AUTHENTIC_EDITORIAL_ASSETS.heroDoctor;
  }
  if (p.includes("hospital") || p.includes("centre") || p.includes("clinic")) {
    return AUTHENTIC_EDITORIAL_ASSETS.hospitalArchitecture;
  }
  return AUTHENTIC_EDITORIAL_ASSETS.heroDoctor;
}

/**
 * Returns authentic image details for a hospital.
 * If authentic verified photo is not present, returns a neutral placeholder state.
 */
export function getHospitalImage(hospital: Hospital): {
  url: string;
  isAuthentic: boolean;
  attribution: string | null;
} {
  if (hospital.authenticImageUrl) {
    return {
      url: hospital.authenticImageUrl,
      isAuthentic: true,
      attribution: hospital.imageAttribution ?? "Verified Facility Photograph",
    };
  }
  return {
    url: getNeutralMedicalPlaceholder("hospital", hospital.name),
    isAuthentic: false,
    attribution: "Facility photograph pending official verification",
  };
}

/**
 * Returns authentic image details for a doctor.
 * If an official portrait is not present in records, returns a neutral medical placeholder.
 */
export function getDoctorImage(doctor: Doctor): {
  url: string;
  isAuthentic: boolean;
  attribution: string | null;
} {
  if (doctor.authenticImageUrl) {
    return {
      url: doctor.authenticImageUrl,
      isAuthentic: true,
      attribution: doctor.imageAttribution ?? "Verified Practitioner Portrait",
    };
  }
  return {
    url: getNeutralMedicalPlaceholder("doctor", doctor.name),
    isAuthentic: false,
    attribution: "Official portrait pending registry verification",
  };
}

/** Aspect-ratio helpers */
export const imageAspect: Record<ImageSize, string> = {
  square_hd: "aspect-square",
  square: "aspect-square",
  portrait_4_3: "aspect-[3/4]",
  portrait_16_9: "aspect-[9/16]",
  landscape_4_3: "aspect-[4/3]",
  landscape_16_9: "aspect-video",
};

export function imageFrame(size: ImageSize, className?: string) {
  return cn("overflow-hidden", imageAspect[size], className);
}
