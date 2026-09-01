"use client";

import { useState, type DragEvent } from "react";
import { cn, formatDateShort, initials } from "@/lib/utils";
import type { Task, TaskStatus } from "@/lib/types";
import { Badge, priorityTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "TODO", label: "To Do" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "BLOCKED", label: "Blocked" },
  { id: "REVIEW", label: "Review" },
  { id: "DONE", label: "Done" },
];

const columnAccent: Record<TaskStatus, string> = {
  TODO: "border-t-neutral-400",
  IN_PROGRESS: "border-t-info-solid",
  BLOCKED: "border-t-critical-solid",
  REVIEW: "border-t-warning-solid",
  DONE: "border-t-success-solid",
};

export function Kanban({
  tasks,
  onStatusChange,
  readOnly,
}: {
  tasks: Task[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  readOnly?: boolean;
}) {
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>, status: TaskStatus) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggingId;
    if (taskId) onStatusChange(taskId, status);
    setDraggingId(null);
  }

  if (tasks.length === 0) {
    return <EmptyState title="No tasks yet" description="Tasks will appear here once created." />;
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id);
        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(col.id);
            }}
            onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
            onDrop={(e) => handleDrop(e, col.id)}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-lg border border-t-4 border-border-default bg-subtle/40 transition-colors",
              columnAccent[col.id],
              dragOverCol === col.id && "bg-inset",
            )}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <h3 className="text-sm font-semibold text-text-primary">{col.label}</h3>
              <span className="font-tabular text-xs text-text-tertiary">{colTasks.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2 px-2 pb-2 min-h-[80px]">
              {colTasks.map((task) => (
                <div
                  key={task.id}
                  draggable={!readOnly}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", task.id);
                    setDraggingId(task.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={cn(
                    "rounded-md border border-border-default bg-surface p-3 shadow-sm transition-opacity",
                    !readOnly && "cursor-grab active:cursor-grabbing",
                    draggingId === task.id && "opacity-50",
                  )}
                >
                  <p className="text-sm font-medium text-text-primary">{task.title}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                    {task.due_date && <span className="font-tabular text-xs text-text-tertiary">{formatDateShort(task.due_date)}</span>}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {task.assignee_name ? (
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-200"
                        title={task.assignee_name}
                      >
                        {initials(task.assignee_name)}
                      </span>
                    ) : (
                      <span className="text-xs text-text-tertiary">Unassigned</span>
                    )}
                    {!readOnly && (
                      <label className="sr-only" htmlFor={`status-${task.id}`}>
                        Change status for {task.title}
                      </label>
                    )}
                    {!readOnly && (
                      <select
                        id={`status-${task.id}`}
                        value={task.status}
                        onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
                        className="rounded border border-border-default bg-surface px-1 py-0.5 text-[11px] text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
