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
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      whileHover={hover ? cardHover : undefined}
      className="h-full"
    >
      <Card className={cn("h-full", className)} {...props}>
        {children}
      </Card>
    </motion.div>
  );
}
