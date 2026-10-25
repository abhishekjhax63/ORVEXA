import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ConsoleCallout, ConsolePageHeader, ConsoleSection } from "@/components/console/console-page";
import { NavIcon } from "@/components/console/nav-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { navigationForRoles } from "@/lib/auth/roles";
import { requireConsoleAccess } from "@/lib/platform/console";

export const metadata: Metadata = {
  title: "Operations console",
  description: "The queues this account may work.",
};

/**
 * The console landing page.
 *
 * It answers one question — "what can I actually do here" — and answers it from
 * the same navigation the sidebar uses, so the two cannot disagree. It shows no
 * metrics: a headline number on a landing page is read without its filters, and
 * each workspace states its own counts next to the definition of what it
 * counted.
 */
export default async function ConsoleHomePage() {
  const context = await requireConsoleAccess({ nextPath: "/admin" });

  const nav = navigationForRoles(
    context.user.roles,
    context.user.hospitalMemberships.flatMap((membership) =>
      membership.staffRole ? [membership.staffRole] : [],
    ),
    context.user.platformStaffMemberships.map((membership) => membership.role),
  );

  // Every section of the navigation the account actually receives, not just the
  // platform ones. `navigationForRoles` withdraws any workspace whose pages have
  // not been written yet, so this list is what a person can open right now, and
  // it includes the consumer and emergency surfaces that reach every account.
  const reachable = nav.filter((section) => section.title !== "Your account");
  const permissions = [...context.permissions].sort();

  return (
    <div className="flex flex-col gap-8">
      <ConsolePageHeader
        eyebrow="Platform operations"
        title={`Good to see you, ${context.user.fullName.split(" ")[0]}`}
        description="This is the platform operations console. Everything below is a section your account has actually been given, and nothing else in the console is reachable from here. A workspace that is not listed is one that has not been built yet, or one your roles do not include."
      />

      {context.staffRoleLabels.length === 0 ? (
        <ConsoleCallout tone="warning" title="No operations role on this account">
          <p>
            This account reaches the console through the administrator role, which carries the platform governance
            permissions from earlier phases. It holds no operations staff role, so the Phase 11 queues — verification
            teams, support, emergency operations, security — are not available to it. An operations staff role is
            granted by an administrator from <span className="font-medium text-foreground">Operations staff</span>.
          </p>
        </ConsoleCallout>
      ) : (
        <ConsoleCallout tone="info" title="Your operations roles">
          <p>
            {context.staffRoleLabels.join(" · ")}. Each queue you can open was granted to one of these roles
            individually; a queue that is not listed below is one your role does not include.
          </p>
        </ConsoleCallout>
      )}

      {reachable.length === 0 ? (
        <ConsoleCallout tone="warning" title="Nothing is available yet">
          <p>
            No workspace is currently reachable from this account. Ask an ORVEXA administrator to grant the operations
            role for the queue you need.
          </p>
        </ConsoleCallout>
      ) : (
        <ConsoleSection
          title="What this account can reach"
          description="Every section the console will offer this account, in the same order as the sidebar. Each page states its own scope and counts."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {reachable.map((section) => (
              <Card key={section.title}>
                <CardHeader>
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <CardDescription>
                    {section.items.length} {section.items.length === 1 ? "destination" : "destinations"}
                  </CardDescription>
                </CardHeader>
                <ul className="flex flex-col gap-1 px-4 pb-5">
                  {section.items.map((item) => (
                    <li key={`${item.href}-${item.title}`}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <NavIcon name={item.icon} className="size-4 shrink-0 text-primary" />
                          <span className="truncate font-medium text-foreground">{item.title}</span>
                        </span>
                        <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </ConsoleSection>
      )}

      <ConsoleSection
        title="Everything this account may do"
        description="The permissions the server resolves for this session on every request. They are derived from roles and memberships — never from anything the browser sends."
      >
        <div className="flex flex-wrap gap-1.5">
          {permissions.map((permission) => (
            <Badge key={permission} variant="outline" className="font-mono text-[0.7rem]">
              {permission}
            </Badge>
          ))}
        </div>
      </ConsoleSection>
    </div>
  );
}
