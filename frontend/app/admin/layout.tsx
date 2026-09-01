"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Building2,
  Cpu,
  ScrollText,
  MessageSquare,
  LogOut,
  ArrowLeft,
} from "lucide-react";
import { Sidebar, type NavItem } from "@/components/ui/Sidebar";
import { Topbar } from "@/components/ui/Topbar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Spinner } from "@/components/ui/LoadingState";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/utils";

// Admin is a deliberately separate top-level surface from /app/* (see frontend/app/app/layout.tsx's
// NAV_ITEMS comment) — its own nav registry, not an addition to the main app sidebar.
const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/admin", icon: <LayoutDashboard /> },
  { label: "Users", href: "/admin/users", icon: <Users /> },
  { label: "Organization", href: "/admin/organizations", icon: <Building2 /> },
  { label: "AI Providers", href: "/admin/ai", icon: <Cpu /> },
  { label: "Audit Log", href: "/admin/audit", icon: <ScrollText /> },
  { label: "Feedback", href: "/admin/feedback", icon: <MessageSquare /> },
];

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!isAdmin) {
      // Non-admin (including anonymous demo/VIEWER sessions) — bounce back to the main app,
      // mirroring the existing /app/* -> /login redirect pattern.
      router.replace("/app/dashboard");
    }
  }, [isLoading, isAuthenticated, isAdmin, router]);

  if (isLoading || !isAuthenticated || !isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar
        navItems={ADMIN_NAV_ITEMS}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        header={
          <Link href="/admin" className="flex items-center gap-2 border-b border-border-default px-4 py-3.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-critical-solid text-xs font-bold text-white">
              AD
            </span>
            <span className="text-sm font-semibold text-text-primary leading-tight">
              Admin
              <br />
              Panel
            </span>
          </Link>
        }
        footer={
          <div className="border-t border-border-default p-3">
            <Link
              href="/app/dashboard"
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-subtle hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to app
            </Link>
          </div>
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenuClick={() => setMobileNavOpen(true)}
          left={
            <div className="flex items-center gap-3">
              <Badge tone="critical">Admin</Badge>
              <span className="hidden truncate text-sm text-text-tertiary lg:inline">
                Organization-scoped — never cross-tenant
              </span>
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
    </div>
  );
}
