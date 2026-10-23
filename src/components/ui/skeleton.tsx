import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton-shimmer relative overflow-hidden rounded-xl bg-muted", className)}
      {...props}
    />
  );
}

/** Card-shaped placeholder used while provider lists load. */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-6", className)}>
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
      <div className="mt-6 flex gap-3">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
    </div>
  );
}

/** Announce a busy region to assistive tech while placeholders render. */
function SkeletonList({ count = 3, label = "Loading results" }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonCard, SkeletonList };
