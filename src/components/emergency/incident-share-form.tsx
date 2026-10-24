"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, Copy, KeyRound, LoaderCircle, Share2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { shareIncidentLocation } from "@/lib/emergency/actions";
import { EMPTY_EMERGENCY_STATE } from "@/lib/emergency/form-state";
import { formatIncidentTime } from "@/lib/emergency/format";
import { LOCATION_SHARE_LABELS } from "@/lib/emergency/share-labels";
import type { LocationShareSummary } from "@/lib/emergency/types";
import { cn } from "@/lib/utils";

/**
 * Issues time-limited location links to nominated contacts.
 *
 * Two consent gates have to be open before a link can exist: the reporter turned
 * on contact sharing when raising the incident, and the specific contact has
 * `canReceiveLocation`. Both are re-checked on the server. The plaintext link is
 * returned once and never stored, so this panel makes that single moment
 * explicit rather than implying the link can be looked up later.
 */

export type ShareContact = { id: string; fullName: string; isPrimary: boolean };

const TTL_OPTIONS = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "240", label: "4 hours" },
  { value: "480", label: "8 hours" },
];

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `share-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs">
        {link}
      </code>
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-live="polite">
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function Notice({
  icon: Icon,
  tone = "muted",
  children,
  action,
}: {
  icon: typeof ShieldAlert;
  tone?: "muted" | "warning";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 text-sm leading-relaxed",
        tone === "warning" ? "border-warning/40 bg-warning-soft text-warning" : "border-border bg-muted/40",
      )}
    >
      <p className="flex items-start gap-2">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{children}</span>
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

function IncidentShareForm({
  incidentId,
  contactShareConsent,
  hasLocation,
  eligibleContacts,
  existingShares,
  className,
}: {
  incidentId: string;
  contactShareConsent: boolean;
  hasLocation: boolean;
  eligibleContacts: ShareContact[];
  existingShares: LocationShareSummary[];
  className?: string;
}) {
  const formId = useId();
  const [key, setKey] = useState(newIdempotencyKey);
  const [state, formAction, pending] = useActionState(shareIncidentLocation, EMPTY_EMERGENCY_STATE);

  // A fresh key once a share resolves, so the next attempt is not mistaken for a
  // repeat of the one that just succeeded.
  const [handledState, setHandledState] = useState(state);
  if (handledState !== state) {
    setHandledState(state);
    if (state.status === "success") setKey(newIdempotencyKey());
  }

  const issuedLinks = state.shareLinks ?? [];

  return (
    <div className={cn("space-y-4", className)}>
      {!contactShareConsent ? (
        <Notice icon={ShieldAlert} tone="warning">
          Contact sharing was not consented to when this incident was raised, so no location link can be issued. Raising
          a new incident gives you the option to turn it on.
        </Notice>
      ) : !hasLocation ? (
        <Notice icon={ShieldAlert} tone="warning">
          There is no location on this incident to share. A link can only be issued once the incident has a GPS fix or a
          typed address.
        </Notice>
      ) : eligibleContacts.length === 0 ? (
        <Notice
          icon={ShieldAlert}
          tone="warning"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/emergency/contacts">Manage emergency contacts</Link>
            </Button>
          }
        >
          No contact on your account has location sharing turned on. Turn it on for a contact first — otherwise no link
          is created for anyone.
        </Notice>
      ) : (
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="incidentId" value={incidentId} />
          <input type="hidden" name="idempotencyKey" value={key} />

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Who should receive the link?</legend>
            <ul className="space-y-2">
              {eligibleContacts.map((contact) => (
                <li key={contact.id}>
                  <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      name="contactIds"
                      value={contact.id}
                      defaultChecked
                      className="size-5 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="font-medium">{contact.fullName}</span>
                    {contact.isPrimary ? (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                        Primary
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Unticking everybody issues no links at all. Contacts without location sharing on are not listed.
            </p>
          </fieldset>

          <Field
            id={`${formId}-ttl`}
            label="Link lifetime"
            description="The link stops working after this window, and immediately if you cancel the incident."
          >
            <Select id={`${formId}-ttl`} name="ttlMinutes" defaultValue="120">
              {TTL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Button type="submit" variant="soft" disabled={pending}>
            {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Share2 aria-hidden />}
            {pending ? "Issuing links…" : "Issue location links"}
          </Button>
        </form>
      )}

      {issuedLinks.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary-soft/50 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-primary">
            <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0" />
            These links are shown once
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            ORVEXA stores only a fingerprint of each link, so it cannot show them again. Copy each link now and send it
            yourself — no message was sent automatically.
          </p>
          <ul className="space-y-3">
            {issuedLinks.map((entry) => (
              <li key={entry.link} className="space-y-1.5">
                <p className="text-xs font-medium">
                  {entry.contactLabel}
                  {formatIncidentTime(entry.expiresAtISO) ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · works until {formatIncidentTime(entry.expiresAtISO)}
                    </span>
                  ) : null}
                </p>
                <CopyLink link={entry.link} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.message ? (
        <p
          className={cn(
            "flex items-start gap-2 text-xs leading-relaxed",
            state.status === "error" ? "text-muted-foreground" : "text-success",
          )}
        >
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {state.message}
        </p>
      ) : null}

      {existingShares.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Link history</p>
          <ul className="space-y-2">
            {existingShares.map((share) => (
              <li
                key={share.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs"
              >
                <span className="font-medium">{share.contactLabel}</span>
                <span className="text-muted-foreground">
                  {LOCATION_SHARE_LABELS[share.status]}
                  {formatIncidentTime(share.expiresAtISO) ? ` · expires ${formatIncidentTime(share.expiresAtISO)}` : null}
                  {share.viewCount > 0 ? ` · opened ${share.viewCount}×` : " · not opened"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export { IncidentShareForm };
