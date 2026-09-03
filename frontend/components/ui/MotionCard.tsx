"use client";

import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { cardHover, fadeSlideUp } from "@/lib/motion";
import { Card } from "./Card";

/**
 * Card with a restrained fade/slide-in on mount and a small hover lift. Reduced-motion handling
 * is global (see <MotionConfig reducedMotion="user"> in app/layout.tsx), so this component doesn't
 * need to branch on the user's OS preference itself.
 */
export function MotionCard({ className, children, hover = true, ...props }: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    // `className` lands here, not on the inner <Card> — this outer element is the one a CSS Grid
    // parent actually sees as its child, so a caller's `lg:col-span-*` has to live here or grid
    // placement silently no-ops (the exact bug behind the dashboard bento cards rendering at one
    // column's width instead of the two/four they asked for).
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      whileHover={hover ? cardHover : undefined}
      className={cn("h-full", className)}
    >
      {/* The lift (whileHover's `y`, above) reads as elevation only if the shadow deepens with
          it — a plain `transition-shadow` on top of the framer-motion y-spring, so both settle
          together without fighting over which library owns the transition. */}
      <Card className={cn("h-full transition-shadow duration-200", hover && "hover:shadow-elevation-2")} {...props}>
        {children}
      </Card>
    </motion.div>
  );
}
