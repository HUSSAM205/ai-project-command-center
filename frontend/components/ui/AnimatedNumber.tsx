"use client";

import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/useCountUp";

/**
 * Drop-in replacement for a bare `{number}` render — spring-animates from the previous value to
 * `value` on mount/change (see lib/useCountUp.ts). Pass `format` for currency/percent/etc.
 * ("$1.2M", "42%") and it animates the formatted string in flight, not just plain integers.
 */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const display = useCountUp(value, format);
  return (
    <span className={cn("font-tabular tabular-nums", className)} aria-live="off">
      {display}
    </span>
  );
}
