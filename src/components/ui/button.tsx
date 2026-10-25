import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // `min-w-0` + no `whitespace-nowrap`: a long label previously could not
  // shrink, so its min-content width inflated its grid `1fr` / flex parent and
  // pushed horizontal scrollbars onto narrow viewports. Labels now wrap instead
  // of overflowing; short labels are unaffected.
  "inline-flex min-w-0 max-w-full items-center justify-center gap-2 rounded-xl text-center text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-soft)] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-forest-900 dark:hover:bg-lime-300",
        gradient:
          "bg-[linear-gradient(102deg,var(--brand-from),var(--brand-via)_52%,var(--brand-to))] text-white shadow-[var(--shadow-glow)] ring-1 ring-inset ring-lime-400/20 hover:ring-lime-400/40 hover:brightness-[1.08]",
        emergency:
          "rounded-xl bg-emergency text-emergency-foreground shadow-[0_14px_34px_-16px_rgba(192,57,43,0.7)] hover:brightness-110",
        outline:
          "border border-border bg-card/70 text-foreground hover:border-primary/45 hover:bg-primary-soft hover:text-primary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-forest-100 dark:hover:bg-forest-700",
        ghost: "text-foreground hover:bg-muted",
        link: "rounded-md text-primary underline-offset-4 hover:underline",
        soft: "bg-primary-soft text-primary hover:bg-primary/15",
      },
      // `min-h-*` rather than `h-*` so a wrapped label grows the button instead
      // of being clipped by a fixed height.
      size: {
        sm: "min-h-9 px-3.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        default: "min-h-11 px-5",
        lg: "min-h-12 px-6 text-[0.95rem]",
        xl: "min-h-14 px-7 text-base",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
