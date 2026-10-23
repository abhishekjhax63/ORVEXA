/**
 * Shape of the state returned by every emergency Server Action.
 *
 * Kept in its own module because a `"use server"` file may only export async
 * functions, so the shared type and its initial value cannot live beside the
 * actions that return them.
 */
export type EmergencyFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  /**
   * Plaintext location links, returned once at creation. The token is stored only
   * as a digest, so this is the only moment these links can be shown to the
   * reporter for them to pass on by their own means.
   */
  shareLinks?: { contactLabel: string; link: string; expiresAtISO: string }[];
};

export const EMPTY_EMERGENCY_STATE: EmergencyFormState = { status: "idle" };
