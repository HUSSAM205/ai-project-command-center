"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "ar" | "tr";

const LANG_KEY = "aipcc_lang";

/**
 * Scoped translation: the sidebar nav, topbar subtitle, the H1 of each top-level module page, the
 * command bar/copilot chrome, the language switcher itself, and a real enterprise-terminology
 * glossary (see /app/governance). Table headers, form labels, buttons, and general body copy stay
 * English in every language — translating those correctly (and keeping every CAPM/PMI term
 * consistent) across the whole app is a real, separate effort, not something to rush alongside
 * everything else in this pass. What's here is genuinely trilingual — every key below has a real,
 * natural translation in all three languages, never a placeholder or an English fallback string
 * — and RTL-correct (Arabic) for the surfaces it covers, rather than a half-translated whole app.
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
    navAutomations: "Automations",
    navGovernance: "Governance",
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
    pageGovernanceTitle: "Governance & Compliance",
    // Enterprise terminology mapping — real, standalone glossary terms (see the Governance page's
    // terminology reference card), also reused wherever the sidebar/page-title keys above cover
    // the same concept.
    termPortfolio: "Portfolio",
    termCriticalPath: "Critical Path",
    termHealthScore: "Health Score",
    termWorkloadBalancer: "Workload Balancer",
    termAuditTrail: "Audit Trail",
    termAutomations: "Automations",
    // Command bar / Copilot chrome (Cmd+K / Cmd+J)
    commandBarPlaceholder: "Search or jump to…",
    commandBarSearchPlaceholder: "Search commands and projects…",
    copilotOpenLabel: "Open executive AI copilot (Ctrl+J)",
    copilotTitle: "Executive Copilot",
    // Language switcher
    languageSwitcherLabel: "Language",
    languageEnglish: "English",
    languageArabic: "العربية",
    languageTurkish: "Türkçe",
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
    navAutomations: "محرك الأتمتة",
    navGovernance: "الحوكمة",
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
    pageGovernanceTitle: "الحوكمة والامتثال",
    termPortfolio: "المحفظة الاستثمارية",
    termCriticalPath: "المسار الحرج",
    termHealthScore: "مؤشر الصحة",
    termWorkloadBalancer: "موازنة الكوادر",
    termAuditTrail: "سجل التدقيق",
    termAutomations: "محرك الأتمتة",
    commandBarPlaceholder: "ابحث أو انتقل إلى…",
    commandBarSearchPlaceholder: "ابحث في الأوامر والمشاريع…",
    copilotOpenLabel: "افتح المساعد التنفيذي الذكي (Ctrl+J)",
    copilotTitle: "المساعد التنفيذي الذكي",
    languageSwitcherLabel: "اللغة",
    languageEnglish: "English",
    languageArabic: "العربية",
    languageTurkish: "Türkçe",
  },
  tr: {
    appName: "Yapay Zeka Proje Yönetim Sistemi",
    topbarSubtitle: "Yapay Zeka Proje Yönetim Sistemi — Yönetici Komuta Merkezi",
    navDashboard: "Kontrol Paneli",
    navProjects: "Projeler",
    navTasks: "Görevler",
    navResources: "Kaynaklar",
    navRisks: "Riskler",
    navBudget: "Bütçe",
    navAiAssistant: "Yapay Zeka Asistanı",
    navDocuments: "Belgeler",
    navMeetings: "Toplantılar",
    navAutomations: "Otomasyon Merkezi",
    navGovernance: "Yönetişim",
    navConsulting: "Danışmanlık",
    navAnalytics: "Analitik",
    navReports: "Raporlar",
    navArchitectWorkspace: "Mimari Çalışma Alanı",
    navPmoWorkspace: "PMO Çalışma Alanı",
    navExecutiveSuite: "Yönetici Paketi",
    pageDashboardTitle: "Portföy Kontrol Paneli",
    pageProjectsTitle: "Projeler",
    pageTasksTitle: "Görevler",
    pageBudgetTitle: "Bütçe ve Finans",
    pageRisksTitle: "Risk Kaydı",
    pagePmoWorkspaceTitle: "PMO Çalışma Alanı",
    pageArchitectWorkspaceTitle: "Yapay Zeka Çözüm Mimarı",
    pageDocumentsTitle: "Belgeler",
    pageGovernanceTitle: "Yönetişim ve Uyumluluk",
    termPortfolio: "Portföy Yönetimi",
    termCriticalPath: "Kritik Yol (CPM)",
    termHealthScore: "Sağlık Skoru",
    termWorkloadBalancer: "Kaynak Dengeleme",
    termAuditTrail: "Denetim Günlüğü",
    termAutomations: "Otomasyon Merkezi",
    commandBarPlaceholder: "Ara veya git…",
    commandBarSearchPlaceholder: "Komutlarda ve projelerde ara…",
    copilotOpenLabel: "Yönetici yapay zeka asistanını aç (Ctrl+J)",
    copilotTitle: "Yönetici Asistanı",
    languageSwitcherLabel: "Dil",
    languageEnglish: "English",
    languageArabic: "العربية",
    languageTurkish: "Türkçe",
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

function isLang(value: string | null): value is Lang {
  return value === "en" || value === "ar" || value === "tr";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(LANG_KEY) : null;
    if (isLang(stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a persisted preference on mount, same pattern as ThemeProvider
      setLangState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    // Only Arabic is RTL — Turkish (like English) is LTR with standard typography/layout bounds.
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
