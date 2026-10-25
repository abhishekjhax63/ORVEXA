/**
 * Open-redirect guard for a caller-supplied return path.
 *
 * Both the password sign-in action and the Google OAuth round-trip accept a
 * `next` value from the URL, so both must apply the same rule. A path is
 * honoured only when it is an absolute-path relative URL on this origin:
 * anything protocol-relative (`//evil.example`) or absolute
 * (`https://evil.example`) is discarded, which is what stops a crafted link
 * from turning sign-in into an open redirect.
 */
export function safeNextPath(value: string | undefined | null): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return undefined;
  try {
    const url = new URL(value, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return undefined;
    return `${url.pathname}${url.search}`;
  } catch {
    return undefined;
  }
}
