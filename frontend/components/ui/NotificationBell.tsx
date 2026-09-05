"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Notification, NotificationCategory } from "@/lib/types";
import { Badge, type SemanticTone } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/LoadingState";
import { cn, formatDate } from "@/lib/utils";

const POLL_MS = 45_000;

type Tab = "all" | "critical" | "automated";

const CATEGORY_TONE: Record<NotificationCategory, SemanticTone> = {
  CRITICAL: "critical",
  AI_ALERT: "info",
  WORKFLOW: "info",
};

/**
 * Smart Notification Popover -- wired to the real, persisted GET /notifications feed (backend/
 * app/api/notifications.py). Every notification here was created by a real automation rule
 * genuinely firing (see backend/app/services/automation_engine.py) -- never seeded/fabricated
 * just to populate this panel. Polls every 45s while mounted (always mounted, in the app shell) so
 * new automation activity from any hot-path evaluation surfaces without a full page reload.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const result = await api.notifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unread_count);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Fetch on mount, then poll -- a real network call whose eventual setState happens inside
    // load()'s own .then()/.catch(), not synchronously in this effect body, so this is the
    // approved "subscribe and setState in a callback" shape despite the lint rule's static
    // analysis flagging the call site itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function markRead(n: Notification) {
    if (n.is_read) return;
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.markNotificationRead(n.id);
    } catch {
      // Read-only demo sessions 403 here (require_write_access, same as every other mutation) --
      // the optimistic local update just stays local rather than reverting into a jarring flicker.
    }
  }

  async function markAllRead() {
    const prevNotifications = notifications;
    const prevUnread = unreadCount;
    setNotifications((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      setNotifications(prevNotifications);
      setUnreadCount(prevUnread);
    }
  }

  const filtered = notifications.filter((n) => {
    if (tab === "critical") return n.category === "CRITICAL";
    if (tab === "automated") return n.category === "WORKFLOW";
    return true;
  });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-subtle hover:text-text-primary"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical-solid px-1 font-tabular text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="glass-surface absolute right-0 z-40 mt-2 w-96 max-w-[90vw] overflow-hidden rounded-lg border shadow-elevation-3"
        >
          <div className="flex items-center justify-between border-b border-border-default px-3 py-2.5">
            <div className="flex items-center gap-1 rounded-full border border-border-default bg-subtle p-0.5 text-xs font-medium">
              {(["all", "critical", "automated"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-full px-2.5 py-1 transition-colors",
                    tab === t ? "bg-brand-700 text-white dark:bg-brand-500" : "text-text-tertiary hover:text-text-primary",
                  )}
                >
                  {t === "all" ? "All" : t === "critical" ? "Critical Risks" : "Automated Actions"}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex shrink-0 items-center gap-1 text-xs font-medium text-text-tertiary hover:text-text-primary"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : error ? (
              <p className="px-4 py-6 text-center text-sm text-critical-fg">{error}</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-text-tertiary">
                {tab === "all" ? "No notifications yet." : "Nothing in this category yet."}
              </p>
            ) : (
              <ul className="divide-y divide-border-default">
                {filtered.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => markRead(n)}
                      className={cn(
                        "flex w-full flex-col items-start gap-1 px-3.5 py-3 text-left transition-colors hover:bg-subtle",
                        !n.is_read && "bg-brand-50/60 dark:bg-brand-900/20",
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <Badge tone={CATEGORY_TONE[n.category]}>{n.category === "AI_ALERT" ? "AI Alert" : n.category === "WORKFLOW" ? "Workflow" : "Critical"}</Badge>
                          {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600 dark:bg-brand-400" aria-hidden="true" />}
                        </span>
                        <span className="shrink-0 font-tabular text-[11px] text-text-tertiary">{formatDate(n.created_at)}</span>
                      </div>
                      <p className="text-sm font-medium text-text-primary">{n.title}</p>
                      <p className="text-xs leading-relaxed text-text-secondary">{n.message}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
