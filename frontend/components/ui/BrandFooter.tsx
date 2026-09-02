import { cn } from "@/lib/utils";

/**
 * Executive signature badge: a glowing hexagon mark + "MANAGED & POWERED BY ES EASY SOLUTIONS",
 * with the brand name in a cyan-to-violet gradient. Pure CSS pulse (Tailwind's `animate-pulse`,
 * disabled under `motion-reduce:` — same discipline as PulseDot.tsx) rather than a JS animation
 * loop, since this renders in three places (sidebar footer, topbar, PDF footer companion) and
 * has no interactive state of its own.
 */
export function BrandFooter({ variant = "full", className }: { variant?: "full" | "compact"; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", variant === "full" ? "px-4 py-3" : "", className)}>
      <HexMark className={variant === "compact" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {variant === "full" ? (
        <p className="whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
          Managed &amp; powered by{" "}
          <span className="bg-gradient-to-r from-[#38bdf8] to-[#818cf8] bg-clip-text font-semibold text-transparent">
            ES Easy Solutions
          </span>
        </p>
      ) : (
        <p className="hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-text-tertiary sm:block">
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
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} aria-hidden="true">
      <span className="absolute inset-0 animate-pulse rounded-[3px] bg-gradient-to-br from-[#38bdf8] to-[#818cf8] opacity-40 blur-[3px] motion-reduce:animate-none" />
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
