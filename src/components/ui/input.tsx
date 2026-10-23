import { cn } from "@/lib/utils";

const controlClasses =
  "flex w-full rounded-xl border border-input bg-card px-3.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(11,27,51,0.02)] transition-[border-color,box-shadow] duration-200 outline-none placeholder:text-muted-foreground/75 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-emergency aria-invalid:ring-2 aria-invalid:ring-emergency/20";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(controlClasses, "h-11 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium", className)}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClasses, "min-h-28 resize-y py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        controlClasses,
        "h-11 cursor-pointer appearance-none bg-[length:1rem] bg-[right_0.85rem_center] bg-no-repeat pr-10",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2356698a%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
        className,
      )}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-sm leading-none font-medium text-foreground select-none peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export type FieldProps = {
  /** Base id reused for the label, the hint and the error, following the
   * convention `<id>-description` and `<id>-error`. Pass a matching
   * `aria-describedby` to the control for screen-reader support. */
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

function Field({ id, label, description, error, required, className, children }: FieldProps) {
  return (
    <div data-slot="field" className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-emergency">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {description ? (
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-emergency">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field, Input, Label, Select, Textarea, controlClasses };
