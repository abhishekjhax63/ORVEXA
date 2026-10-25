import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { EMAIL_NOT_CONFIGURED_MESSAGE, emailDeliveryAvailable } from "@/lib/actions/email-delivery";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request password reset instructions for your ORVEXA account.",
  robots: { index: false, follow: false },
};

/**
 * Password-reset request page.
 *
 * Renders the form that posts to the `requestPasswordReset` Server Action. The
 * page passes the real email-delivery capability through so the copy can say
 * plainly that no message will arrive when this deployment has no transport,
 * rather than promising an inbox that will stay empty.
 */
export default function ForgotPasswordPage() {
  return (
    <ForgotPasswordForm
      emailDeliveryConfigured={emailDeliveryAvailable()}
      deliveryNotice={EMAIL_NOT_CONFIGURED_MESSAGE}
    />
  );
}
