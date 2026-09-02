"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  LogOut,
  ShieldCheck,
  Cpu,
  ClipboardCheck,
  Presentation,
} from "lucide-react";
import { Sidebar, type NavItem } from "@/components/ui/Sidebar";
import { Topbar } from "@/components/ui/Topbar";
import { BrandFooter } from "@/components/ui/BrandFooter";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Dropdown } from "@/components/ui/Dropdown";
import { Spinner } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { CommandBar, CommandBarTrigger } from "@/components/ui/CommandBar";
import { TelemetryDrawer, TelemetryDrawerTrigger } from "@/components/ui/TelemetryDrawer";
import { PulseDot } from "@/components/ui/PulseDot";
import { useAuth } from "@/lib/auth";
import { useDashboardStream, type StreamStatus } from "@/lib/useDashboardStream";
import { useSlowLoadHint } from "@/lib/useSlowLoadHint";
import { initials, cn } from "@/lib/utils";

// Honest labels per real SSE/dashboard-stream connection state (useDashboardStream.ts) — only the
// genuinely-live state claims the stream is "Active", matching the same real-state-only pattern
// LiveIndicator.tsx already uses elsewhere in the app. Never a static "always green" dot.
const STREAM_STATUS_LABEL: Record<StreamStatus, string> = {
  connecting: "Enterprise Node · Connecting…",
  live: "Enterprise Node · Production Active",
  reconnecting: "Enterprise Node · Reconnecting…",
  offline: "Enterprise Node · Stream Offline",
};

function WorkspaceStreamStatus({ status }: { status: StreamStatus }) {
  const live = status === "live";
  return (
    <span
      className={cn(
        "hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex",
        live ? "border-success-border bg-success-bg text-success-fg" : "border-border-default bg-subtle text-text-tertiary",
      )}
    >
      {live ? <PulseDot tone="success" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-tertiary" aria-hidden="true" />}
      {STREAM_STATUS_LABEL[status]}
    </span>
  );
}

// Primary sidebar nav, top to bottom. Append one line per shipped page — do not restructure this
// component or Sidebar.tsx to add an item. Per docs/PROJECT_PLAN.md's "no dead links" rule, only
// add an entry once the page it points to actually exists and works. When you do add a page,
// also register it in lib/commands.ts so it's reachable from the Cmd+K command bar.
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: <LayoutDashboard /> },
  { label: "Projects", href: "/app/projects", icon: <FolderKanban /> },
  { label: "Tasks", href: "/app/tasks", icon: <ListChecks /> },
  { label: "Resources", href: "/app/resources", icon: <Users /> },
  { label: "Risks", href: "/app/risks", icon: <ShieldAlert /> },
  { label: "Budget", href: "/app/budget", icon: <Wallet /> },
  { label: "AI Assistant", href: "/app/ai-assistant", icon: <Sparkles /> },
  { label: "Documents", href: "/app/documents", icon: <FileText /> },
  { label: "Consulting", href: "/app/consulting", icon: <Briefcase /> },
  { label: "Analytics", href: "/app/analytics", icon: <BarChart3 /> },
  { label: "Reports", href: "/app/reports", icon: <ClipboardList /> },
  // Persona-oriented aggregation/overview pages — curate and link into the same real data the
  // pages above already serve, rather than a new data source. Grouped visually last since they're
  // dashboards-of-dashboards, not primary functional surfaces.
  { label: "Architect Workspace", href: "/app/workspace/architect", icon: <Cpu /> },
  { label: "PMO Workspace", href: "/app/workspace/pmo", icon: <ClipboardCheck /> },
  { label: "Executive Suite", href: "/app/workspace/product", icon: <Presentation /> },
];

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, isDemo, logout } = useAuth();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Real SSE/dashboard-stream connection state for the topbar's status module below — same hook
  // the dashboard page itself uses (lib/useDashboardStream.ts), so the pulse reflects the actual
  // connection, never a fabricated "always green" indicator.
  const dashboardStream = useDashboardStream();
  const slowAuth = useSlowLoadHint(isLoading);

  // AuthProvider (lib/auth.tsx) auto-establishes a live session for any visitor with none — no
  // forced redirect to a login wall. If that auto-session genuinely couldn't be established
  // (backend unreachable), show a real error/retry state rather than looping or faking success.
  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas px-4 text-center">
        <Spinner />
        {slowAuth && (
          <p className="max-w-xs text-sm text-text-tertiary">
            Still connecting — the live backend can take up to a minute to wake up after being idle.
          </p>
        )}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas px-4">
        <ErrorState
          title="Couldn't connect"
          description="The backend may be offline. Try again in a moment."
          offline
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar
        navItems={NAV_ITEMS}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        footer={<BrandFooter className="border-t border-border-default" />}
        header={
          <Link href="/app/dashboard" className="flex items-center gap-2 border-b border-border-default px-4 py-3.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-700 text-xs font-bold text-white">
              AC
            </span>
            <span className="text-sm font-semibold text-text-primary leading-tight">
              AI Project
              <br />
              Management System
            </span>
          </Link>
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenuClick={() => setMobileNavOpen(true)}
          left={
            <div className="flex items-center gap-3">
              <CommandBarTrigger />
              <span className="hidden truncate text-sm text-text-tertiary lg:inline">
                Vertex Technologies — Live Portfolio
              </span>
            </div>
          }
          right={
            <>
              <BrandFooter variant="compact" />
              <WorkspaceStreamStatus status={dashboardStream.status} />
              <TelemetryDrawerTrigger />
              <ThemeToggle />
              <Dropdown
                trigger={
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                    {initials(user?.full_name)}
                  </span>
                }
                items={[
                  // Admin is a separate top-level surface (not part of NAV_ITEMS above, per this
                  // file's own comment) — this is just a shortcut into it for ADMIN-role users.
                  ...(user?.role === "ADMIN"
                    ? [
                        {
                          label: "Admin panel",
                          icon: <ShieldCheck className="h-4 w-4" />,
                          onSelect: () => router.push("/admin"),
                        },
                      ]
                    : []),
                  // Everyone starts on an auto-established, read-only session (see lib/auth.tsx) —
                  // this stays genuinely reachable so a real, write-capable account is never more
                  // than one click away, it's just not the loud upfront gate it used to be.
                  ...(isDemo
                    ? [
                        {
                          label: "Full account access",
                          icon: <ShieldCheck className="h-4 w-4" />,
                          onSelect: () => router.push("/login"),
                        },
                      ]
                    : []),
                  {
                    label: "End session",
                    icon: <LogOut className="h-4 w-4" />,
                    onSelect: () => {
                      logout();
                      router.replace("/");
                    },
                  },
                ]}
              />
            </>
          }
        />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      <CommandBar />
      <TelemetryDrawer />
    </div>
  );
}
