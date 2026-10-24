/**
 * Response security headers, defined once.
 *
 * Two places apply these: `next.config.ts` (the normal response path) and
 * `src/proxy.ts` (responses the proxy produces itself, which the config-level
 * `headers()` block does not cover). Keeping one definition means a redirect
 * issued by the proxy cannot silently return a response without them.
 *
 * This module is intentionally free of `server-only` and of any runtime import:
 * `next.config.ts` is evaluated by the build, and the proxy runs outside the
 * application runtime. It is constants only.
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content Security Policy.
 *
 * What this policy is strict about: nothing may be framed (`frame-ancestors
 * 'none'`), plugins and `<base>` rewriting are off, and forms may only post back
 * to this origin — so an injected form cannot exfiltrate a session to an
 * attacker's host.
 *
 * What it is not strict about, and why: `script-src` and `style-src` carry
 * `'unsafe-inline'`. Next.js emits an inline bootstrap script and Tailwind ships
 * inline styles, and nonce-based CSP requires every page to be dynamically
 * rendered. This project renders a large number of cached, static-first pages,
 * so a nonce would force the whole application dynamic and is the wrong trade.
 * The compensating control is that this platform never injects untrusted HTML:
 * there is no `dangerouslySetInnerHTML` on user content, and React escapes what
 * it renders. `'unsafe-inline'` here therefore widens a hole that the rendering
 * layer already keeps closed.
 *
 * `connect-src` is the one that matters operationally: it names the third
 * parties the browser is allowed to talk to, so a compromised dependency cannot
 * quietly POST a patient's data to an unknown host.
 */
function contentSecurityPolicy() {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // Next.js runtime bootstrap, plus the payment and video SDKs.
    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://sdk.twilio.com",
    "style-src 'self' 'unsafe-inline'",
    // Map tiles, signed document previews and the platform image service are
    // all cross-origin; `data:`/`blob:` cover canvas-generated assets.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://api.mapbox.com",
      "https://events.mapbox.com",
      "https://api.razorpay.com",
      "https://lumberjack.razorpay.com",
    ].join(" "),
    // Mapbox GL and the video SDK both spin up workers from blobs.
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    // Razorpay Checkout is an iframe; the video product is not.
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  ];

  // In development the app is served over plain HTTP, where upgrading requests
  // would break the dev server's own connections.
  if (isProduction) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  /**
   * Two years, subdomains included. Browsers ignore this over plain HTTP, so
   * including it in development is harmless; the point is that no production
   * deployment can be talked down to HTTP even by a user who types `http://`.
   */
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  /**
   * Stops a response being re-interpreted as a different type. This is the
   * header that makes an uploaded file inert: a JPEG served from our origin
   * cannot be sniffed into HTML that executes.
   */
  { key: "X-Content-Type-Options", value: "nosniff" },
  /** CSP `frame-ancestors` covers modern browsers; this covers the rest. */
  { key: "X-Frame-Options", value: "DENY" },
  /**
   * Patient identifiers appear in URLs (`/appointments/<id>`). Sending only the
   * origin on cross-site navigation keeps those ids out of third-party logs.
   */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  /**
   * Deny the powerful browser APIs by default. Geolocation and camera are not
   * enabled here: emergency location is captured server-side, and video runs in
   * the provider's SDK, not through a raw `getUserMedia` in our own frame.
   */
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=(self)",
      "usb=()",
      "browsing-topics=()",
    ].join(", "),
  },
  /** `same-origin-allow-popups` keeps payment/identity popups working. */
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/**
 * Headers additionally applied to authenticated and administrative areas. These
 * responses are per-user and carry clinical context, so no shared cache may hold
 * them and no index may list them.
 */
export const SENSITIVE_AREA_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

export function applySecurityHeaders(headers: Headers) {
  for (const { key, value } of SECURITY_HEADERS) headers.set(key, value);
  return headers;
}
