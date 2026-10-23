import "server-only";

import { hasPermission } from "@/lib/auth/guards";
import { readSessionToken, resolveSessionToken, type AuthenticatedUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/roles";

/**
 * Session resolution for Route Handlers.
 *
 * Server Components and Server Actions use `getCurrentUser()`, which is
 * request-memoised by React. Handlers resolve the session cookie directly so the
 * same code path works for a `fetch` from the browser and for a provider
 * callback that arrives with no React render in progress.
 *
 * Nothing here trusts the request body: the acting user always comes from the
 * session row in the database.
 */
export async function getRouteUser(): Promise<AuthenticatedUser | null> {
  const token = await readSessionToken();
  if (!token) return null;
  return resolveSessionToken(token);
}

export type RouteSession =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

export function jsonOk<T extends Record<string, unknown>>(payload: T, init?: ResponseInit) {
  return Response.json({ ok: true, ...payload }, init);
}

/** 401 for a missing session, 403 when the session lacks the permission. */
export async function requireRoutePermission(permission: Permission): Promise<RouteSession> {
  const user = await getRouteUser();
  if (!user) return { ok: false, response: jsonError(401, "You need to sign in to continue.") };
  if (!hasPermission(user, permission)) {
    return { ok: false, response: jsonError(403, "You do not have permission to perform this action.") };
  }
  return { ok: true, user };
}

/**
 * A body that is not JSON, or is JSON of the wrong shape, must produce a
 * readable 400 rather than an unhandled parse error in the logs.
 */
export async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: jsonError(400, "Send this request as JSON.") };
  }
}

/** Flattens a Zod error into the field map the forms already understand. */
export function zodFieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}
