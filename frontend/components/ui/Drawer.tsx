"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const widthClass = width === "sm" ? "max-w-sm" : width === "lg" ? "max-w-xl" : "max-w-md";

  return (
    <div
      className={cn("fixed inset-0 z-50 transition-visibility", open ? "visible" : "invisible pointer-events-none")}
      aria-hidden={!open}
    >
      <div
        className={cn(
          "absolute inset-0 bg-neutral-950/50 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      {/* Genuine glass-surface treatment (see .glass-surface in globals.css) — this panel floats
          directly over the blurred backdrop above, so translucency has something real to show
          through rather than being applied decoratively. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={cn(
          "glass-surface absolute right-0 top-0 flex h-full w-full flex-col border-l shadow-elevation-3 transition-transform duration-200",
          widthClass,
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
          <h2 id="drawer-title" className="text-sm font-semibold text-text-primary">
            {title}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border-default px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
