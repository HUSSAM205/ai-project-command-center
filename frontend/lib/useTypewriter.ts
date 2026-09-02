"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Reveals `text` a few characters at a time via `setInterval` — a presentation effect layered
 * over text that has *already* been fully fetched (see components using this hook: the
 * boardroom memo and generated reports both resolve their full AI/PMO response before this
 * hook ever runs). It never implies live token-by-token generation; it's honestly a replay of
 * already-complete real content.
 *
 * Respects `prefers-reduced-motion` (via framer-motion's `useReducedMotion`, the same signal
 * lib/useCountUp.ts and app/layout.tsx's <MotionConfig reducedMotion="user"> use): reduced-motion
 * users see the full text immediately instead of watching it type out.
 *
 * Re-triggers only when `text` itself changes (a fresh generation) or `enabled` flips true — an
 * unrelated re-render of the host component (e.g. a sibling's loading state toggling) does not
 * restart the animation, since the effect's only real dependencies are `text`/`enabled`/reduced-motion.
 */
export function useTypewriter(
  text: string,
  options?: { charsPerTick?: number; intervalMs?: number; enabled?: boolean },
): { display: string; done: boolean } {
  const { charsPerTick = 4, intervalMs = 12, enabled = true } = options ?? {};
  const reduceMotion = useReducedMotion();
  const skip = !enabled || reduceMotion || !text;

  const [display, setDisplay] = useState(skip ? text : "");
  const [done, setDone] = useState(skip);

  useEffect(() => {
    if (skip) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced-motion/disabled path snaps to the final text, same pattern lib/useCountUp.ts uses
      setDisplay(text);
      setDone(true);
      return;
    }

    setDisplay("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i += charsPerTick;
      if (i >= text.length) {
        setDisplay(text);
        setDone(true);
        clearInterval(id);
      } else {
        setDisplay(text.slice(0, i));
      }
    }, intervalMs);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, skip]);

  return { display, done };
}
