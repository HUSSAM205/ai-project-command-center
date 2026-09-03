import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The app's primary mark: a diamond cut from obsidian with a cyan-to-violet edge, "ES" set inside.
 * Same gradient pair BrandFooter.tsx's hex mark already uses (#38bdf8 -> #818cf8), so the two read
 * as one identity rather than two competing logo styles. Replaces the plain "AC" text badge that
 * used to sit in the sidebar header and on the auth pages.
 *
 * Gradient ids are instance-scoped via useId(): this component renders multiple times per page
 * (sidebar header, both BrandFooter placements, auth pages), and SVG ids must be document-unique
 * — sharing one literal id across instances is invalid, even though Chrome tolerates it silently.
 */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  const uid = useId();
  const fillId = `logoMarkFill-${uid}`;
  const edgeId = `logoMarkEdge-${uid}`;
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="AI Project Management System"
    >
      <defs>
        <linearGradient id={fillId} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0b1220" />
          <stop offset="1" stopColor="#151e30" />
        </linearGradient>
        <linearGradient id={edgeId} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <path d="M16 1.5 L30.5 16 L16 30.5 L1.5 16 Z" fill={`url(#${fillId})`} stroke={`url(#${edgeId})`} strokeWidth="1.5" strokeLinejoin="round" />
      <text
        x="16"
        y="20.5"
        textAnchor="middle"
        fontSize="10.5"
        fontWeight="700"
        letterSpacing="0.5"
        fill={`url(#${edgeId})`}
        style={{ fontFamily: "var(--font-geist-sans, ui-sans-serif)" }}
      >
        ES
      </text>
    </svg>
  );
}
