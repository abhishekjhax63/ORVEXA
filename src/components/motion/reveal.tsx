"use client";

import { MotionConfig, motion, useReducedMotion, type Variants } from "framer-motion";

import { cn } from "@/lib/utils";

const easeOut = [0.22, 1, 0.36, 1] as const;

/** Scroll-triggered reveal used across marketing sections. */
function Reveal({
  children,
  className,
  delay = 0,
  y = 20,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{ duration: 0.65, delay, ease: easeOut }}
    >
      {children}
    </motion.div>
  );
}

const groupVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } },
};

/** Staggered container. Pair with `RevealItem` for each child. */
function RevealGroup({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "ul" | "ol";
}) {
  const reduceMotion = useReducedMotion();
  const Component = motion[Tag];

  if (reduceMotion) {
    const Plain = Tag;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Component
      className={className}
      variants={groupVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </Component>
  );
}

function RevealItem({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li";
}) {
  const reduceMotion = useReducedMotion();
  const Component = motion[Tag];

  if (reduceMotion) {
    const Plain = Tag;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Component className={className} variants={itemVariants}>
      {children}
    </Component>
  );
}

/**
 * Subtle vertical parallax driven by scroll position. Automatically neutered
 * when the visitor asked for reduced motion.
 */
function Parallax({
  children,
  className,
  distance = 40,
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={cn("relative", className)}>{children}</div>;
  }

  return <ParallaxLayer className={className} distance={distance}>{children}</ParallaxLayer>;
}

function ParallaxLayer({
  children,
  className,
  distance,
}: {
  children: React.ReactNode;
  className?: string;
  distance: number;
}) {
  return (
    <motion.div
      className={cn("relative", className)}
      initial={{ y: distance * 0.6 }}
      whileInView={{ y: -distance * 0.6 }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: 1.1, ease: "linear" }}
    >
      {children}
    </motion.div>
  );
}

export { MotionConfig, Parallax, Reveal, RevealGroup, RevealItem, easeOut };
