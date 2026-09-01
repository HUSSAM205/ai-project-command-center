"use client";

import { useMemo, useState } from "react";
import { cn, formatDate } from "@/lib/utils";
import type { Milestone, Task } from "@/lib/types";
import { Tooltip } from "@/components/ui/Tooltip";
import { EmptyState } from "@/components/ui/EmptyState";

const DAY_WIDTH = 28;
const ROW_HEIGHT = 40;

function toDate(s: string) {
  return new Date(s + "T00:00:00");
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const statusBarClass: Record<string, string> = {
  TODO: "bg-neutral-300 dark:bg-neutral-600",
  IN_PROGRESS: "bg-info-solid",
  BLOCKED: "bg-critical-solid",
  REVIEW: "bg-warning-solid",
  DONE: "bg-success-solid",
};

export function Gantt({ tasks, milestones }: { tasks: Task[]; milestones: Milestone[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const usable = tasks.filter((t) => t.start_date && t.due_date);

  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    const dates: Date[] = [];
    usable.forEach((t) => {
      dates.push(toDate(t.start_date!), toDate(t.due_date!));
    });
    milestones.forEach((m) => dates.push(toDate(m.due_date)));
    dates.push(new Date());
    if (dates.length === 0) {
      const today = new Date();
      return { rangeStart: today, rangeEnd: today, totalDays: 1 };
    }
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    min.setDate(min.getDate() - 3);
    max.setDate(max.getDate() + 3);
    return { rangeStart: min, rangeEnd: max, totalDays: Math.max(1, daysBetween(min, max)) };
  }, [usable, milestones]);

  if (usable.length === 0) {
    return <EmptyState title="No scheduled tasks" description="Tasks need a start and due date to appear on the Gantt chart." />;
  }

  const today = new Date();
  const todayOffset = daysBetween(rangeStart, today) * DAY_WIDTH;
  const chartWidth = totalDays * DAY_WIDTH;

  const months: { label: string; offset: number; width: number }[] = [];
  {
    const cursor = new Date(rangeStart);
    cursor.setDate(1);
    while (cursor <= rangeEnd) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const start = cursor < rangeStart ? rangeStart : cursor;
      const end = next > rangeEnd ? rangeEnd : next;
      const offset = Math.max(0, daysBetween(rangeStart, start)) * DAY_WIDTH;
      const width = Math.max(0, daysBetween(start, end)) * DAY_WIDTH;
      months.push({ label: cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" }), offset, width });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const rowIndex = new Map<string, number>();
  usable.forEach((t, i) => rowIndex.set(t.id, i));

  function barGeometry(t: Task) {
    const start = toDate(t.start_date!);
    const end = toDate(t.due_date!);
    const left = daysBetween(rangeStart, start) * DAY_WIDTH;
    const width = Math.max(DAY_WIDTH * 0.6, daysBetween(start, end) * DAY_WIDTH);
    const isDelayed = end < today && t.status !== "DONE";
    return { left, width, isDelayed };
  }

  return (
    <div className="rounded-lg border border-border-default bg-surface">
      <div className="flex items-center gap-4 border-b border-border-default px-4 py-2.5 text-xs text-text-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-critical-solid" /> Delayed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-brand-600 dark:bg-brand-300" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="10" aria-hidden="true"><path d="M7 0 L14 5 L7 10 L0 5 Z" fill="currentColor" className="text-text-tertiary" /></svg>
          Milestone
        </span>
      </div>
      <div className="overflow-x-auto">
        <div style={{ width: chartWidth + 200 }}>
          {/* Month header */}
          <div className="relative flex border-b border-border-default" style={{ height: 28 }}>
            <div className="sticky left-0 z-10 w-[200px] shrink-0 border-r border-border-default bg-surface" />
            <div className="relative" style={{ width: chartWidth }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 border-r border-border-default px-2 py-1.5 text-[11px] font-medium text-text-tertiary"
                  style={{ left: m.offset, width: m.width }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="relative">
            {/* Today marker spanning all rows */}
            {todayOffset >= 0 && todayOffset <= chartWidth && (
              <div
                className="absolute top-0 z-10 w-px bg-brand-600 dark:bg-brand-300"
                style={{ left: 200 + todayOffset, height: usable.length * ROW_HEIGHT }}
                aria-hidden="true"
              />
            )}
            {usable.map((t, i) => {
              const { left, width, isDelayed } = barGeometry(t);
              return (
                <div key={t.id} className="flex border-b border-border-default last:border-0" style={{ height: ROW_HEIGHT }}>
                  <div className="sticky left-0 z-10 flex w-[200px] shrink-0 items-center border-r border-border-default bg-surface px-3 text-xs font-medium text-text-primary truncate">
                    {t.title}
                  </div>
                  <div className="relative" style={{ width: chartWidth }}>
                    {/* dependency lines */}
                    {(t.depends_on ?? []).map((depId) => {
                      const depTask = usable.find((u) => u.id === depId);
                      if (!depTask) return null;
                      const depGeo = barGeometry(depTask);
                      const depRow = rowIndex.get(depId)!;
                      const x1 = depGeo.left + depGeo.width;
                      const y1 = depRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                      const x2 = left;
                      const y2 = i * ROW_HEIGHT + ROW_HEIGHT / 2;
                      return (
                        <svg
                          key={depId}
                          className="pointer-events-none absolute top-0 left-0 overflow-visible"
                          style={{ transform: `translateY(${-i * ROW_HEIGHT}px)` }}
                          aria-hidden="true"
                        >
                          <path
                            d={`M ${x1} ${y1} L ${x1 + 8} ${y1} L ${x1 + 8} ${y2} L ${x2} ${y2}`}
                            fill="none"
                            stroke="var(--border-strong)"
                            strokeWidth={1.5}
                            markerEnd="url(#arrow)"
                          />
                        </svg>
                      );
                    })}
                    <div
                      onMouseEnter={() => setHovered(t.id)}
                      onMouseLeave={() => setHovered(null)}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 rounded-md h-5 flex items-center overflow-hidden",
                        isDelayed ? "ring-2 ring-critical-solid" : "",
                      )}
                      style={{ left, width }}
                    >
                      <div className={cn("absolute inset-0", statusBarClass[t.status] ?? "bg-neutral-300", "opacity-30")} />
                      <div
                        className={cn("absolute left-0 top-0 h-full", statusBarClass[t.status] ?? "bg-neutral-400")}
                        style={{ width: `${Math.min(100, t.completion_percentage)}%` }}
                      />
                      {hovered === t.id && (
                        <div className="absolute -top-9 left-0 z-20 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900">
                          {t.title} · {formatDate(t.start_date)}–{formatDate(t.due_date)} · {t.completion_percentage}%
                          {isDelayed && " · Delayed"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Milestones row */}
            {milestones.length > 0 && (
              <div className="flex border-t-2 border-border-strong" style={{ height: ROW_HEIGHT }}>
                <div className="sticky left-0 z-10 flex w-[200px] shrink-0 items-center border-r border-border-default bg-surface px-3 text-xs font-semibold text-text-secondary">
                  Milestones
                </div>
                <div className="relative" style={{ width: chartWidth }}>
                  {milestones.map((m) => {
                    const x = daysBetween(rangeStart, toDate(m.due_date)) * DAY_WIDTH;
                    const tone =
                      m.status === "COMPLETED" ? "text-success-solid" : m.status === "AT_RISK" ? "text-critical-solid" : "text-brand-600 dark:text-brand-300";
                    return (
                      <Tooltip key={m.id} content={`${m.name} · ${formatDate(m.due_date)} · ${m.status}`}>
                        <span
                          className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2", tone)}
                          style={{ left: x }}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                            <path d="M7 0 L14 7 L7 14 L0 7 Z" fill="currentColor" />
                          </svg>
                        </span>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
