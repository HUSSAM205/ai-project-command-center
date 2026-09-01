import { cn, formatDate } from "@/lib/utils";
import type { Milestone } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";

const dotTone: Record<Milestone["status"], string> = {
  COMPLETED: "bg-success-solid border-success-solid",
  AT_RISK: "bg-critical-solid border-critical-solid",
  PENDING: "bg-surface border-border-strong",
};

const lineTone: Record<Milestone["status"], string> = {
  COMPLETED: "text-success-fg",
  AT_RISK: "text-critical-fg",
  PENDING: "text-text-tertiary",
};

/** Vertical milestone timeline — a lighter-weight companion to the Gantt for overview contexts. */
export function Timeline({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) {
    return <EmptyState title="No milestones" description="Milestones added to this project will appear here." />;
  }

  const sorted = [...milestones].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <ol className="relative ml-2 space-y-6 border-l border-border-default pl-6">
      {sorted.map((m) => (
        <li key={m.id} className="relative">
          <span
            className={cn("absolute -left-[29px] top-0.5 h-3 w-3 rounded-full border-2", dotTone[m.status])}
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-text-primary">{m.name}</p>
          <p className={cn("text-xs font-tabular", lineTone[m.status])}>
            {formatDate(m.due_date)} · {m.status.replace("_", " ")}
          </p>
          {m.description && <p className="mt-1 text-xs text-text-tertiary">{m.description}</p>}
        </li>
      ))}
    </ol>
  );
}
