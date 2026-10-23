import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback for the auth shell while the request-time read behind it (the session
 * cookie or `searchParams`) resolves. It mirrors the real form's rhythm so the
 * panel does not jump when the form streams in.
 */
function AuthFormSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy className="flex flex-col gap-6">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="flex flex-col gap-5">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ))}
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    </div>
  );
}

export { AuthFormSkeleton };
