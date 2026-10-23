import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  /** `compact` is used inside cards, `default` for full-page regions. */
  size?: "default" | "compact";
};

/**
 * Shared empty state used wherever a filtered list, record set or timeline has
 * nothing to show. Always offers the next best action.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "default",
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 text-center",
        size === "default" ? "gap-4 px-6 py-16" : "gap-3 px-5 py-10",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center rounded-full bg-primary-soft text-primary",
          size === "default" ? "size-14" : "size-11",
        )}
      >
        <Icon className={size === "default" ? "size-6" : "size-5"} />
      </span>
      <div className="max-w-md space-y-1.5">
        <h3 className={cn("font-semibold", size === "default" ? "text-lg" : "text-base")}>{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

export { EmptyState };
