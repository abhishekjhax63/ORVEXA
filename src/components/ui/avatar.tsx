import { cn, getInitials } from "@/lib/utils";

type AvatarProps = {
  name: string;
  className?: string;
  /** Optional image URL. When missing, initials are rendered instead. */
  src?: string;
};

function Avatar({ name, src, className }: AvatarProps) {
  return (
    <span
      className={cn(
        "relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(140deg,var(--brand-from),var(--brand-to))] text-sm font-semibold text-white",
        className,
      )}
    >
      {src ? (
        // Decorative: the accessible name already carries the full identity.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden>{getInitials(name)}</span>
      )}
    </span>
  );
}

export { Avatar };
