"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck,
  ChevronDown,
  Menu,
  Phone,
  Siren,
  X,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { primaryNav, secondaryNav, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  const base = href.split("#")[0];
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

function NavLink({
  href,
  title,
  active,
  className,
  onClick,
}: {
  href: string;
  title: string;
  active: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
        active ? "text-primary" : "text-foreground/80 hover:text-primary",
        className,
      )}
    >
      {title}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-3.5 -bottom-0.5 h-0.5 rounded-full bg-[linear-gradient(90deg,var(--brand-from),var(--brand-to))]"
        />
      ) : null}
    </Link>
  );
}

function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile drawer whenever the route changes.
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
  }

  // Escape closes the drawer and body scroll is locked while it is open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-[background-color,border-color,box-shadow] duration-300",
        scrolled
          ? "border-b border-border bg-header shadow-[var(--shadow-soft)] backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="hidden border-b border-border/70 bg-navy-900 text-white lg:block dark:bg-navy-950">
        <Container className="flex h-9 items-center justify-between text-xs">
          <p className="flex items-center gap-2 text-white/80">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-2 animate-pulse-ring rounded-full bg-teal-300" />
              <span className="relative inline-flex size-2 rounded-full bg-teal-300" />
            </span>
            In an emergency, call {siteConfig.emergencyNumber} directly; ORVEXA cannot dispatch an ambulance
          </p>
          <div className="flex items-center gap-5">
            <a
              href={`tel:${siteConfig.supportPhone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-1.5 text-white/80 transition-colors hover:text-white"
            >
              <Phone aria-hidden className="size-3.5" />
              Contact {siteConfig.supportPhone}
            </a>
            <Link href="/emergency" className="font-semibold text-teal-200 transition-colors hover:text-white">
              Emergency {siteConfig.emergencyNumber}
            </Link>
          </div>
        </Container>
      </div>

      <Container className="flex h-16 items-center justify-between gap-4 lg:h-18">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
          {primaryNav.map((item) => (
            <NavLink key={item.href} href={item.href} title={item.title} active={isActive(pathname, item.href)} />
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium text-foreground/80 transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                More
                <ChevronDown aria-hidden className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-72">
              {secondaryNav.map((group) => (
                <DropdownMenuGroup key={group.title}>
                  <DropdownMenuLabel>{group.title}</DropdownMenuLabel>
                  {group.items.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href} className="flex flex-col items-start gap-0.5">
                        <span className="flex items-center gap-2 font-medium">
                          {item.title}
                          {item.badge ? (
                            <span className="rounded-full bg-emergency-soft px-1.5 py-0.5 text-[0.65rem] font-semibold text-emergency">
                              {item.badge}
                            </span>
                          ) : null}
                        </span>
                        {item.description ? (
                          <span className="text-xs text-muted-foreground">{item.description}</span>
                        ) : null}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="emergency" size="sm" className="hidden sm:inline-flex">
            <Link href="/emergency">
              <Siren aria-hidden />
              SOS
            </Link>
          </Button>
          <Button asChild variant="gradient" size="sm">
            <Link href="/hospitals">
              <CalendarCheck aria-hidden />
              <span className="hidden sm:inline">Book appointment</span>
              <span className="sm:hidden">Book</span>
            </Link>
          </Button>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            className="grid size-10 place-items-center rounded-full border border-border bg-card/70 text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden"
          >
            {menuOpen ? <X aria-hidden className="size-4.5" /> : <Menu aria-hidden className="size-4.5" />}
          </button>
        </div>
      </Container>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border bg-card shadow-[var(--shadow-panel)] lg:hidden"
          >
            <Container className="flex flex-col gap-6 py-6">
              <nav aria-label="Mobile primary" className="flex flex-col gap-1">
                {primaryNav.map((item, index) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * index, duration: 0.24 }}
                  >
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-medium transition-colors",
                        isActive(pathname, item.href)
                          ? "bg-primary-soft text-primary"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      <span className="flex flex-col">
                        {item.title}
                        {item.description ? (
                          <span className="mt-0.5 text-xs font-normal text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      <ArrowRight aria-hidden className="size-4 opacity-60" />
                    </Link>
                  </motion.div>
                ))}
              </nav>

              {secondaryNav.map((group) => (
                <div key={group.title} className="space-y-2">
                  <p className="px-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="rounded-xl border border-border px-3 py-2.5 text-sm transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        {item.title}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-3 border-t border-border pt-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Theme
                  </span>
                  <ThemeToggle />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button asChild variant="outline">
                    <Link href="/login">Sign in</Link>
                  </Button>
                  <Button asChild variant="emergency">
                    <Link href="/emergency">
                      <Siren aria-hidden />
                      SOS
                    </Link>
                  </Button>
                </div>
                <Button asChild variant="gradient" size="lg">
                  <Link href="/hospitals">
                    <CalendarCheck aria-hidden />
                    Book appointment
                  </Link>
                </Button>
              </div>
            </Container>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

export { SiteHeader };
