import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-border-default px-6 py-14 text-center", className)}>
      {icon && <div className="mb-3 text-text-tertiary">{icon}</div>}
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-text-tertiary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
