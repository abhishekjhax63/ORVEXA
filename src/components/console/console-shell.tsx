"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, ShieldCheck, X } from "lucide-react";

import { NavIcon } from "@/components/console/nav-icon";
import { Logo } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { logout } from "@/lib/actions/auth";
import type { NavIconName, NavSection } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

/**
 * The chrome every console workspace sits inside.
 *
 * The navigation is passed in rather than imported, because it is derived on
 * the server from the permissions the acting account actually holds. This
 * component cannot widen that set: it renders the sections it is given and
 * nothing else, so a link that appears is a link the server decided to offer.
 *
 * The shell is the *last* line of defence, never the only one. Hiding a link
 * stops a mistake, it does not stop a request — every page behind these links
 * re-checks its own permission on the server, and so does every API route.
 */

function pickActiveHref(pathname: string, nav: NavSection[]) {
  let active: string | null = null;
  for (const section of nav) {
    for (const item of section.items) {
      const href = item.href.split("#")[0];
      const matches = pathname === href || pathname.startsWith(`${href}/`);
      if (!matches) continue;
      // The longest match wins, so `/admin/emergency/integrations` does not also
      // light up `/admin/emergency`.
      if (active === null || href.length > active.length) active = href;
    }
  }
  return active;
}

function ConsoleNavLink({
  href,
  title,
  description,
  icon,
  active,
  onNavigate,
}: {
  href: string;
  title: string;
  description?: string;
  icon: NavIconName;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
        active ? "bg-primary-soft font-semibold text-primary" : "text-foreground/85 hover:bg-muted hover:text-primary",
      )}
    >
      <NavIcon name={icon} className="mt-0.5 size-4 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{title}</span>
        {description ? <span className="mt-0.5 text-xs text-muted-foreground">{description}</span> : null}
      </span>
    </Link>
  );
}

export type ConsoleShellProps = {
  nav: NavSection[];
  operatorName: string;
  operatorEmail: string;
  consoleRoles: string[];
  isPlatformAdmin: boolean;
  children: React.ReactNode;
};

function ConsoleShell({
  nav,
  operatorName,
  operatorEmail,
  consoleRoles,
  isPlatformAdmin,
  children,
}: ConsoleShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const activeHref = pickActiveHref(pathname, nav);

  const navigation = (
    <nav aria-label="Console navigation" className="flex flex-col gap-6">
      {nav.map((section) => (
        <div key={section.title} className="space-y-1.5">
          <p className="px-3 text-[0.68rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            {section.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <ConsoleNavLink
                key={`${item.href}-${item.title}`}
                href={item.href}
                title={item.title}
                description={item.description}
                icon={item.icon}
                active={item.href.split("#")[0] === activeHref}
                onNavigate={() => setMenuOpen(false)}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#console-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-header backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="console-navigation"
              aria-label={menuOpen ? "Close console navigation" : "Open console navigation"}
              className="grid size-10 place-items-center rounded-full border border-border bg-card/70 text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden"
            >
              {menuOpen ? <X aria-hidden className="size-4.5" /> : <Menu aria-hidden className="size-4.5" />}
            </button>
            <Logo />
            <span className="hidden items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold text-muted-foreground sm:inline-flex">
              <ShieldCheck aria-hidden className="size-3.5 text-primary" />
              Operations console
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            <div className="hidden text-right sm:block">
              <p className="max-w-56 truncate text-sm font-semibold text-foreground">{operatorName}</p>
              <p className="max-w-56 truncate text-xs text-muted-foreground">{operatorEmail}</p>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/45 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <LogOut aria-hidden className="size-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[110rem] gap-8 px-4 py-6 lg:px-6">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-24 flex max-h-[calc(100dvh-8rem)] flex-col gap-4 overflow-y-auto pb-4">
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <p className="eyebrow text-muted-foreground">Acting as</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{operatorName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(consoleRoles.length > 0 ? consoleRoles : ["Platform administrator"]).map((label) => (
                  <Badge key={label} variant="neutral">
                    {label}
                  </Badge>
                ))}
              </div>
              {isPlatformAdmin ? (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  This account holds the bootstrap administrator role, which carries every console permission.
                </p>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Every queue you can open was granted to this account individually. Anything not listed here, you
                  cannot reach.
                </p>
              )}
            </div>
            {navigation}
          </div>
        </aside>

        {menuOpen ? (
          <div
            id="console-navigation"
            className="fixed inset-x-0 top-16 bottom-0 z-30 overflow-y-auto border-t border-border bg-card px-4 py-6 lg:hidden"
          >
            {navigation}
          </div>
        ) : null}

        <main id="console-content" className="min-w-0 flex-1 pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}

export { ConsoleShell };
