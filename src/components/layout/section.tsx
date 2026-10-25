import { cva, type VariantProps } from "class-variance-authority";

import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";

const sectionVariants = cva("relative w-full", {
  variants: {
    spacing: {
      none: "py-0",
      sm: "py-12 sm:py-16",
      default: "py-16 sm:py-20 lg:py-24",
      lg: "py-20 sm:py-28 lg:py-32",
    },
    tone: {
      default: "",
      muted: "bg-muted/50",
      mint: "bg-leaf-soft/55 dark:bg-forest-900/60",
      navy: "bg-forest-900 text-white dark:bg-forest-950",
      gradient: "aurora",
    },
  },
  defaultVariants: { spacing: "default", tone: "default" },
});

type SectionProps = React.ComponentProps<"section"> & VariantProps<typeof sectionVariants> & { bleed?: boolean };

function Section({ className, spacing, tone, bleed = false, children, ...props }: SectionProps) {
  return (
    <section className={cn(sectionVariants({ spacing, tone }), className)} {...props}>
      {bleed ? children : <Container>{children}</Container>}
    </section>
  );
}

type SectionHeadingProps = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  actions?: React.ReactNode;
};

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  actions,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center" : "items-start",
        actions ? "lg:flex-row lg:items-end lg:justify-between" : "",
        className,
      )}
    >
      <div className={cn("flex flex-col gap-3", align === "center" ? "items-center" : "items-start", "max-w-3xl")}>
        {eyebrow ? (
          <span className="eyebrow inline-flex items-center gap-2.5 text-forest-700 dark:text-lime-300">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            {eyebrow}
          </span>
        ) : null}
        <h2 className="text-3xl font-semibold sm:text-4xl lg:text-[2.6rem] lg:leading-[1.1]">{title}</h2>
        {description ? (
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export { Section, SectionHeading, sectionVariants };
