"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { softSpring } from "@/lib/motion";

export interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

export function Sidebar({
  navItems,
  header,
  footer,
  mobileOpen,
  onMobileClose,
}: {
  navItems: NavItem[];
  header?: ReactNode;
  footer?: ReactNode;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();

  // Rendered twice (desktop rail + mobile drawer, see below) — both can be mounted at once since
  // the desktop one is only CSS-hidden below `md`, not unmounted. Framer Motion's `layoutId` must
  // be unique per simultaneously-mounted element, so each copy gets its own namespaced id.
  function renderContent(namespace: string) {
    return (
      <nav aria-label="Primary" className="flex h-full flex-col">
        {header}
        <ul className="flex-1 space-y-0.5 px-2.5 py-2">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onMobileClose}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "text-brand-700 dark:text-brand-200"
                      : "text-text-secondary hover:bg-subtle hover:text-text-primary",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId={`sidebar-active-pill-${namespace}`}
                      transition={softSpring}
                      className="absolute inset-0 rounded-md bg-brand-50 dark:bg-brand-900/40"
                    />
                  )}
                  <span className="relative z-10 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="relative z-10">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {footer}
      </nav>
    );
  }

  return (
    <>
      {/* border-e/inset-inline-start (not border-r/left-0): this shell is a plain flex row, so
          dir="rtl" (lib/i18n.tsx) already reverses which physical side the sidebar renders on —
          these logical properties keep the border/slide-in edge on the correct side either way,
          with zero change in the default LTR (English) rendering. */}
      <aside className="hidden md:flex md:w-56 md:shrink-0 md:flex-col md:border-e md:border-border-default md:bg-surface">
        {renderContent("desktop")}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-neutral-950/50" onClick={onMobileClose} aria-hidden="true" />
          <aside className="absolute start-0 top-0 h-full w-64 border-e border-border-default bg-surface shadow-2xl">
            {renderContent("mobile")}
          </aside>
        </div>
      )}
    </>
  );
}
