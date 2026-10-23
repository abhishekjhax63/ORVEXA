"use client";

import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Client-side provider stack for the whole app:
 * - `next-themes` for the light/dark class strategy
 * - Framer Motion defaulting to the visitor's reduced-motion preference
 * - Radix tooltip timing plus the toast surface
 */
function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={200} skipDelayDuration={300}>
          {children}
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}

export { AppProviders };
