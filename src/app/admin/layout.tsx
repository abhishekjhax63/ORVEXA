import type { Metadata } from "next";

import { ConsoleShell } from "@/components/console/console-shell";
import { navigationForRoles } from "@/lib/auth/roles";
import { requireConsoleAccess } from "@/lib/platform/console";

/**
 * The console shell.
 *
 * This layout is the only thing standing between an ordinary user and the
 * administrative UI, and it is deliberately *not* the only thing standing
 * between them and the data: it refuses to render for an account with no
 * console access at all, and every page and API route inside re-checks its own
 * permission on the server. A layout is a presentation boundary, and a
 * presentation boundary must never be the last line of defence.
 *
 * The navigation handed to the shell is derived here, from the permissions the
 * acting account holds, so the sidebar cannot offer a queue the account would
 * then be refused.
 */

export const metadata: Metadata = {
  title: {
    default: "Operations console",
    template: "%s · ORVEXA operations",
  },
  description: "The ORVEXA platform operations console.",
  robots: { index: false, follow: false },
};

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const context = await requireConsoleAccess({ nextPath: "/admin" });

  const nav = navigationForRoles(
    context.user.roles,
    context.user.hospitalMemberships.flatMap((membership) =>
      membership.staffRole ? [membership.staffRole] : [],
    ),
    context.user.platformStaffMemberships.map((membership) => membership.role),
  );

  return (
    <ConsoleShell
      nav={nav}
      operatorName={context.user.fullName}
      operatorEmail={context.user.email}
      consoleRoles={context.staffRoleLabels}
      isPlatformAdmin={context.isPlatformAdminRole}
    >
      {children}
    </ConsoleShell>
  );
}
