import type { NextConfig } from "next";

import { SECURITY_HEADERS, SENSITIVE_AREA_HEADERS } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // Applied to every response, including static assets, so an uploaded
        // file can never be sniffed into something executable.
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
      {
        // Authenticated and administrative areas: per-user data, so it may not
        // be held in a shared cache or listed by a crawler.
        source: "/admin/:path*",
        headers: [...SENSITIVE_AREA_HEADERS],
      },
      {
        source: "/dashboard/:path*",
        headers: [...SENSITIVE_AREA_HEADERS],
      },
      {
        source: "/hospital/:path*",
        headers: [...SENSITIVE_AREA_HEADERS],
      },
      {
        source: "/api/admin/:path*",
        headers: [...SENSITIVE_AREA_HEADERS],
      },
    ];
  },
  turbopack: {
    // Keep the workspace root scoped to this project so Turbopack does not
    // walk up into unrelated lockfiles on the machine.
    root: process.cwd(),
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  images: {
    // Healthcare imagery is served through the platform image service.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "coresg-normal.trae.ai",
        pathname: "/api/ide/v1/text_to_image",
      },
    ],
  },
};

export default nextConfig;
