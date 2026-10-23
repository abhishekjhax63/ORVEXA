import { cn } from "@/lib/utils";

/** Consistent page gutter and max width across every ORVEXA surface. */
function Container({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

export { Container };
