/**
 * Input sanitisation helpers.
 *
 * ## Why sanitise as well as validate
 *
 * Zod already rejects input of the wrong shape. These helpers handle the case
 * where the shape is right but the *content* is not safe to store or to show:
 * control characters that break a log line, zero-width characters that make two
 * different strings look identical, an over-long value that is really a
 * payload, or an HTML fragment that a future renderer might trust.
 *
 * ## Where the real defence is
 *
 * Output encoding. React escapes text nodes, so an `<script>` in a name is
 * already inert in this application, and there is no `dangerouslySetInnerHTML`
 * anywhere on a user-supplied value. This module exists so that (a) nothing
 * unexpected is *stored*, and (b) a value is still inert if it is ever rendered
 * somewhere that does not escape. It is defence in depth, not the only defence.
 *
 * ## Deliberately not server-only
 *
 * The functions are pure string logic, so they are importable from a test file
 * and from a client-side form without dragging in a database import.
 */

/** C0 and C1 control characters, excluding tab, newline and carriage return. */
const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/** Zero-width and bidi-override characters, which make two strings render alike. */
const INVISIBLE_FORMATTING = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/** Removes characters that have no legitimate place in stored text. */
export function stripUnsafeCharacters(value: string): string {
  return value.replace(UNSAFE_CONTROL_CHARACTERS, "").replace(INVISIBLE_FORMATTING, "");
}

/**
 * Single-line text: control characters removed, every run of whitespace
 * collapsed to one space, trimmed, and truncated to `maxLength`.
 *
 * Truncation rather than rejection because a name that is three characters too
 * long is not an attack, and rejecting it with a length error teaches nobody
 * anything. The schema enforces a *maximum* too, so a caller that bypasses this
 * still cannot store an unbounded value.
 */
export function sanitiseSingleLine(value: string, maxLength = 200): string {
  return stripUnsafeCharacters(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Multi-line text: preserves paragraphs, caps consecutive blank lines, trims. */
export function sanitiseMultiline(value: string, maxLength = 5000): string {
  const cleaned = stripUnsafeCharacters(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.slice(0, maxLength);
}

/** Escapes the five characters that matter in HTML text and attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Removes HTML tags and decodes nothing.
 *
 * Not a sanitiser for trusted HTML — there is no such thing here. It exists so a
 * value that reached the database before this module existed can be rendered
 * inertly.
 */
export function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

/**
 * A filename that is safe to put in an object-storage key: no path separators,
 * no traversal, no control characters, a bounded length and a preserved
 * extension.
 */
export function safeFilename(value: string, maxLength = 120): string {
  const base = stripUnsafeCharacters(value)
    .replace(/[\\/]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^[._]+/, "")
    .trim();
  const safe = base.length > 0 ? base : "file";
  if (safe.length <= maxLength) return safe;

  const extension = safe.includes(".") ? safe.slice(safe.lastIndexOf(".")) : "";
  const stem = extension ? safe.slice(0, safe.length - extension.length) : safe;
  return `${stem.slice(0, Math.max(1, maxLength - extension.length))}${extension}`;
}

/**
 * Accepts only the values in `allowed`, so an enum arriving from a form cannot
 * introduce a state the database does not expect.
 */
export function normaliseEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * URL that is safe to put in an `href`.
 *
 * Only `http` and `https` are allowed, which excludes `javascript:`, `data:`
 * and `vbscript:` — the three schemes that turn a link into script execution.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** An identifier safe to concatenate into a storage key or a cache key. */
export function assertSafeIdentifier(value: string, maxLength = 128): string | null {
  if (value.length === 0 || value.length > maxLength) return null;
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

/**
 * Copies only the keys that were explicitly allowed.
 *
 * Guards against mass assignment: a client that posts `{ email, status: "ACTIVE" }`
 * to a profile endpoint must not be able to set `status` by adding a field.
 * Zod's strict object parsing is the primary control; this is the belt.
 */
export function pickAllowedKeys<T extends Record<string, unknown>, K extends keyof T>(
  input: T,
  allowed: readonly K[],
): Pick<T, K> {
  const output = {} as Pick<T, K>;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) output[key] = input[key];
  }
  return output;
}

/** True when the value carries a character class that must never be stored. */
export function hasUnsafeCharacters(value: string): boolean {
  UNSAFE_CONTROL_CHARACTERS.lastIndex = 0;
  INVISIBLE_FORMATTING.lastIndex = 0;
  return UNSAFE_CONTROL_CHARACTERS.test(value) || INVISIBLE_FORMATTING.test(value);
}

/**
 * A short, safe fragment of a value for an audit `metadata` field or a log
 * line. Never the whole value, and never from a free-text area.
 */
export function summariseForAudit(value: string, maxLength = 120): string {
  return escapeHtml(sanitiseSingleLine(value, maxLength));
}
