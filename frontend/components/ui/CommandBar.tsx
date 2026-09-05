"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Dices, Download, FolderKanban, ListChecks, Presentation, Search, ShieldAlert, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { softSpring } from "@/lib/motion";
import { api } from "@/lib/api";
import { commands as staticCommands, dispatchPmoCommand, dispatchQuickAction, type Command } from "@/lib/commands";
import { bestFuzzyScore } from "@/lib/fuzzy";

const OPEN_EVENT = "aipcc:open-command-bar";

/**
 * Button that opens the command bar from anywhere it's rendered (e.g. the Topbar). Decoupled from
 * CommandBar's own open state via a plain DOM event so it can be dropped in without prop-drilling
 * state through the app shell.
 */
export function CommandBarTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={cn(
        "flex h-8 w-full max-w-xs items-center gap-2 rounded-md border border-border-default bg-surface px-2.5 text-left text-xs text-text-tertiary transition-colors hover:border-border-strong hover:text-text-secondary",
        className,
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="hidden truncate sm:inline">Search or jump to…</span>
      <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded border border-border-default bg-subtle px-1 font-mono text-[10px] text-text-tertiary sm:flex">
        <span aria-hidden="true">⌘</span>K
      </kbd>
    </button>
  );
}

interface ScoredCommand extends Command {
  score: number;
}

/**
 * Global Cmd+K / Ctrl+K command palette. Mounted once in app/app/layout.tsx so it's available on
 * every /app/* route. Searches the static registry in lib/commands.ts plus a live-fetched list of
 * the current org's projects (so "jump to <project name>" works), and navigates on select.
 */
