import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, label, error, id, required, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-text-primary">
            {label}
            {required && <span className="text-critical-fg ml-0.5">*</span>}
          </label>
        )}
        <input
          ref={ref}
          type="date"
          id={inputId}
          required={required}
          aria-invalid={!!error || undefined}
          className={cn(
            "h-9 w-full rounded-md border bg-surface px-3 text-sm text-text-primary font-tabular",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "[color-scheme:light] dark:[color-scheme:dark]",
            error ? "border-critical-border" : "border-border-default",
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs text-critical-fg">{error}</p>}
      </div>
    );
  },
);
DateInput.displayName = "DateInput";
