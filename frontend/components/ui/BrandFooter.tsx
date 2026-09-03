import { cn } from "@/lib/utils";
import { LogoMark } from "./LogoMark";

/**
 * Executive signature lockup: a slowly-rotating diamond mark beside stacked "MANAGED & POWERED
 * BY" / "ES EASY SOLUTIONS" text, the brand name in a cyan-to-violet gradient. The diamond spins
 * on a slow, gentle 24s cycle (`.brand-rotate-slow` in globals.css — deliberately distinct from
 * PulseDot.tsx's `.pulse-ring`, which signals live/active status; this mark signals calm ambient
 * presence, not a system state), disabled under `prefers-reduced-motion` at the CSS level.
 * Renders in three places (sidebar footer, topbar, PDF footer companion) and has no interactive
 * state of its own.
 */
export function BrandFooter({ variant = "full", className }: { variant?: "full" | "compact"; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border-default bg-subtle/50 px-2.5 py-1.5",
        variant === "full" ? "mx-3 mb-3 mt-1" : "",
        className,
      )}
    >
      <LogoMark size={variant === "compact" ? 14 : 18} className="brand-rotate-slow" />
      {variant === "full" ? (
        <div className="flex flex-col leading-tight">
          <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-widest text-text-tertiary">
            Managed &amp; powered by
          </span>
          <span className="whitespace-nowrap bg-gradient-to-r from-[#38bdf8] to-[#818cf8] bg-clip-text font-mono text-[11px] font-semibold uppercase tracking-widest text-transparent">
            ES Easy Solutions
          </span>
        </div>
      ) : (
        <p className="hidden whitespace-nowrap font-mono text-[11px] uppercase leading-none tracking-widest text-text-tertiary sm:block">
          <span className="bg-gradient-to-r from-[#38bdf8] to-[#818cf8] bg-clip-text font-semibold text-transparent">
            ES Easy Solutions
          </span>
        </p>
      )}
    </div>
  );
}
