import { cn } from "@/lib/utils";

/**
 * ORVEXA renders authentic healthcare imagery through the platform image
 * service. Keeping URL construction in one place means prompts stay
 * descriptive and consistent (subject, lighting, framing, mood).
 */
export type ImageSize =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";

export function healthImage(prompt: string, size: ImageSize = "landscape_4_3") {
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=${size}`;
}

/** Aspect-ratio helpers that match the sizes above. */
export const imageAspect: Record<ImageSize, string> = {
  square_hd: "aspect-square",
  square: "aspect-square",
  portrait_4_3: "aspect-[3/4]",
  portrait_16_9: "aspect-[9/16]",
  landscape_4_3: "aspect-[4/3]",
  landscape_16_9: "aspect-video",
};

export function imageFrame(size: ImageSize, className?: string) {
  return cn("overflow-hidden", imageAspect[size], className);
}
