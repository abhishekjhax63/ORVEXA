import type { Metadata } from "next";

import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { EMAIL_NOT_CONFIGURED_MESSAGE, emailDeliveryAvailable } from "@/lib/actions/email-delivery";

export const metadata: Metadata = {
  title: "Verify your email",
  description: "Confirm the email address on your ORVEXA account.",
  robots: { index: false, follow: false },
};

type AuthSearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Verify-email page.
 *
 * Handles both states of the flow: a visitor who has just registered and needs a
 * link, and a visitor arriving from the link itself with `?token=`. The page is
 * honest about delivery: if no email transport exists it says so instead of
 * telling someone to check an inbox that will never receive anything.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: AuthSearchParams }) {
  const params = await searchParams;
  const token = first(params.token);
  const emailDeliveryConfigured = emailDeliveryAvailable();

  return (
    <VerifyEmailForm
      token={token}
      emailDeliveryConfigured={emailDeliveryConfigured}
      deliveryNotice={EMAIL_NOT_CONFIGURED_MESSAGE}
    />
  );
}
