"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

const LANG_KEY = "aipcc_lang";

/**
 * Scoped translation: the sidebar nav, topbar subtitle, and the H1 of each top-level module page.
 * Table headers, form labels, buttons, and body copy stay English in both languages — translating
 * those correctly (and keeping every CAPM/PMI term consistent) is a real, separate effort, not
 * something to rush alongside everything else in this pass. What's here is genuinely bilingual and
 * RTL-correct for the surfaces it covers, rather than a half-translated whole app.
 */
const translations: Record<Lang, Record<string, string>> = {
  en: {
    appName: "AI Project Management System",
    topbarSubtitle: "AI Project Management System — Executive Command",
    navDashboard: "Dashboard",
    navProjects: "Projects",
    navTasks: "Tasks",
    navResources: "Resources",
    navRisks: "Risks",
    navBudget: "Budget",
    navAiAssistant: "AI Assistant",
    navDocuments: "Documents",
    navMeetings: "Meetings",
    navConsulting: "Consulting",
    navAnalytics: "Analytics",
    navReports: "Reports",
    navArchitectWorkspace: "Architect Workspace",
    navPmoWorkspace: "PMO Workspace",
    navExecutiveSuite: "Executive Suite",
    pageDashboardTitle: "Portfolio Dashboard",
    pageProjectsTitle: "Projects",
    pageTasksTitle: "Tasks",
    pageBudgetTitle: "Budget & Financials",
    pageRisksTitle: "Risk Register",
    pagePmoWorkspaceTitle: "PMO Workspace",
    pageArchitectWorkspaceTitle: "AI Solution Architect",
    pageDocumentsTitle: "Documents",
  },
  ar: {
    appName: "نظام إدارة المشاريع بالذكاء الاصطناعي",
    topbarSubtitle: "نظام إدارة المشاريع بالذكاء الاصطناعي — القيادة التنفيذية",
    navDashboard: "لوحة التحكم",
    navProjects: "المشاريع",
    navTasks: "المهام",
    navResources: "الموارد",
    navRisks: "المخاطر",
    navBudget: "الميزانية",
    navAiAssistant: "المساعد الذكي",
    navDocuments: "المستندات",
    navMeetings: "الاجتماعات",
    navConsulting: "الاستشارات",
    navAnalytics: "التحليلات",
    navReports: "التقارير",
    navArchitectWorkspace: "استوديو المعمارية",
    navPmoWorkspace: "مكتب إدارة المشاريع",
    navExecutiveSuite: "الجناح التنفيذي",
    pageDashboardTitle: "لوحة التحكم التنفيذية",
    pageProjectsTitle: "المشاريع",
    pageTasksTitle: "المهام",
    pageBudgetTitle: "الميزانية والشؤون المالية",
    pageRisksTitle: "مصفوفة المخاطر",
    pagePmoWorkspaceTitle: "القيمة المكتسبة",
    pageArchitectWorkspaceTitle: "استوديو المعمارية",
    pageDocumentsTitle: "ذكاء المستندات",
  },
};

export type TranslationKey = keyof (typeof translations)["en"];

interface LanguageContextValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(LANG_KEY) : null;
    if (stored === "ar" || stored === "en") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a persisted preference on mount, same pattern as ThemeProvider
      setLangState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "ar" ? "ar" : "en";
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(LANG_KEY, next);
  }, []);

  const t = useCallback((key: TranslationKey) => translations[lang][key] ?? translations.en[key] ?? key, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, dir: lang === "ar" ? "rtl" : "ltr", setLang, t }),
    [lang, setLang, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
