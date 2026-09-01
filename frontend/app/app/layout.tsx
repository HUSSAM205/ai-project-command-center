"use client";

import { useEffect, useState } from "react";
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
  LogOut,
} from "lucide-react";
import { Sidebar, type NavItem } from "@/components/ui/Sidebar";
import { Topbar } from "@/components/ui/Topbar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Spinner } from "@/components/ui/LoadingState";
import { CommandBar, CommandBarTrigger } from "@/components/ui/CommandBar";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/utils";

// Primary sidebar nav, top to bottom. Append one line per shipped page — do not restructure this
// component or Sidebar.tsx to add an item. Per docs/PROJECT_PLAN.md's "no dead links" rule, only
// add an entry once the page it points to actually exists and works (AI Assistant and Consulting
// are upcoming and must NOT get an entry yet). When you do add a page, also register it in
// lib/commands.ts so it's reachable from the Cmd+K command bar.
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: <LayoutDashboard /> },
  { label: "Projects", href: "/app/projects", icon: <FolderKanban /> },
  { label: "Tasks", href: "/app/tasks", icon: <ListChecks /> },
  { label: "Resources", href: "/app/resources", icon: <Users /> },
  { label: "Risks", href: "/app/risks", icon: <ShieldAlert /> },
  { label: "Budget", href: "/app/budget", icon: <Wallet /> },
  { label: "Documents", href: "/app/documents", icon: <FileText /> },
  { label: "Analytics", href: "/app/analytics", icon: <BarChart3 /> },
  { label: "Reports", href: "/app/reports", icon: <ClipboardList /> },
];

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, isDemo, logout } = useAuth();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar
        navItems={NAV_ITEMS}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        header={
          <Link href="/app/dashboard" className="flex items-center gap-2 border-b border-border-default px-4 py-3.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-700 text-xs font-bold text-white">
              AC
            </span>
            <span className="text-sm font-semibold text-text-primary leading-tight">
              AI Project
              <br />
              Command Center
            </span>
          </Link>
        }
        footer={
          isDemo ? (
            <div className="border-t border-border-default p-3">
              <Badge tone="info" className="w-full justify-center py-1.5">
                Read-only demo session
              </Badge>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenuClick={() => setMobileNavOpen(true)}
          left={
            <div className="flex items-center gap-3">
              <CommandBarTrigger />
              {isDemo && (
                <span className="hidden truncate text-sm text-text-tertiary lg:inline">
                  Viewing the Vertex Technologies demo workspace
                </span>
              )}
            </div>
          }
          right={
            <>
              <ThemeToggle />
              <Dropdown
                trigger={
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                    {initials(user?.full_name)}
                  </span>
                }
                items={[
                  {
                    label: "Sign out",
                    icon: <LogOut className="h-4 w-4" />,
                    onSelect: () => {
                      logout();
                      router.replace("/login");
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
    </div>
  );
}
