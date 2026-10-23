import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-aqua-700 dark:hover:bg-aqua-400",
        gradient:
          "bg-[linear-gradient(100deg,var(--brand-from),var(--brand-via)_55%,var(--brand-to))] text-white shadow-[var(--shadow-glow)] hover:brightness-[1.06]",
        emergency:
          "bg-emergency text-emergency-foreground shadow-[0_14px_34px_-16px_rgba(220,38,38,0.7)] hover:brightness-110",
        outline:
          "border border-border bg-card/70 text-foreground hover:border-primary/45 hover:bg-primary-soft hover:text-primary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-navy-100 dark:hover:bg-navy-700",
        ghost: "text-foreground hover:bg-muted",
        link: "rounded-md text-primary underline-offset-4 hover:underline",
        soft: "bg-primary-soft text-primary hover:bg-primary/15",
      },
      size: {
        sm: "h-9 px-3.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-11 px-5",
        lg: "h-12 px-6 text-[0.95rem]",
        xl: "h-14 px-7 text-base",
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
