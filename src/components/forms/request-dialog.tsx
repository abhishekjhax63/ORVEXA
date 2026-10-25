"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

export type RequestField = {
  name: string;
  label: string;
  type?: "text" | "tel" | "email" | "date" | "time" | "textarea" | "select";
  placeholder?: string;
  description?: string;
  required?: boolean;
  options?: string[];
  defaultValue?: string;
  autoComplete?: string;
};

type RequestDialogProps = {
  triggerLabel: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerClassName?: string;
  title: string;
  description: string;
  fields: RequestField[];
  footnote?: string;
};

type Status = "idle" | "preview";

const phonePattern = /^[0-9+\s-]{10,15}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(fields: RequestField[], values: Record<string, string>) {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = (values[field.name] ?? "").trim();

    if (!value) {
      if (field.required) errors[field.name] = `${field.label} is required.`;
      continue;
    }

    if (field.type === "tel" && !phonePattern.test(value)) {
      errors[field.name] = "Enter a valid phone number, e.g. +91 98450 12093.";
    }

    if (field.type === "email" && !emailPattern.test(value)) {
      errors[field.name] = "Enter a valid email address.";
    }
  }

  const dateField = fields.find((field) => field.type === "date");
  if (dateField) {
    const value = values[dateField.name];
    if (value) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(`${value}T00:00:00`) < today) {
        errors[dateField.name] = "Choose today or a later date.";
      }
    }
  }

  return errors;
}

/**
 * Shared client-side preview for forms without a connected submission API.
 * It validates locally but never sends or stores the entered values.
 */
function RequestDialog({
  triggerLabel,
  triggerVariant = "gradient",
  triggerSize = "default",
  triggerClassName,
  title,
  description,
  fields,
  footnote,
}: RequestDialogProps) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ""])),
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setStatus("idle");
      setErrors({});
      setValues(Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ""])));
    }
  }

  function setValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(fields, values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      toast.error("Please correct the highlighted fields.");
      return;
    }

    setStatus("preview");
    toast.info("Nothing was sent. This form is an unconnected preview.");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {status === "preview" ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span aria-hidden className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
              <Info className="size-7" />
            </span>
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold">Nothing was sent</h2>
              <p className="text-sm text-muted-foreground">
                This form only validates information in your browser. No request was created, and the values were not
                saved or transmitted.
              </p>
            </div>
            <p className="rounded-xl border border-dashed border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
              This is not a booking, order, quote, claim, reminder or support submission.
            </p>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              {fields.map((field) => {
                const controlId = `${formId}-${field.name}`;
                const error = errors[field.name];
                const describedBy = error
                  ? `${controlId}-error`
                  : field.description
                    ? `${controlId}-description`
                    : undefined;

                return (
                  <Field
                    key={field.name}
                    id={controlId}
                    label={field.label}
                    description={field.description}
                    error={error}
                    required={field.required}
                  >
                    {field.type === "textarea" ? (
                      <Textarea
                        id={controlId}
                        name={field.name}
                        value={values[field.name] ?? ""}
                        onChange={(event) => setValue(field.name, event.target.value)}
                        placeholder={field.placeholder}
                        aria-describedby={describedBy}
                        aria-invalid={error ? true : undefined}
                      />
                    ) : field.type === "select" ? (
                      <Select
                        id={controlId}
                        name={field.name}
                        value={values[field.name] ?? ""}
                        onChange={(event) => setValue(field.name, event.target.value)}
                        aria-describedby={describedBy}
                        aria-invalid={error ? true : undefined}
                      >
                        {(field.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        id={controlId}
                        name={field.name}
                        type={field.type ?? "text"}
                        value={values[field.name] ?? ""}
                        onChange={(event) => setValue(field.name, event.target.value)}
                        placeholder={field.placeholder}
                        autoComplete={field.autoComplete}
                        aria-describedby={describedBy}
                        aria-invalid={error ? true : undefined}
                      />
                    )}
                  </Field>
                );
              })}

              {footnote ? (
                <p className="flex items-start gap-2 rounded-xl border border-dashed border-warning/40 bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-warning">
                  <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {footnote}
                </p>
              ) : null}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="gradient">
                  Preview only
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { RequestDialog };
