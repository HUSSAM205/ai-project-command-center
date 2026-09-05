"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { useLanguage } from "@/lib/i18n";
import { AssistantChat } from "./AssistantChat";

/** Global floating executive Copilot -- mounted once in app/app/layout.tsx so it's reachable from
 * every /app/* page, not just /app/ai-assistant. Same real POST /api/v1/ai/assistant-backed chat
 * as the full page (AssistantChat.tsx is the one shared implementation), just in a slide-in panel
 * reachable from anywhere via the launcher button or Ctrl/Cmd+J -- mirrors CommandBar.tsx's own
 * Ctrl/Cmd+K global-shortcut pattern. */
export function CopilotLauncher() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {/* bottom-5 end-5 (not right-5): docks to the same physical edge the Drawer itself slides
          in from (Drawer.tsx's end-0), so the FAB and the panel it opens stay visually adjacent
          in both LTR and RTL rather than the button sitting on the opposite side from its panel. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("copilotOpenLabel")}
        title={t("copilotOpenLabel")}
        className="fixed bottom-5 end-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-700 text-white shadow-elevation-3 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] dark:bg-brand-500"
      >
        <Sparkles className="h-5 w-5" />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={t("copilotTitle")} width="md">
        <AssistantChat compact />
      </Drawer>
    </>
  );
}
