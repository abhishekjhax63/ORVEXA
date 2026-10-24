"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, Pencil, PhoneCall, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { deleteEmergencyContactAction, saveEmergencyContactAction } from "@/lib/emergency/actions";
import { EMPTY_EMERGENCY_STATE } from "@/lib/emergency/form-state";
import { cn } from "@/lib/utils";

/**
 * Emergency contacts manager.
 *
 * `canReceiveLocation` is per contact and defaults to off, so consenting for one
 * person is never consent for everybody. The server enforces ownership on every
 * write — this component only decides what to render.
 */

export type EmergencyContactView = {
  id: string;
  fullName: string;
  relationship: string | null;
  phone: string;
  email: string | null;
  canReceiveLocation: boolean;
  isPrimary: boolean;
};

const RELATIONSHIP_OPTIONS = [
  "Spouse",
  "Parent",
  "Child",
  "Sibling",
  "Relative",
  "Friend",
  "Neighbour",
  "Caregiver",
  "Other",
] as const;

function ErrorSummary({ state }: { state: typeof EMPTY_EMERGENCY_STATE }) {
  if (state.status !== "error" || !state.message) return null;
  return (
    <div role="alert" className="space-y-1 rounded-xl border border-emergency/40 bg-emergency-soft p-3 text-sm">
      <p className="flex items-start gap-2 font-medium text-emergency">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        {state.message}
      </p>
      {state.fieldErrors ? (
        <ul className="ml-6 list-disc space-y-0.5 text-xs text-muted-foreground">
          {Object.entries(state.fieldErrors).map(([field, message]) => (
            <li key={field}>
              {field}: {message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DeleteContactForm({ contact }: { contact: EmergencyContactView }) {
  const [state, formAction, pending] = useActionState(deleteEmergencyContactAction, EMPTY_EMERGENCY_STATE);

  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
    if (state.status === "error" && state.message) toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="contactId" value={contact.id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        className="text-emergency hover:bg-emergency-soft"
        aria-label={`Remove ${contact.fullName} from your emergency contacts`}
      >
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
        Remove
      </Button>
    </form>
  );
}

function EmergencyContactsPanel({
  contacts,
  maxContacts,
  className,
}: {
  contacts: EmergencyContactView[];
  maxContacts: number;
  className?: string;
}) {
  const formId = useId();
  const [editing, setEditing] = useState<EmergencyContactView | null>(null);
  const [formOpen, setFormOpen] = useState(contacts.length === 0);
  const [state, formAction, pending] = useActionState(saveEmergencyContactAction, EMPTY_EMERGENCY_STATE);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const atCapacity = !editing && contacts.length >= maxContacts;

  // A successful save closes the editor; the list itself refreshes from the
  // server revalidation the action triggered.
  const [handledState, setHandledState] = useState(state);
  if (handledState !== state) {
    setHandledState(state);
    if (state.status === "success") {
      setEditing(null);
      setFormOpen(false);
    }
  }

  // Surface the action's own message once per result.
  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
    else if (state.status === "error" && state.message) toast.error(state.message);
  }, [state]);

  function startAdd() {
    setEditing(null);
    setFormOpen(true);
    panelRef.current?.focus();
  }

  function startEdit(contact: EmergencyContactView) {
    setEditing(contact);
    setFormOpen(true);
    panelRef.current?.focus();
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {contacts.length} of {maxContacts} contacts saved. A contact only receives a location link if you turn that on
          for them and consent per incident.
        </p>
        {atCapacity ? (
          <Badge variant="warning">Contact limit reached</Badge>
        ) : (
          <Button type="button" variant="soft" onClick={startAdd}>
            <Plus aria-hidden />
            Add a contact
          </Button>
        )}
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
            <Users className="size-6" />
          </span>
          <h3 className="mt-4 font-semibold">No emergency contacts yet</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            Adding a contact lets you send them a time-limited location link during an incident. It does not call
            anybody for you, and nothing is shared until you choose to share it.
          </p>
          <Button type="button" variant="soft" className="mt-5" onClick={startAdd}>
            <UserPlus aria-hidden />
            Add your first contact
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {contact.fullName}
                    {contact.isPrimary ? <Badge variant="default">Primary</Badge> : null}
                  </p>
                  {contact.relationship ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{contact.relationship}</p>
                  ) : null}
                </div>
              </div>

              <a
                href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <PhoneCall aria-hidden className="size-3.5" />
                {contact.phone}
              </a>

              {contact.email ? <p className="truncate text-xs text-muted-foreground">{contact.email}</p> : null}

              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 size-2 shrink-0 rounded-full",
                    contact.canReceiveLocation ? "bg-success" : "bg-muted-foreground/40",
                  )}
                />
                {contact.canReceiveLocation
                  ? "May receive a time-limited location link when you consent per incident."
                  : "Will not receive location links. They can still be called by you."}
              </p>

              <div className="mt-auto flex items-center justify-end gap-1 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(contact)}>
                  <Pencil aria-hidden />
                  Edit
                </Button>
                <DeleteContactForm contact={contact} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <div
          ref={panelRef}
          tabIndex={-1}
          aria-labelledby={`${formId}-heading`}
          className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] focus-visible:outline-none"
        >
          <h3 id={`${formId}-heading`} className="text-lg font-semibold">
            {editing ? `Edit ${editing.fullName}` : "Add an emergency contact"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Store only what a responder would need to reach this person. Avoid typing medical details here.
          </p>

          <form action={formAction} className="mt-5 space-y-5">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${formId}-name`} label="Full name" required>
                <Input
                  id={`${formId}-name`}
                  name="fullName"
                  defaultValue={editing?.fullName ?? ""}
                  maxLength={120}
                  required
                  autoComplete="name"
                  placeholder="Asha Menon"
                />
              </Field>
              <Field id={`${formId}-relationship`} label="Relationship">
                <Select
                  id={`${formId}-relationship`}
                  name="relationship"
                  defaultValue={editing?.relationship ?? ""}
                >
                  <option value="">Prefer not to say</option>
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${formId}-phone`} label="Mobile number" required description="An Indian mobile number the responder can dial.">
                <Input
                  id={`${formId}-phone`}
                  name="phone"
                  type="tel"
                  defaultValue={editing?.phone ?? ""}
                  required
                  autoComplete="tel"
                  placeholder="+91 98450 12093"
                />
              </Field>
              <Field id={`${formId}-email`} label="Email" description="Optional. Only used if a notification transport is configured.">
                <Input
                  id={`${formId}-email`}
                  name="email"
                  type="email"
                  defaultValue={editing?.email ?? ""}
                  autoComplete="email"
                  placeholder="asha@example.com"
                />
              </Field>
            </div>

            <fieldset className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <legend className="px-1 text-sm font-semibold">Permissions for this contact</legend>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="canReceiveLocation"
                  value="on"
                  defaultChecked={editing?.canReceiveLocation ?? false}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
                />
                <span>
                  <span className="font-medium">May receive a location link during an incident.</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    Separately from this, you must also consent per incident before any link is created.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="isPrimary"
                  value="on"
                  defaultChecked={editing?.isPrimary ?? false}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
                />
                <span>
                  <span className="font-medium">Make this my primary emergency contact.</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    Marking one contact primary clears the flag on the others.
                  </span>
                </span>
              </label>
            </fieldset>

            <ErrorSummary state={state} />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
                {editing ? "Save changes" : "Add contact"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(false);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export { EmergencyContactsPanel };
