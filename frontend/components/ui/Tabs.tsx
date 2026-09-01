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
      <div role="tablist" aria-label="Section tabs" className="flex gap-1 border-b border-border-default overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            onClick={() => select(tab.id)}
            className={cn(
              "relative flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded-t-md",
              active === tab.id ? "text-brand-700 dark:text-brand-300" : "text-text-tertiary hover:text-text-primary",
            )}
          >
            {tab.label}
            {tab.badge}
            {active === tab.id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-600 dark:bg-brand-400" />}
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
