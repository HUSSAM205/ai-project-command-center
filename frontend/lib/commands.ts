import type { ComponentType } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  ListChecks,
  Users,
  ShieldAlert,
  Wallet,
  FileText,
  BarChart3,
  ClipboardList,
  Sparkles,
  Briefcase,
  Cpu,
  ClipboardCheck,
  Presentation,
  Mic,
  Zap,
  Landmark,
} from "lucide-react";

/** Any lucide-react icon (or compatible component) — kept narrow so this file stays a plain
 * data module (no JSX) and doesn't need a .tsx extension. */
export type CommandIcon = ComponentType<{ className?: string }>;

export interface Command {
  /** Stable, unique key. Prefix with `nav-` for a static route, or a page-specific prefix for
   * anything dynamically generated (see CommandBar.tsx's live project entries, prefixed `project-`). */
  id: string;
  /** Text shown in the palette and matched against search input. */
  label: string;
  /** Route the command navigates to. Omit for an action command (provide `onSelect` instead). */
  href?: string;
  /** Runs a real side effect instead of navigating — e.g. triggering a live action on the page
   * the user is already on. Optional and backward-compatible: every pre-existing nav-only command
   * keeps working unchanged since it only ever set `href`. CommandBar.tsx calls `onSelect` when
   * present and falls back to `router.push(href)` otherwise, so a command needs exactly one of
   * the two, never both. */
  onSelect?: () => void;
  /** Section heading the command is grouped under in the palette (e.g. "Navigate"). */
  group: string;
  icon: CommandIcon;
  /** Extra search terms matched but not displayed (synonyms, abbreviations). */
  keywords?: string[];
}

/** Custom DOM event PMO action commands dispatch (see CommandBar.tsx's context-aware "Actions"
 * group, added only while the user is already on a project detail page). Named/typed here, not
 * inlined as string literals at each call site, so the dispatcher (CommandBar.tsx) and the
 * listener (app/app/projects/[id]/page.tsx's PMOTab) can never drift out of sync on the event
 * name or payload shape. Dispatched rather than routed through props because the command bar is
 * mounted once at the app-shell level (app/app/layout.tsx) and has no direct reference to the
 * mounted project page's component state — the same "decoupled via a plain DOM event" pattern
 * CommandBar.tsx's own OPEN_EVENT already uses to talk to its trigger button. */
export const PMO_COMMAND_EVENT = "aipcc:pmo-command";

export interface PmoCommandDetail {
  projectId: string;
  action: "memo" | "montecarlo" | "whatif";
}

export function dispatchPmoCommand(projectId: string, action: PmoCommandDetail["action"]) {
  window.dispatchEvent(new CustomEvent<PmoCommandDetail>(PMO_COMMAND_EVENT, { detail: { projectId, action } }));
}

/** Custom DOM event the command bar's `/new-task`, `/view-risks`, and `/export-brief` quick
 * actions dispatch (see CommandBar.tsx). Same "decoupled via a plain DOM event" reasoning as
 * PMO_COMMAND_EVENT above: the command bar is mounted at the app-shell level and has no direct
 * reference to whatever page component is (or isn't yet) mounted.
 *
 * Two delivery paths, both listened for by the target page (see app/app/tasks/page.tsx,
 * app/app/risks/page.tsx, app/app/reports/page.tsx for the exact pattern):
 *  - Already on the target page: this event fires immediately, no navigation needed.
 *  - Elsewhere: the command instead does `router.push("<page>?quick=<action>")`; the target page
 *    reads `?quick=` in a mount-only effect (plain `window.location.search`, not
 *    `useSearchParams()` — these pages are statically prerendered and a Suspense-boundary
 *    refactor isn't worth the risk for this), runs the same handler, then strips the param via
 *    `history.replaceState` so a later refresh doesn't repeat the action. */
export const QUICK_ACTION_EVENT = "aipcc:quick-action";

export type QuickAction = "new-task" | "view-risks" | "export-brief";

export interface QuickActionDetail {
  action: QuickAction;
}

