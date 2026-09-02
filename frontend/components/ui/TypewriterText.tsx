"use client";

import { useTypewriter } from "@/lib/useTypewriter";
import { cn } from "@/lib/utils";

/**
 * Renders `text` with the typewriter reveal effect (lib/useTypewriter.ts). A dedicated component
 * (rather than calling the hook inline inside a `.map()`) so each item in a list of sections gets
 * its own hook instance per React's rules of hooks. Purely a presentation layer over text that
 * has already been fully fetched — see the hook's own docstring for the honesty rationale.
 */
export function TypewriterText({
  text,
  enabled = true,
  as: Tag = "p",
  className,
  showCaret = true,
}: {
  text: string;
  enabled?: boolean;
  as?: "p" | "span" | "div";
  className?: string;
  showCaret?: boolean;
}) {
  const { display, done } = useTypewriter(text, { enabled });
  return (
    <Tag className={cn(className)}>
      {display}
      {showCaret && !done && (
        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-pulse bg-current align-middle" aria-hidden="true" />
      )}
    </Tag>
  );
}
