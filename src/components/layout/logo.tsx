import Image from "next/image";
import Link from "next/link";

import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/orvexa-logo.png"
      alt=""
      width={36}
      height={36}
      className={cn("size-9 shrink-0 rounded-xl object-cover", className)}
    />
  );
}

function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-xl focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
      aria-label={`${siteConfig.name} home`}
    >
      <LogoMark className="transition-transform duration-300 group-hover:scale-105" />
      <span className="flex flex-col leading-none">
        <span className="text-[1.05rem] font-semibold tracking-[0.16em]">ORVEXA</span>
        <span className="mt-1 text-[0.6rem] font-medium tracking-[0.22em] text-muted-foreground uppercase">
          Health ecosystem
        </span>
      </span>
    </Link>
  );
}

export { Logo, LogoMark };
