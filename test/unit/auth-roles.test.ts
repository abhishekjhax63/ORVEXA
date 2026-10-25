import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  APP_ROLES,
  canGrantRole,
  landingPathForRoles,
  landingPathForUser,
  navigationForRoles,
  permissionsForRoles,
  primaryRole,
  roleHasPermission,
  type AppRole,
} from "@/lib/auth/roles";

/**
 * Every route that has a `page.tsx` on disk, derived from the App Router layout
 * rather than from a hand-kept list so it cannot drift. Route groups in
 * parentheses are filesystem-only and never appear in a URL.
 *
 * This is what makes the tests below meaningful: they assert the console never
 * advertises a destination the application cannot serve. Before it existed, the
 * navigation offered 114 links of which 98 were 404s.
 */
function routesOnDisk(): Set<string> {
  const routes = new Set<string>();
  for (const entry of readdirSync(join(process.cwd(), "src/app"), { recursive: true, encoding: "utf8" })) {
    if (entry !== "page.tsx" && !entry.endsWith("/page.tsx")) continue;
    const segments = entry
      .split("/")
      .slice(0, -1)
      .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
    routes.add(segments.length === 0 ? "/" : `/${segments.join("/")}`);
  }
  return routes;
}

const ROUTES_ON_DISK = routesOnDisk();

/** `/dashboard` is not a page; `next.config.ts` redirects it to the consultation list. */
const REDIRECT_ONLY_ROUTES = new Set(["/dashboard"]);

function resolves(route: string) {
  return ROUTES_ON_DISK.has(route) || REDIRECT_ONLY_ROUTES.has(route);
}

/**
 * The landing path each platform role resolves to today.
 *
 * Four of the six consoles named in `ROLE_CONSOLE_HOME` have no page behind them
 * yet, so HOSPITAL_ADMIN, PHARMACY_PARTNER, LAB_PARTNER and INSURANCE_PARTNER
 * fall back to the account dashboard rather than being redirected into a 404.
 */
const LANDING_PATH: Record<AppRole, string> = {
  PATIENT: "/dashboard",
  DOCTOR: "/provider",
  HOSPITAL_ADMIN: "/dashboard",
  PHARMACY_PARTNER: "/dashboard",
  LAB_PARTNER: "/dashboard",
  AMBULANCE_PARTNER: "/dashboard",
  INSURANCE_PARTNER: "/dashboard",
  PLATFORM_ADMIN: "/admin",
};

describe("landingPathForRoles", () => {
  for (const role of APP_ROLES) {
    it(`maps ${role} to its landing path`, () => {
      expect(landingPathForRoles([role])).toBe(LANDING_PATH[role]);
    });

    it(`sends ${role} to a route that resolves`, () => {
      const landing = landingPathForRoles([role]);
      expect(resolves(landing), `${role} lands on ${landing}`).toBe(true);
    });
  }

  it("falls back to the patient dashboard for an account with no roles", () => {
    expect(landingPathForRoles([])).toBe("/dashboard");
  });
});

describe("landingPathForUser", () => {
  it("keeps an on-shift hospital staff member on a route that resolves", () => {
    const landing = landingPathForUser(["PATIENT"], ["NURSE"]);
    expect(resolves(landing), `NURSE lands on ${landing}`).toBe(true);
  });

  it("sends a platform staff member to the operations console", () => {
    expect(landingPathForUser(["PATIENT"], [], ["SUPPORT_AGENT"])).toBe("/admin");
  });

  it("falls back to the role landing path when there are no memberships", () => {
    expect(landingPathForUser(["DOCTOR"])).toBe("/provider");
  });
});

describe("navigationForRoles", () => {
  it("only advertises routes that have a page behind them", () => {
    const dead: string[] = [];
    for (const role of APP_ROLES) {
      for (const section of navigationForRoles([role])) {
        for (const item of section.items) {
          if (!resolves(item.href)) dead.push(`${role} → ${item.href}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it("leaves every role something it can actually open", () => {
    for (const role of APP_ROLES) {
      const items = navigationForRoles([role]).flatMap((section) => section.items);
      expect(items.length, `${role} has an empty console`).toBeGreaterThan(0);
    }
  });
});

describe("capability predicates", () => {
  it("does not grant administrative capability to ordinary roles", () => {
    expect(roleHasPermission("PATIENT", "role.grant")).toBe(false);
    expect(roleHasPermission("PATIENT", "user.administer")).toBe(false);
    expect(roleHasPermission("DOCTOR", "user.administer")).toBe(false);
    expect(roleHasPermission("PHARMACY_PARTNER", "platform.console_access")).toBe(false);
    expect(roleHasPermission("PATIENT", "audit.read")).toBe(false);
  });

  it("grants administrative capability to the platform administrator", () => {
    expect(roleHasPermission("PLATFORM_ADMIN", "role.grant")).toBe(true);
    expect(roleHasPermission("PLATFORM_ADMIN", "user.administer")).toBe(true);
  });

  it("gives every role emergency access", () => {
    const permissions = permissionsForRoles(["PATIENT"]);
    expect(permissions.has("emergency.raise")).toBe(true);
    expect(permissions.has("emergency.contacts_manage")).toBe(true);
  });

  it("gives a self-service permission without leaking the provider power", () => {
    const permissions = permissionsForRoles(["PATIENT"]);
    expect(permissions.has("pharmacy.order_own")).toBe(true);
    expect(permissions.has("pharmacy.portal_access")).toBe(false);
  });
});

describe("primaryRole", () => {
  it("picks the highest-priority role", () => {
    expect(primaryRole(["PATIENT", "DOCTOR"])).toBe("DOCTOR");
    expect(primaryRole(["DOCTOR", "PLATFORM_ADMIN"])).toBe("PLATFORM_ADMIN");
  });

  it("defaults to PATIENT when no role is known", () => {
    expect(primaryRole([])).toBe("PATIENT");
  });
});

describe("canGrantRole", () => {
  it("refuses a self-grant", () => {
    const result = canGrantRole({
      actorUserId: "u1",
      actorRoles: ["PLATFORM_ADMIN"],
      targetUserId: "u1",
      roleToGrant: "DOCTOR",
    });
    expect(result.allowed).toBe(false);
  });

  it("refuses a grant from a non-administrator", () => {
    const result = canGrantRole({
      actorUserId: "u1",
      actorRoles: ["DOCTOR"],
      targetUserId: "u2",
      roleToGrant: "PATIENT",
    });
    expect(result.allowed).toBe(false);
  });

  it("allows a platform administrator to grant a role to another user", () => {
    const result = canGrantRole({
      actorUserId: "u1",
      actorRoles: ["PLATFORM_ADMIN"],
      targetUserId: "u2",
      roleToGrant: "DOCTOR",
    });
    expect(result.allowed).toBe(true);
  });
});
