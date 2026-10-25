"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Provider portrait / facility photograph frame.
 *
 * ORVEXA never depicts a real doctor or hospital with a synthetic or stock
 * image, so this component only ever shows a photograph that a record carries
 * as verified and attributed. When a record has no such photograph it falls
 * back to a neutral clinical placeholder and says so, rather than dressing a
 * stand-in up as the real thing.
 *
 * The three states it reports through `data-photo-status` are the ones the photo
 * audit cares about:
 *   - `verified`   a sourced photograph is displayed
 *   - `loading`    a sourced photograph is still transferring
 *   - `unavailable` no verified photograph exists, or the remote file failed
 */
export type PhotoStatus = "verified" | "loading" | "unavailable";

type ProviderImageProps = {
  /** The verified photograph, or `null` when the record has none. */
  src: string | null;
  /** Describes the subject of the photograph, never the picture itself. */
  alt: string;
  /** Neutral inline-SVG placeholder used when there is nothing verified to show. */
  placeholder: string;
  /** Provenance required by the licence the photograph is used under. */
  attribution?: string | null;
  /** Intrinsic sizing hint, so the frame does not jump once the file arrives. */
  width?: number;
  height?: number;
  className?: string;
  imgClassName?: string;
};

export function ProviderImage({
  src,
  alt,
  placeholder,
  attribution,
  width = 320,
  height = 320,
  className,
  imgClassName,
}: ProviderImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const showingVerified = Boolean(src) && !failed;
  const status: PhotoStatus = showingVerified ? (loaded ? "verified" : "loading") : "unavailable";

  return (
    <span
      className={cn("relative block overflow-hidden bg-primary-soft", className)}
      data-photo-status={status}
    >
      {/* The fallback is an inline SVG data URI and a verified photograph is a
          third-party hospital URL. `next/image` would either need every source
          host allow-listed (an unbounded wildcard) or would proxy a data URI
          through the optimiser, so a plain <img> is the deliberate choice here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={showingVerified ? (src as string) : placeholder}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn("size-full object-cover", imgClassName)}
      />

      {status === "loading" ? (
        <span aria-hidden className="absolute inset-0 animate-pulse bg-primary/10" />
      ) : null}

      <span className="sr-only">
        {status === "unavailable"
          ? "No verified photograph is available for this listing, so a neutral placeholder is shown."
          : ""}
      </span>

      {status === "verified" && attribution ? (
        <span className="sr-only">Photograph source: {attribution}</span>
      ) : null}
    </span>
  );
}
