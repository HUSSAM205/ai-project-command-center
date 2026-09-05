"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { TableSkeleton } from "./LoadingState";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  width?: string;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  emptyTitle = "No results",
  emptyDescription,
  getRowKey,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
    // `columns` intentionally excluded: several call sites across the app rebuild their `columns`
    // array (new array + new render/sortValue closures) on every render without memoizing it, which
    // defeated this memo every single time it ran — re-sorting on any unrelated parent re-render,
    // not just on an actual `rows`/`sort` change. The column *definitions* a given DataTable is
    // rendered with don't change across a component's lifetime, only their identity does, so reading
    // the latest `columns` from the closure (rather than the dep array) is safe and keeps this memo
    // doing what it says: recompute only when the sortable data or the sort itself actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  function toggleSort(col: Column<T>) {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (prev?.key !== col.key) return { key: col.key, dir: "asc" };
      if (prev.dir === "asc") return { key: col.key, dir: "desc" };
      return null;
    });
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border-default bg-surface p-4">
        <TableSkeleton cols={columns.length} />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border-default bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-default bg-subtle/60">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{ width: col.width }}
                className={cn(
                  "px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary",
                  // Logical properties (text-end/text-start, not text-right/text-left): under
                  // dir="rtl" a "right"-aligned numeric/action column should sit at the reading
                  // end (visually the left), not stay pinned to the physical right — this is the
                  // one shared DataTable every list/table page in the app renders through, so
                  // fixing it here fixes every one of them consistently.
                  col.align === "right" ? "text-end" : col.align === "center" ? "text-center" : "text-start",
                )}
              >
                {col.sortValue ? (
                  <button
                    onClick={() => toggleSort(col)}
                    className="inline-flex items-center gap-1 hover:text-text-primary transition-colors"
                  >
                    {col.header}
                    {sort?.key === col.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUp className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="h-3 w-3" aria-hidden="true" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-border-default last:border-0 transition-colors",
                onRowClick && "cursor-pointer hover:bg-subtle",
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-text-primary",
                    // Logical properties (text-end/text-start, not text-right/text-left): under
                  // dir="rtl" a "right"-aligned numeric/action column should sit at the reading
                  // end (visually the left), not stay pinned to the physical right — this is the
                  // one shared DataTable every list/table page in the app renders through, so
                  // fixing it here fixes every one of them consistently.
                  col.align === "right" ? "text-end" : col.align === "center" ? "text-center" : "text-start",
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
