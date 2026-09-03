"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { crossFade } from "@/lib/motion";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  badge?: ReactNode;
}

export function Tabs({
  tabs,
  defaultTab,
  value,
  onChange,
}: {
  tabs: TabItem[];
  defaultTab?: string;
  value?: string;
  onChange?: (id: string) => void;
}) {
  const [internal, setInternal] = useState(defaultTab ?? tabs[0]?.id);
  const active = value ?? internal;

  function select(id: string) {
    setInternal(id);
    onChange?.(id);
  }

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Section tabs"
        className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border-default bg-subtle p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            onClick={() => select(tab.id)}
            className={cn(
              "relative shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              active === tab.id ? "text-white dark:text-neutral-950" : "text-text-tertiary hover:text-text-primary",
            )}
          >
            {active === tab.id && (
              <motion.span
                layoutId="tab-pill-bg"
                className="absolute inset-0 rounded-full bg-brand-600 dark:bg-brand-400"
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {tab.label}
              {tab.badge}
            </span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${activeTab?.id}`} aria-labelledby={`tab-${activeTab?.id}`} className="pt-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={activeTab?.id} variants={crossFade} initial="initial" animate="animate" exit="exit">
            {activeTab?.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
