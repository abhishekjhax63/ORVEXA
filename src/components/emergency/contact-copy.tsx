"use client";

import { useId, useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { bystanderNumbers, emergencyContacts } from "@/data/emergency";
import { siteConfig } from "@/lib/site";

/** Flattened reference sheet a bystander or family member can paste into a chat. */
const contactLines = [
  "ORVEXA emergency numbers",
  `Ambulance (national): ${siteConfig.emergencyNumber}`,
  ...bystanderNumbers.map((entry) => `${entry.label}: ${entry.number}`),
  "",
  "Emergency-ready hospitals",
  ...emergencyContacts.map((entry) => `${entry.name}, ${entry.city} — ${entry.phone}`),
  "",
  `ORVEXA care desk: ${siteConfig.supportPhone}`,
];

const contactText = contactLines.join("\n");

type ContactCopyProps = {
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
};

/**
 * Copies every published emergency number in one tap. Uses the async clipboard
 * API where available and falls back to a selectable read-only block when the
 * browser blocks clipboard access (private windows, older browsers, no HTTPS).
 */
function ContactCopy({ label = "Copy all emergency numbers", variant = "outline", size = "sm", className }: ContactCopyProps) {
  const statusId = useId();
  const fallbackId = `${statusId}-fallback`;
  const [state, setState] = useState<"idle" | "copied" | "fallback">("idle");

  async function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setState("fallback");
      toast.error("Clipboard is unavailable in this browser. Select the numbers below and copy them manually.");
      return;
    }

    try {
      await navigator.clipboard.writeText(contactText);
      setState("copied");
      toast.success("Emergency numbers copied to your clipboard.");
      window.setTimeout(() => setState((current) => (current === "copied" ? "idle" : current)), 2500);
    } catch {
      setState("fallback");
      toast.error("Clipboard access was blocked. Select the numbers below and copy them manually.");
    }
  }

  return (
    <div className={className}>
      <Button type="button" variant={variant} size={size} onClick={handleCopy} aria-describedby={statusId}>
        {state === "copied" ? <Check aria-hidden /> : <ClipboardCopy aria-hidden />}
        {state === "copied" ? "Copied" : label}
      </Button>

      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? "Emergency numbers copied to the clipboard." : ""}
      </p>

      {state === "fallback" ? (
        <div className="mt-3 w-full max-w-md">
          <label htmlFor={fallbackId} className="text-xs leading-relaxed text-muted-foreground">
            Clipboard unavailable. Select the numbers below and copy them manually.
          </label>
          <Textarea
            id={fallbackId}
            readOnly
            rows={7}
            value={contactText}
            className="mt-2 font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}
    </div>
  );
}

export { ContactCopy };
