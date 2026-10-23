import "server-only";

import { compare, hash } from "bcryptjs";

/**
 * Password handling. bcrypt via bcryptjs is used deliberately: it is a proven
 * adaptive hashing function, it never stores or logs the plaintext value, and it
 * behaves identically in every runtime we deploy to.
 */
const BCRYPT_COST = 12;

/** bcrypt only considers the first 72 bytes of input; longer secrets are rejected. */
export const MAX_PASSWORD_BYTES = 72;

export type PasswordPolicy = { minLength: number; requireLetter: boolean; requireNumber: boolean };

export const passwordPolicy: PasswordPolicy = { minLength: 10, requireLetter: true, requireNumber: true };

/** Human-readable rules, reused by the forms so the copy cannot drift. */
export function describePasswordPolicy() {
  return [
    `At least ${passwordPolicy.minLength} characters`,
    "At least one letter",
    "At least one number",
    "Not your email address or a commonly used password",
  ];
}

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein123",
  "iloveyou1",
  "welcome123",
  "admin12345",
  "orvexa123",
]);

/** Returns the rules a candidate password still violates. */
export function passwordIssues(password: string, email?: string): string[] {
  const issues: string[] = [];
  if (password.length < passwordPolicy.minLength) {
    issues.push(`Use at least ${passwordPolicy.minLength} characters.`);
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    issues.push("Password is too long.");
  }
  if (passwordPolicy.requireLetter && !/[a-z]/i.test(password)) issues.push("Include at least one letter.");
  if (passwordPolicy.requireNumber && !/[0-9]/.test(password)) issues.push("Include at least one number.");
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) issues.push("Choose a password that is not commonly used.");
  if (email) {
    const [localPart] = email.toLowerCase().split("@");
    if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
      issues.push("Password must not contain your email address.");
    }
  }
  return issues;
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, BCRYPT_COST);
}

/**
 * Constant-time comparison. A malformed stored hash returns false instead of
 * throwing, so a corrupt row can never turn into a 500 that leaks user state.
 */
export async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  try {
    return await compare(plainPassword, storedHash);
  } catch {
    return false;
  }
}

/**
 * A dummy hash used to spend the same CPU time on unknown accounts, so response
 * timing does not reveal whether an email address is registered.
 */
export const DUMMY_PASSWORD_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO1qZ0kWXc/Xp0k5u2S/8bF3S1u9pQ2Zu";
