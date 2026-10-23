import type { z } from "zod";

/**
 * Shape returned by every Server Action that a form consumes.
 *
 * Keeping `status` explicit lets `<form>` submissions distinguish "nothing has
 * happened yet" from "the server rejected this", which in turn powers the
 * loading, error and success states in the UI without client-side guessing.
 */
export type FormState =
  | { status: "idle" }
  | { status: "success"; message: string; redirectTo?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

export const idleFormState: FormState = { status: "idle" };

export function formError(message: string, fieldErrors?: Record<string, string[]>): FormState {
  return { status: "error", message, fieldErrors };
}

export function formSuccess(message: string, redirectTo?: string): FormState {
  return { status: "success", message, redirectTo };
}

/** Groups Zod issues by field path without depending on deprecated helpers. */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    grouped[key] = [...(grouped[key] ?? []), issue.message];
  }
  return grouped;
}

export function firstFieldError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the highlighted fields and try again.";
}

/** Turns FormData into a plain object, keeping only file entries as File values. */
export function formDataToObject(formData: FormData): Record<string, string | File | undefined> {
  const result: Record<string, string | File | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      if (value.size === 0 && !value.name) continue;
      result[key] = value;
      continue;
    }
    result[key] = value;
  }
  return result;
}
