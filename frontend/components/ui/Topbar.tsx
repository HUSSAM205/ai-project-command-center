"use client";

import type { ReactNode } from "react";
import { Menu, Search } from "lucide-react";
import { Button } from "./Button";

export function Topbar({
  onMenuClick,
  left,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  right,
}: {
  onMenuClick?: () => void;
  left?: ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  right?: ReactNode;
}) {
  return (
    <header className="flex h-12 items-center gap-3 border-b border-border-default bg-surface px-4 md:px-5">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick} aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </Button>
      <div className="min-w-0 flex-1">{left}</div>
      {onSearchChange && (
        <div className="relative hidden w-64 sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder ?? "Search…"}
            aria-label={searchPlaceholder ?? "Search"}
            className="h-8 w-full rounded-md border border-border-default bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          />
        </div>
      )}
      <div className="flex items-center gap-1">{right}</div>
    </header>
  );
}
