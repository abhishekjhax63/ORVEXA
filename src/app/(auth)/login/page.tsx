import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleCheckBig, Info, ShieldAlert } from "lucide-react";

import { LocationPermissionPrompt } from "@/components/auth/location-permission-prompt";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/guards";
import { googleOAuthAvailable } from "@/lib/auth/google";
import { landingPathForRoles } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your ORVEXA account to reach your appointments, records, prescriptions and claims.",
  robots: { index: false, follow: false },
};

export const instant = false;

type AuthSearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Short banners carried over from a completed flow, e.g. after verifying an address. */
const STATUS_NOTICES: Record<string, { tone: "success" | "info" | "warning"; message: string }> = {
  verified: { tone: "success", message: "Your email address is verified. Sign in to continue." },
  "password-reset": { tone: "success", message: "Your password was updated. Sign in with your new password." },
  "signed-out": { tone: "info", message: "You’ve been signed out of ORVEXA." },
  "session-expired": { tone: "warning", message: "Your session ended for security. Sign in again to continue." },
};

const NOTICE_ICON = { success: CircleCheckBig, info: Info, warning: ShieldAlert };
const NOTICE_CLASS = {
  success: "border-success/30 bg-success-soft text-success",
  info: "border-border bg-muted/60 text-muted-foreground",
  warning: "border-warning/40 bg-warning-soft text-warning",
};

/**
 * Why a Google sign-in came back without a session. Each value is a short
 * machine reason produced by the callback route, never provider text, so the
 * copy here is the only thing shown to the visitor.
 */
const OAUTH_NOTICES: Record<string, { tone: "info" | "warning"; message: string }> = {
  cancelled: { tone: "info", message: "Google sign-in was cancelled. You can try again or sign in below." },
  unconfigured: {
    tone: "warning",
    message: "Google sign-in is not configured on this deployment. Use email, mobile or OTP below.",
  },
  provider_error: { tone: "warning", message: "Google could not complete the sign-in. Please try again." },
  invalid_request: { tone: "warning", message: "That Google sign-in link was incomplete. Please start again." },
  state_mismatch: {
    tone: "warning",
    message: "That sign-in attempt expired or was opened in a different browser. Please start again.",
  },
  exchange_failed: { tone: "warning", message: "Google rejected the sign-in exchange. Please try again." },
  profile_failed: { tone: "warning", message: "Google did not return your profile. Please try again." },
  email_unavailable: {
    tone: "warning",
    message: "Your Google account has no verified email address, so ORVEXA cannot open an account for it.",
  },
  account_unavailable: {
    tone: "warning",
    message: "Your ORVEXA account could not be opened right now. Please try email or mobile sign-in.",
  },
  account_inactive: { tone: "warning", message: "This ORVEXA account is not active. Contact support for help." },
  rate_limited: { tone: "warning", message: "Too many sign-in attempts from here. Wait a few minutes and try again." },
};

/**
 * Sign-in page.
 *
 * Reads `?next=` so a visitor who was interrupted mid-flow returns to where they
 * were, and `?status=` so a finished verification or reset can say so. A visitor
 * who is already signed in is sent straight to the console for their roles
 * rather than being shown a form they do not need.
 */
export default async function LoginPage({ searchParams }: { searchParams: AuthSearchParams }) {
  const params = await searchParams;
  const next = first(params.next);
  const status = first(params.status);
  const oauth = first(params.oauth);

  const user = await getCurrentUser();
  if (user) redirect(landingPathForRoles(user.roles));

  const notice = status ? STATUS_NOTICES[status] : undefined;
  const NoticeIcon = notice ? NOTICE_ICON[notice.tone] : null;

  const oauthNotice = oauth ? OAUTH_NOTICES[oauth] : undefined;
  const OauthIcon = oauthNotice ? NOTICE_ICON[oauthNotice.tone] : null;

  return (
    <div className="flex flex-col gap-6">
      {notice && NoticeIcon ? (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${NOTICE_CLASS[notice.tone]}`}
        >
          <NoticeIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{notice.message}</span>
        </p>
      ) : null}
      {oauthNotice && OauthIcon ? (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${NOTICE_CLASS[oauthNotice.tone]}`}
        >
          <OauthIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{oauthNotice.message}</span>
        </p>
      ) : null}
      <LocationPermissionPrompt />
      <LoginForm next={next} googleAvailable={googleOAuthAvailable()} />
    </div>
  );
}
