import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Stays opaque (no blur/transparency) even in the dark theme — cards routinely sit over dense
 * financial/risk tables, and a translucent surface there would blur the exact hierarchy WCAG
 * asks a card to establish. The "richer surface" ask is met with a restrained border/shadow
 * lift on hover instead — real depth cue, zero readability cost. Deliberate floating overlays
 * (CommandBar, Drawer) use `.glass-surface` from globals.css instead of this component. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-default bg-surface shadow-elevation-1 transition-[border-color,box-shadow] duration-200 hover:border-brand-500/40 hover:shadow-elevation-2",
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