export function CommandBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [projectCommands, setProjectCommands] = useState<Command[] | null>(null);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [taskCommands, setTaskCommands] = useState<Command[] | null>(null);
  const [resourceCommands, setResourceCommands] = useState<Command[] | null>(null);
  const [riskCommands, setRiskCommands] = useState<Command[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global open shortcut + external trigger event.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, []);

  // Reset the query/selection whenever the palette transitions closed -> open. This adjusts state
  // during render (React's recommended pattern for "reset on prop/state change") rather than in an
  // effect, so it doesn't cost an extra commit.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  // Lock page scroll and focus the input while open — genuine side effects on external systems
  // (the DOM), not component state, so this belongs in an effect.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
    };
  }, [open]);

  // Lazily fetch the live project list the first time the palette opens. Failures degrade
  // gracefully to the static navigation commands only — the backend being briefly unreachable
  // shouldn't make Cmd+K itself unusable.
  useEffect(() => {
    if (!open || projectCommands !== null) return;
    let cancelled = false;
    api
      .projects()
      .then((list) => {
        if (cancelled) return;
        setProjectCommands(
          list.map((p) => ({
            id: `project-${p.id}`,
            label: p.name,
            href: `/app/projects/${p.id}`,
            group: "Projects",
            icon: FolderKanban,
          })),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setProjectsFailed(true);
        setProjectCommands([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectCommands]);

  // Deep Search: tasks/resources/risks, lazily fetched the same way as projects above — each
  // independently gated and failure-tolerant, so one slow/failed org-wide fetch never blocks the
  // others or makes the palette itself unusable. Tasks and risks have no per-record detail route
  // (only the list pages do), so their href pre-fills that list page's own real title-search filter
  // (?q=) rather than pointing at a page that doesn't exist. Resources gained a matching ?q= filter
  // on its DataTable specifically so this deep link actually lands on the right row.
  useEffect(() => {
    if (!open || taskCommands !== null) return;
    let cancelled = false;
    api
      .allTasks()
      .then((list) => {
        if (cancelled) return;
        setTaskCommands(
          list.map((t) => ({
            id: `task-${t.id}`,
            label: t.title,
            href: `/app/tasks?q=${encodeURIComponent(t.title)}`,
            group: "Tasks",
            icon: ListChecks,
            keywords: t.project_name ? [t.project_name] : [],
          })),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setTaskCommands([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, taskCommands]);

  useEffect(() => {
    if (!open || resourceCommands !== null) return;
    let cancelled = false;
    api
      .resources()
      .then((list) => {
        if (cancelled) return;
        setResourceCommands(
          list.map((r) => ({
            id: `resource-${r.id}`,
            label: r.name,
            href: `/app/resources?q=${encodeURIComponent(r.name)}`,
            group: "Resources",
            icon: Users,
            keywords: [r.role, r.department].filter((v): v is string => !!v),
          })),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setResourceCommands([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, resourceCommands]);

  useEffect(() => {
    if (!open || riskCommands !== null) return;
    let cancelled = false;
    api
      .allRisks()
      .then((list) => {
        if (cancelled) return;
        setRiskCommands(
          list.map((r) => ({
            id: `risk-${r.id}`,
            label: r.title,
            href: `/app/risks?q=${encodeURIComponent(r.title)}`,
            group: "Risks",
            icon: ShieldAlert,
            keywords: r.project_name ? [r.project_name] : [],
          })),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setRiskCommands([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, riskCommands]);

  // Context-aware action commands — real side effects, not navigation (see lib/commands.ts's
  // `onSelect` extension). Only offered while the user is actually on that project's detail page,
  // since the action targets components mounted there (BoardroomMemoCard / MonteCarloCard in
  // app/app/projects/[id]/page.tsx) via the PMO_COMMAND_EVENT they're already listening for.
  const currentProjectId = pathname?.match(/^\/app\/projects\/([^/]+)$/)?.[1] ?? null;
  const actionCommands = useMemo<Command[]>(() => {
    if (!currentProjectId) return [];
    return [
      {
        id: "action-boardroom-memo",
        label: "Generate Boardroom Memo for this project",
        group: "Actions",
        icon: Presentation,
        keywords: ["memo", "brief", "pmo", "generate"],
        onSelect: () => dispatchPmoCommand(currentProjectId, "memo"),
      },
      {
        id: "action-monte-carlo",
        label: "Run Monte Carlo Simulation for this project",
        group: "Actions",
        icon: Dices,
        keywords: ["simulation", "timeline", "forecast", "pmo", "monte carlo"],
        onSelect: () => dispatchPmoCommand(currentProjectId, "montecarlo"),
      },
    ];
  }, [currentProjectId]);

  // Quick-action slash commands — real side effects (or a real filter-preserving navigation),
  // never a placeholder. Each targets a page that already implements the underlying capability
  // for real (task creation modal, What-If sandbox, risk severity filter, executive PDF export);
  // this just makes each one reachable from anywhere via Cmd+K. Delivery uses QUICK_ACTION_EVENT
  // when already on the target page (immediate) or a `?quick=` query param the target page reads
  // on mount otherwise — see lib/commands.ts's docstring on QUICK_ACTION_EVENT for why.
  const quickActionCommands = useMemo<Command[]>(
    () => [
      {
        id: "quick-new-task",
        label: "/new-task — Create a new task",
        group: "Actions",
        icon: ListChecks,
        keywords: ["create task", "add task"],
        onSelect: () => {
          if (pathname === "/app/tasks") dispatchQuickAction("new-task");
          else router.push("/app/tasks?quick=new-task");
        },
      },
      {
        id: "quick-what-if",
        label: "/what-if — Open the What-If simulation sandbox",
        group: "Actions",
        icon: Dices,
        keywords: ["simulate", "sandbox", "scenario"],
        onSelect: () => {
          if (currentProjectId) {
            // WhatIfCard's #what-if-sandbox lives inside the project page's PMO tab, which only
            // mounts its content when active -- same PMO_COMMAND_EVENT channel the boardroom-memo/
            // Monte Carlo actions already use to switch tabs, see app/app/projects/[id]/page.tsx.
            dispatchPmoCommand(currentProjectId, "whatif");
          } else {
            router.push("/app/projects");
          }
        },
      },
      {
        id: "quick-view-risks",
        label: "/view-risks — Filter the risk matrix to critical severity",
        group: "Actions",
        icon: ShieldAlert,
        keywords: ["critical", "high severity", "matrix"],
        onSelect: () => {
          if (pathname === "/app/risks") dispatchQuickAction("view-risks");
          else router.push("/app/risks?quick=view-risks");
        },
      },
      {
        id: "quick-export-brief",
        label: "/export-brief — Download the executive summary PDF",
        group: "Actions",
        icon: Download,
        keywords: ["pdf", "download", "executive summary"],
        onSelect: () => {
          if (pathname === "/app/reports") dispatchQuickAction("export-brief");
          else router.push("/app/reports?quick=export-brief");
        },
      },
    ],
    [pathname, currentProjectId, router],
  );

  const allCommands = useMemo(
    () => [
      ...staticCommands,
      ...quickActionCommands,
      ...actionCommands,
      ...(projectCommands ?? []),
      ...(taskCommands ?? []),
      ...(resourceCommands ?? []),
      ...(riskCommands ?? []),
    ],
    [quickActionCommands, actionCommands, projectCommands, taskCommands, resourceCommands, riskCommands],
  );

  const results = useMemo<ScoredCommand[]>(() => {
    if (!query.trim()) return allCommands.map((c) => ({ ...c, score: 0 }));
    return allCommands
      .map((c) => ({ ...c, score: bestFuzzyScore(query, [c.label, ...(c.keywords ?? [])]) }))
      .filter((c) => c.score >= 0)
      .sort((a, b) => b.score - a.score);
  }, [query, allCommands]);

  // Same render-phase pattern as above: re-selecting the first result whenever the query text
  // changes (a new result set) doesn't need a dedicated effect.
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setActiveIndex(0);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ScoredCommand[]>();
    for (const item of results) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    }
    return map;
  }, [results]);

  /** Activates a command: runs its real side effect (`onSelect`) if it has one, otherwise
   * navigates to its route. A command carries exactly one of the two (see lib/commands.ts). */
  function activate(cmd: Command) {
    setOpen(false);
    if (cmd.onSelect) {
      cmd.onSelect();
      return;
    }
    if (cmd.href) router.push(cmd.href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = results[activeIndex];
      if (cmd) activate(cmd);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
          <motion.div
            className="absolute inset-0 bg-neutral-950/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={softSpring}
            className="glass-surface relative z-10 w-full max-w-lg overflow-hidden rounded-lg border shadow-elevation-3"
          >
            <div className="flex items-center gap-2.5 border-b border-border-default px-4">
              <Search className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search commands and projects…"
                aria-label="Command palette search"
                className="h-12 w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              <kbd className="hidden shrink-0 rounded border border-border-default px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary sm:block">
                Esc
              </kbd>
            </div>

            <div className="max-h-80 overflow-y-auto py-2">
              {results.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-text-tertiary">
                  No matches for &ldquo;{query}&rdquo;.
                </p>
              )}
              {[...grouped.entries()].map(([group, items]) => (
                <div key={group} className="px-2 py-1">
                  <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                    {group}
                  </p>
                  {items.map((item) => {
                    const idx = results.indexOf(item);
                    const Icon = item.icon;
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => activate(item)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          active
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                            : "text-text-secondary hover:bg-subtle hover:text-text-primary",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              ))}
              {projectsFailed && (
                <p className="px-4 py-2 text-xs text-text-tertiary">
                  Couldn&rsquo;t load live projects — showing navigation only.
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
