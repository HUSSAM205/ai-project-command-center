// Shared Framer Motion primitives. Kept restrained on purpose — this product's design direction
// is enterprise SaaS, not a marketing site: short distances, quick springs, no bounce, no gimmicks.
// Global `prefers-reduced-motion` handling lives in app/layout.tsx via <MotionConfig reducedMotion="user">,
// which automatically reduces every animation defined here to an opacity-only fade for those users.
import type { Transition, Variants } from "framer-motion";

/** Default spring for small UI movements (card lifts, list items, reveals). */
export const softSpring: Transition = { type: "spring", stiffness: 340, damping: 30, mass: 0.9 };

/** Fade + small upward slide, for page sections and cards entering the viewport. */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: softSpring },
};

/** Parent wrapper that staggers its children's `staggerItem` animations. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
};

/** Individual list item within a `staggerContainer` (e.g. Portfolio Health rows). */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 32 } },
};

/** Slower-cadence sibling of `staggerContainer` for shorter, more deliberate lists (the
 * telemetry drawer's provider/usage rows) where a wider gap between items reads as more
 * considered rather than just "more delay". Pair with `staggerItem` for the children. */
export const staggerContainerLoose: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

/** Subtle hover lift for interactive cards — a couple of pixels, not a "float". */
export const cardHover = { y: -3, transition: { type: "spring", stiffness: 380, damping: 24 } as Transition };

/** Cross-fade for content that swaps in place (tab panels, live-updated values). */
export const crossFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: "easeIn" } },
};
