import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";

/**
 * Private and back-office areas are excluded from crawling. They hold per-user
 * data and are additionally sent `X-Robots-Tag: noindex, nofollow` by the
 * response header rules in `next.config.ts`, so this is the second layer.
 */
const DISALLOW = [
  "/admin",
  "/dashboard",
  "/assistant/history",
  "/care",
  "/hospital",
  "/lab",
  "/insurer",
  "/pharmacy/portal",
  "/provider/telemedicine",
  "/consult",
  "/api",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/access-denied",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DISALLOW,
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
