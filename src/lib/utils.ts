import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an amount in Indian Rupees, e.g. ₹1,499. */
export function formatINR(amount: number, options: { compact?: boolean } = {}) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: options.compact ? "compact" : "standard",
  }).format(amount);
}

/** Human readable date, e.g. 24 Oct 2026. */
export function formatDate(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" },
) {
  return new Intl.DateTimeFormat("en-IN", options).format(new Date(value));
}

/** Short time label, e.g. 10:30 AM. */
export function formatTime(value: string | number | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

/** Build up-to-two-letter initials from a display name. */
export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Turn a label into a URL-safe slug. */
export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Stable, order-independent key for a tag list. */
export function tagKey(tags: string[]) {
  return tags.slice().sort().join("|");
}
