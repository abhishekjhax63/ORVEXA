import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading UI. Mirrors the marketing page rhythm so the transition
 * from skeleton to content does not shift layout.
 */
export default function Loading() {
  return (
    <div className="w-full">
      <div className="border-b border-border bg-card">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <Skeleton className="h-5 w-40 rounded-full" />
          <Skeleton className="mt-6 h-10 w-full max-w-2xl" />
          <Skeleton className="mt-3 h-10 w-full max-w-xl" />
          <Skeleton className="mt-6 h-4 w-full max-w-lg" />
          <div className="mt-8 flex gap-3">
            <Skeleton className="h-12 w-44 rounded-full" />
            <Skeleton className="h-12 w-40 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-border bg-card p-6">
              <Skeleton className="size-12 rounded-xl" />
              <Skeleton className="mt-5 h-5 w-2/3" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-5/6" />
              <Skeleton className="mt-6 h-9 w-28 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
