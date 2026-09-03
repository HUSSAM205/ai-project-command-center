import { cn } from "@/lib/utils";

/**
 * Executive signature badge: a glowing hexagon mark + "MANAGED & POWERED BY ES EASY SOLUTIONS",
 * with the brand name in a cyan-to-violet gradient. The hex core breathes on a slow, gentle
 * sine-like cycle (`.brand-breathe` in globals.css — deliberately distinct from PulseDot.tsx's
 * `.pulse-ring`, which signals live/active status; this mark signals calm ambient presence, not
 * a system state), disabled under `prefers-reduced-motion` at the CSS level. Renders in three
 * places (sidebar footer, topbar, PDF footer companion) and has no interactive state of its own.
 */
export function BrandFooter({ variant = "full", className }: { variant?: "full" | "compact"; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border-default bg-subtle/50 px-2.5 py-1",
        variant === "full" ? "mx-3 mb-3 mt-1" : "",
        className,
      )}
    >
      <HexMark className={variant === "compact" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {variant === "full" ? (
        <p className="whitespace-nowrap font-mono text-[11px] uppercase leading-none tracking-widest text-text-tertiary">
          Managed &amp; powered by{" "}
          <span className="bg-gradient-to-r from-[#38bdf8] to-[#818cf8] bg-clip-text font-semibold text-transparent">
            ES Easy Solutions
          </span>
        </p>
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

function HexMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center brand-breathe", className)} aria-hidden="true">
      <span className="absolute inset-0 rounded-[3px] bg-gradient-to-br from-[#38bdf8] to-[#818cf8] opacity-50 blur-[2.5px]" />
      <svg viewBox="0 0 24 24" className="relative h-full w-full" fill="none">
        <path
          d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z"
          stroke="url(#brandFooterHexGradient)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="brandFooterHexGradient" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#818cf8" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}
