import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your ORVEXA account.",
  robots: { index: false, follow: false },
};

type AuthSearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Password-reset completion page, reached from the link the reset email builds
 * (`/reset-password?token=…`). Without a token there is nothing to confirm, and
 * `ResetPasswordForm` explains that instead of showing a form that cannot work.
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: AuthSearchParams }) {
  const params = await searchParams;
  return <ResetPasswordForm token={first(params.token)} />;
}