export function dispatchQuickAction(action: QuickAction) {
  window.dispatchEvent(new CustomEvent<QuickActionDetail>(QUICK_ACTION_EVENT, { detail: { action } }));
}

/**
 * Static command registry for the global Cmd+K / Ctrl+K command bar (components/ui/CommandBar.tsx).
 *
 * HOW TO ADD A COMMAND: once your page is actually built and linked from somewhere (per this
 * project's "no dead links" rule — see docs/PROJECT_PLAN.md), append one object to this array.
 * You do not need to touch CommandBar.tsx — it imports this array and renders whatever is in it.
 *
 * Example, once /app/documents ships:
 *
 *   import { FileText } from "lucide-react";
 *   ...
 *   { id: "nav-documents", label: "Documents", href: "/app/documents", group: "Navigate", icon: FileText },
 *
 * `group` controls which section heading the command appears under — reuse "Navigate" for another
 * top-level page, or introduce a new group name (e.g. "Admin") if it deserves its own section.
 * `keywords` are optional synonyms a user might type instead of the label (e.g. `["cost", "spend"]`
 * for Budget) — they're matched but never shown.
 */
export const commands: Command[] = [
  { id: "nav-dashboard", label: "Dashboard", href: "/app/dashboard", group: "Navigate", icon: LayoutDashboard, keywords: ["home", "overview"] },
  { id: "nav-projects", label: "Projects", href: "/app/projects", group: "Navigate", icon: FolderKanban },
  { id: "nav-tasks", label: "Tasks", href: "/app/tasks", group: "Navigate", icon: ListChecks, keywords: ["kanban", "board"] },
  { id: "nav-resources", label: "Resources", href: "/app/resources", group: "Navigate", icon: Users, keywords: ["team", "people", "allocation"] },
  { id: "nav-risks", label: "Risks", href: "/app/risks", group: "Navigate", icon: ShieldAlert, keywords: ["risk matrix"] },
  { id: "nav-budget", label: "Budget", href: "/app/budget", group: "Navigate", icon: Wallet, keywords: ["cost", "spend", "forecast"] },
  { id: "nav-documents", label: "Documents", href: "/app/documents", group: "Navigate", icon: FileText, keywords: ["upload", "rag", "files"] },
  { id: "nav-meetings", label: "Meetings", href: "/app/meetings", group: "Navigate", icon: Mic, keywords: ["transcript", "action items", "decisions"] },
  { id: "nav-automations", label: "Automations", href: "/app/automations", group: "Navigate", icon: Zap, keywords: ["workflow", "rules", "triggers", "notifications"] },
  { id: "nav-governance", label: "Governance", href: "/app/governance", group: "Navigate", icon: Landmark, keywords: ["audit", "compliance", "audit trail", "export"] },
  { id: "nav-analytics", label: "Analytics", href: "/app/analytics", group: "Navigate", icon: BarChart3, keywords: ["trends", "charts"] },
  { id: "nav-reports", label: "Reports", href: "/app/reports", group: "Navigate", icon: ClipboardList, keywords: ["status", "executive summary"] },
  { id: "nav-ai-assistant", label: "AI Assistant", href: "/app/ai-assistant", group: "Navigate", icon: Sparkles, keywords: ["ask", "chat", "executive brief"] },
  { id: "nav-consulting", label: "Consulting", href: "/app/consulting", group: "Navigate", icon: Briefcase, keywords: ["business case", "roi", "roadmap", "opportunities"] },
  { id: "nav-workspace-architect", label: "Architect Workspace", href: "/app/workspace/architect", group: "Navigate", icon: Cpu, keywords: ["ai architecture", "pipeline", "telemetry", "router"] },
  { id: "nav-workspace-pmo", label: "PMO Workspace", href: "/app/workspace/pmo", group: "Navigate", icon: ClipboardCheck, keywords: ["evm", "stage gates", "raci", "portfolio"] },
  { id: "nav-workspace-product", label: "Executive Suite", href: "/app/workspace/product", group: "Navigate", icon: Presentation, keywords: ["boardroom", "value complexity", "trade-off", "prioritization"] },
];
