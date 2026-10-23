"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert, Home, RotateCcw } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary. Reset re-renders the segment; the homepage link always
 * gives visitors a way out.
 */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the failure for observability; no patient data is included.
    console.error("Route error", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Container className="max-w-xl py-20 text-center">
        <span
          aria-hidden
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-emergency-soft text-emergency"
        >
          <CircleAlert className="size-6" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold sm:text-3xl">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This screen could not be loaded. You can retry, or head back to the homepage and continue from there. If
          this is a medical emergency, call 108 immediately.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home aria-hidden />
              Back to homepage
            </Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
