import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleCheckBig, Info, ShieldAlert } from "lucide-react";

import { LocationPermissionPrompt } from "@/components/auth/location-permission-prompt";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/guards";
import { landingPathForRoles } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your ORVEXA account to reach your appointments, records, prescriptions and claims.",
  robots: { index: false, follow: false },
};

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

  const user = await getCurrentUser();
  if (user) redirect(landingPathForRoles(user.roles));

  const notice = status ? STATUS_NOTICES[status] : undefined;
  const NoticeIcon = notice ? NOTICE_ICON[notice.tone] : null;

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
      <LocationPermissionPrompt />
      <LoginForm next={next} />
    </div>
  );
}
