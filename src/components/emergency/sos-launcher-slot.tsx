import { Siren } from "lucide-react";

import { SosLauncher } from "@/components/emergency/sos-launcher";
import { getCurrentUser } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";

/**
 * Session-aware wrapper for the SOS launcher.
 *
 * The session read lives here rather than in the launcher because reading
 * cookies is a request-time API: under Cache Components it cannot be part of a
 * prerendered shell, so a page must render this behind a `<Suspense>` boundary.
 * The launcher itself is a Client Component and never touches the session — it
 * receives `signedIn` and nothing else, so a tampered client cannot invent one.
 */
async function SosLauncherSlot({ className }: { className?: string }) {
  const user = await getCurrentUser();
  return <SosLauncher signedIn={Boolean(user)} className={className} />;
}

/**
 * Shown while the session is resolved. It deliberately renders the SOS heading
 * and no button: an inert SOS control that briefly appears tappable would be
 * worse than a short wait, so the actionable panel only mounts once we know
 * whether the visitor can submit.
 */
function SosLauncherFallback({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("rounded-[1.75rem] border border-border bg-card p-6 shadow-[var(--shadow-panel)] sm:p-7", className)}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-emergency-soft text-emergency">
          <Siren className="size-5" />
        </span>
        <div>
          <p className="text-lg font-semibold">Emergency SOS</p>
          <p className="text-xs text-muted-foreground">Preparing the emergency form…</p>
        </div>
      </div>
      <div className="mt-6 h-40 animate-pulse rounded-3xl bg-muted/70 motion-reduce:animate-none" />
    </div>
  );
}

export { SosLauncherFallback, SosLauncherSlot };
