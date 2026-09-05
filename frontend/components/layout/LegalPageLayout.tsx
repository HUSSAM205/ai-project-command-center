import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/LogoMark";

const LEGAL_LINKS = [
  { href: "/security", label: "Security" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/governance", label: "Governance" },
];

/** Shared chrome for the four trust/legal pages (security, privacy, terms, governance) — a plain,
 * dense reading layout rather than the animated marketing layout in app/platform/page.tsx, since
 * these pages exist to be read carefully, not to sell. */
export function LegalPageLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border-default bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 md:px-8">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="text-sm font-semibold text-text-primary">AI Project Command Center</span>
          </Link>
          <nav className="flex items-center gap-4 text-xs text-text-tertiary">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="transition-colors hover:text-text-primary">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-14 md:px-8">
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="mt-1 text-xs text-text-tertiary">Last updated {updated}</p>
        <div className="prose-legal mt-10 space-y-8 text-sm leading-relaxed text-text-secondary">{children}</div>
      </main>
      <footer className="border-t border-border-default px-4 py-8 text-center text-xs text-text-tertiary md:px-8">
        <p>AI Project Command Center</p>
      </footer>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">{heading}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
