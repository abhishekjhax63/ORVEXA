"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "Continue with Google".
 *
 * This is a plain top-level navigation to the OAuth start route, not a popup:
 * a popup can be blocked by the browser and then the button silently does
 * nothing, whereas a redirect either works or lands back on `/login` with a
 * reason. The pending state exists because the hop out to Google is a network
 * round-trip and the page stays put until the server answers.
 *
 * When the deployment has no Google client configured the button renders as a
 * disabled control that says exactly what is missing. It is never rendered as
 * something that looks clickable but is not wired to anything.
 */
type GoogleSignInButtonProps = {
  /** Resolved on the server from `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. */
  available: boolean;
  /** Relative path to return to once the session is open. */
  next?: string;
  label?: string;
};

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function GoogleSignInButton({ available, next, label = "Continue with Google" }: GoogleSignInButtonProps) {
  const [pending, setPending] = useState(false);

  if (!available) {
    return (
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="lg" disabled aria-describedby="google-signin-unavailable">
          <GoogleMark />
          {label}
        </Button>
        <p id="google-signin-unavailable" className="text-xs leading-relaxed text-muted-foreground">
          Google sign-in is not enabled on this deployment. The operator must set <code>GOOGLE_CLIENT_ID</code> and{" "}
          <code>GOOGLE_CLIENT_SECRET</code>, and register <code>/api/auth/google/callback</code> as an authorised
          redirect URI. Email and mobile sign-in are unaffected.
        </p>
      </div>
    );
  }

  const href = next ? `/api/auth/google/start?next=${encodeURIComponent(next)}` : "/api/auth/google/start";

  return (
    <Button asChild variant="outline" size="lg" className={pending ? "pointer-events-none opacity-70" : undefined}>
      <a href={href} onClick={() => setPending(true)} aria-busy={pending || undefined}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <GoogleMark />}
        {pending ? "Opening Google…" : label}
      </a>
    </Button>
  );
}

/** Divider between the Google path and the email/password form. */
function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export { AuthDivider, GoogleSignInButton };
