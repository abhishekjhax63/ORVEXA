import Link from "next/link";
import { Compass, Search, Siren } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Container className="max-w-xl py-20 text-center">
        <span
          aria-hidden
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary"
        >
          <Compass className="size-6" />
        </span>
        <p className="mt-6 text-xs font-semibold tracking-[0.16em] text-primary uppercase">Error 404</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">We could not find that page</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The link may be outdated or the page may have moved. Try searching for a hospital, or start from the
          homepage.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href="/hospitals">
              <Search aria-hidden />
              Search hospitals
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to homepage</Link>
          </Button>
          <Button asChild variant="emergency" size="sm">
            <Link href="/emergency">
              <Siren aria-hidden />
              Emergency SOS
            </Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
