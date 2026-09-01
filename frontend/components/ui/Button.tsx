import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, forwardRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-300 dark:bg-brand-500 dark:hover:bg-brand-600",
  secondary:
    "bg-subtle text-text-primary border border-border-default hover:bg-inset disabled:opacity-50",
  outline:
    "bg-transparent text-text-primary border border-border-strong hover:bg-subtle disabled:opacity-50",
  ghost: "bg-transparent text-text-secondary hover:bg-subtle hover:text-text-primary disabled:opacity-50",
  danger:
    "bg-critical-solid text-white hover:opacity-90 disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2",
  icon: "h-9 w-9 p-0 justify-center",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:cursor-not-allowed",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

/** Button styled as a Next.js Link — for CTAs that navigate rather than trigger an action. */
export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Variant;
  size?: Size;
}

export function LinkButton({ href, variant = "primary", size = "md", className, children, ...props }: LinkButtonProps) {
  const isExternal = /^https?:\/\//.test(href) || href.startsWith("#");
  if (isExternal) {
    return (
      <a href={href} className={buttonClasses(variant, size, className)} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={buttonClasses(variant, size, className)}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
