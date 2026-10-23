import "server-only";

import { headers } from "next/headers";

/** Request metadata attached to audit events and sessions. */
export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

function firstForwardedIp(value: string | null) {
  if (!value) return undefined;
  const [first] = value.split(",");
  const candidate = first?.trim();
  return candidate && candidate.length > 0 ? candidate.slice(0, 64) : undefined;
}

export function clientIpFromHeaders(headerList: Headers): string | undefined {
  return (
    firstForwardedIp(headerList.get("x-forwarded-for")) ??
    headerList.get("x-real-ip")?.slice(0, 64) ??
    undefined
  );
}

/** Best-effort request context; never throws if read outside a request. */
export async function getRequestContext(): Promise<RequestContext> {
  try {
    const headerList = await headers();
    return {
      ipAddress: clientIpFromHeaders(headerList),
      userAgent: headerList.get("user-agent")?.slice(0, 320) ?? undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Server Action and Route Handler requests must originate from our own origin.
 * Server Actions have their own Origin/Host check in the framework; Route
 * Handlers (file uploads, maintenance endpoints) use this helper so a
 * cross-site form cannot trigger a state change with the victim's cookies.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Same-origin form posts and non-browser clients omit Origin.
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
