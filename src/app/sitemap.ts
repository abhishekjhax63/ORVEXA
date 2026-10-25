import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";

type Entry = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

/**
 * The publicly indexable surface: marketing and information pages only.
 * Authentication, dashboard, console and personal-health routes are omitted
 * here and disallowed in `robots.ts`.
 */
const PUBLIC_ROUTES: Entry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/services", changeFrequency: "monthly", priority: 0.9 },
  { path: "/hospitals", changeFrequency: "weekly", priority: 0.9 },
  { path: "/assistant", changeFrequency: "monthly", priority: 0.8 },
  { path: "/ai-assistant", changeFrequency: "monthly", priority: 0.7 },
  { path: "/diagnostics", changeFrequency: "monthly", priority: 0.7 },
  { path: "/pharmacy", changeFrequency: "monthly", priority: 0.7 },
  { path: "/insurance", changeFrequency: "monthly", priority: 0.7 },
  { path: "/telemedicine", changeFrequency: "monthly", priority: 0.7 },
  { path: "/emergency", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about", changeFrequency: "yearly", priority: 0.5 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/help", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

/**
 * No `lastModified` is published: this repository has no per-page modification
 * timestamp, and emitting the build time would claim every page changed on
 * every deploy. Omitting it is the honest option.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${siteConfig.url}${route.path === "/" ? "" : route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
