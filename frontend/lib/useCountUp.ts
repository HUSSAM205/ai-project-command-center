"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

const defaultFormat = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Spring-animates a numeric display value from its previous value to `value` whenever it
 * changes — real spring physics via framer-motion's `animate()`, not a naive setInterval tween.
 * Respects `prefers-reduced-motion` (via framer-motion's `useReducedMotion`, the same signal
 * <MotionConfig reducedMotion="user"> in app/layout.tsx uses): reduced-motion users snap
 * straight to the final value instead of watching it climb.
 *
 * `format` receives the in-flight float on every animation frame (not just the rounded end
 * value) so callers can pass formatCompactCurrency/formatPercent/etc. and see those formats
 * animate too, not just plain integers.
 */
export function useCountUp(value: number, format: (n: number) => string = defaultFormat): string {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(() => format(value));
  const prevValue = useRef(value);
  const mounted = useRef(false);

  useEffect(() => {
    const from = mounted.current ? prevValue.current : value;
    mounted.current = true;
    prevValue.current = value;

    if (reduceMotion || !Number.isFinite(from) || !Number.isFinite(value)) {
      setDisplay(format(value));
      return;
    }

    const controls = animate(from, value, {
      type: "spring",
      stiffness: 120,
      damping: 22,
      mass: 1,
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
    // `format` is expected to be a stable/inline formatter (matches every call site below); only
    // re-running on value/reduceMotion changes avoids restarting the spring on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduceMotion]);

  return display;
}
