import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** High-opacity glass: `backdrop-blur-xl` over a ~92%-opaque surface. Deliberately not the low
 * opacity (40–60%) glassmorphism preset seen on marketing sites — `backdrop-blur` only affects
 * what's *behind* the element (composited before this element's own content is drawn), so at this
 * opacity a card floating over the canvas-texture/ambient-glow background reads as frosted glass
 * while the dense tables and financial figures it contains stay fully opaque and crisp — text
 * never sits on a translucent layer itself. Dropping opacity much further than this is where WCAG
 * "overly transparent surfaces blur hierarchy" actually starts to bite; this stays well clear of
 * that line. Deliberate floating overlays (CommandBar, Drawer) use `.glass-surface` from
 * globals.css instead of this component — a different, lower-opacity treatment appropriate for
 * something meant to visually separate from a dismissible background, not sit inline with data. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "card-glass rounded-lg border border-border-default/80 bg-surface/92 shadow-elevation-1 backdrop-blur-xl transition-[border-color,box-shadow] duration-300 hover:border-brand-500/50",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4 px-5 pt-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-text-primary", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-text-tertiary mt-0.5", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 pt-0 flex items-center gap-2", className)} {...props} />;
}
