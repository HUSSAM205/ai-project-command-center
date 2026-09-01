import { AlertTriangle, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export function ErrorState({
  title = "Something went wrong",
  description,
  offline,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  offline?: boolean;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-critical-border bg-critical-bg px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 text-critical-fg">
        {offline ? <WifiOff className="h-6 w-6" aria-hidden="true" /> : <AlertTriangle className="h-6 w-6" aria-hidden="true" />}
      </div>
      <h3 className="text-sm font-semibold text-critical-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-critical-fg/80">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
