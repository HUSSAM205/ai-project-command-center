"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import {
  ArrowRight,
  ShieldCheck,
  GitBranch,
  Wallet,
  Users,
  Activity,
  Lock,
  Database,
  Layers,
} from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LogoMark } from "@/components/ui/LogoMark";
import { NetworkHero } from "@/components/ui/NetworkHero";
import { Badge, riskLevelTone, projectStatusTone, SOLID_COLORS } from "@/components/ui/Badge";
import { HealthGauge } from "@/components/ui/StatusIndicator";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { Gantt } from "@/components/viz/Gantt";
import { RiskMatrix } from "@/components/viz/RiskMatrix";
import { sampleKpis, sampleMilestones, sampleProjects, sampleRisks, sampleStatusCounts, sampleTasks } from "@/lib/sampleData";
import { titleCase } from "@/lib/utils";
import { cardHover, fadeSlideUp, staggerContainer, staggerItem } from "@/lib/motion";

/** Fades a section in as it scrolls into view. `once: true` so it doesn't re-trigger on scroll-back. */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeSlideUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className={className}>
      {children}
    </motion.div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <Hero />
      <ProblemSolution />
      <ProductPreview />
      <IntelligenceSections />
      <SecuritySection />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border-default bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={28} />
          <span className="text-sm font-semibold text-text-primary">AI Project Management System</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-text-secondary md:flex">
          <a href="#platform" className="hover:text-text-primary transition-colors">Platform</a>
          <a href="#intelligence" className="hover:text-text-primary transition-colors">Intelligence</a>
          <a href="#security" className="hover:text-text-primary transition-colors">Security</a>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {/* Zero-friction path is the obvious default: one dominant CTA. "Sign in" stays genuinely
              reachable — same href, same click target — just sized and weighted as the secondary,
              not-competing option, rather than a second button of equal visual weight. */}
          <Link href="/login" className="text-sm font-medium text-text-tertiary transition-colors hover:text-text-primary">
            Full account access
          </Link>
          <LinkButton href="/" size="sm">Enter Command Center</LinkButton>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border-default">
      <NetworkHero className="pointer-events-none absolute inset-0 h-full w-full opacity-70 [mask-image:linear-gradient(115deg,black_5%,black_45%,transparent_82%)] dark:opacity-60" />
      {/* Soft vertical fade at the bottom edge so the network texture settles into the border
          rather than cutting off hard. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-canvas to-transparent" />
      <div className="relative mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <Reveal className="max-w-2xl">
          <Badge tone="neutral" className="mb-5">Phase 1 · Deterministic Project Intelligence</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary md:text-5xl">
            AI Project Management System
          </h1>
          <p className="mt-4 text-lg text-text-secondary md:text-xl">
            AI-Powered Project Management &amp; Decision Intelligence Platform
          </p>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-text-tertiary md:text-base">
            One workspace for portfolio health, schedule risk, resource capacity, and budget performance —
            computed transparently from your data, not guessed by a model. Built for teams who need to know
            exactly why a project is at risk, not just that it is.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <LinkButton href="/" size="lg">
              Enter Command Center <ArrowRight className="h-4 w-4" />
            </LinkButton>
            <LinkButton href="#platform" size="lg" variant="outline">
              View Platform
            </LinkButton>
          </div>
          <p className="mt-3 text-xs text-text-tertiary">No account required — browse a seeded organization instantly.</p>
        </Reveal>
      </div>
    </section>
  );
}

function ProblemSolution() {
  return (
    <section className="border-b border-border-default bg-subtle/40">
      <Reveal className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 md:grid-cols-2 md:px-8">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">The problem</h2>
          <p className="mt-3 text-xl font-medium text-text-primary">
            Status reports lag reality. Health is a gut call. Risk lives in a spreadsheet nobody opens.
          </p>
          <p className="mt-3 text-sm text-text-secondary">
            Portfolio leads find out a project is in trouble weeks after the team already knew — because the
            signals (schedule slip, budget burn, blocked dependencies, overloaded resources) never get combined
            into one transparent number.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">The approach</h2>
          <p className="mt-3 text-xl font-medium text-text-primary">
            A single health score, computed the same way every time, with the breakdown shown alongside it.
          </p>
          <p className="mt-3 text-sm text-text-secondary">
            Schedule, budget, task completion, risk exposure, resource load, and dependency blockers each
            contribute a penalty you can see. Cost forecasts use a transparent EVM baseline, labeled as exactly
            that — never dressed up as machine learning.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

function DeviceFrame({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={"flex h-full flex-col overflow-hidden rounded-xl border border-border-default bg-surface shadow-xl " + (className ?? "")}>
      <div className="flex items-center gap-2 border-b border-border-default bg-subtle/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-critical-solid/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning-solid/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-success-solid/60" />
        <span className="ml-3 truncate rounded bg-inset px-2.5 py-0.5 text-[11px] text-text-tertiary">{title}</span>
      </div>
      <div className="flex-1 overflow-auto p-4 md:p-5">{children}</div>
    </div>
  );
}

const statusEntries = Object.entries(sampleStatusCounts) as [keyof typeof sampleStatusCounts, number][];

function ProductPreview() {
  return (
    <section id="platform" className="border-b border-border-default">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-8">
        <Reveal className="mb-10 max-w-2xl">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">The platform</h2>
          <p className="mt-2 text-2xl font-semibold text-text-primary">Real components, real sample data.</p>
          <p className="mt-2 text-sm text-text-secondary">
            This is the actual dashboard, Gantt, risk matrix, and status breakdown rendered on this page — not
            screenshots.
          </p>
        </Reveal>

        {/* Bento grid: one large dashboard/KPI tile, three smaller supporting tiles. */}
        <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
          <DeviceFrame title="app.projectcommandcenter.com/app/dashboard" className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-medium text-text-tertiary">Portfolio Dashboard</span>
              <LiveIndicator status="live" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <MiniKpi label="Total" value={sampleKpis.totalProjects} />
              <MiniKpi label="Active" value={sampleKpis.activeProjects} />
              <MiniKpi label="At Risk" value={sampleKpis.atRiskProjects} tone="critical" />
              <MiniKpi label="Avg Health" value={sampleKpis.avgHealth} />
              <MiniKpi label="Budget Util." value={`${sampleKpis.budgetUtilization}%`} />
              <MiniKpi label="Resource Util." value={`${sampleKpis.resourceUtilization}%`} />
            </div>
            <ul className="mt-5 divide-y divide-border-default border-t border-border-default">
              {sampleProjects.map((p) => (
                <li key={p.name} className="flex items-center gap-4 py-3">
                  <HealthGauge score={p.health} size={40} />
                  <span className="flex-1 truncate text-sm font-medium text-text-primary">{p.name}</span>
                  <Badge tone={projectStatusTone(p.status)}>{titleCase(p.status)}</Badge>
                  <Badge tone={riskLevelTone(p.risk)}>{p.risk}</Badge>
                </li>
              ))}
            </ul>
          </DeviceFrame>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-1">
            <DeviceFrame title="/app/risks">
              <RiskMatrix risks={sampleRisks} />
            </DeviceFrame>
            <DeviceFrame title="/app/dashboard · Status mix">
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusEntries.map(([k, v]) => ({ name: k, value: v }))} dataKey="value" nameKey="name" innerRadius={32} outerRadius={52} paddingAngle={2}>
                      {statusEntries.map(([k]) => (
                        <Cell key={k} fill={SOLID_COLORS[projectStatusTone(k)]} />
                      ))}
                    </Pie>
                    <RTooltip contentStyle={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 12, color: "var(--text-primary)" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-1 space-y-1">
                {statusEntries.map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between text-[11px] text-text-tertiary">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOLID_COLORS[projectStatusTone(k)] }} />
                      {titleCase(k)}
                    </span>
                    <span className="font-tabular font-medium text-text-secondary">{v}</span>
                  </li>
                ))}
              </ul>
            </DeviceFrame>
          </div>

          <DeviceFrame title="app.projectcommandcenter.com/app/projects/p1 · Timeline" className="lg:col-span-3">
            <div className="overflow-hidden rounded-md border border-border-default">
              <Gantt tasks={sampleTasks} milestones={sampleMilestones} />
            </div>
          </DeviceFrame>
        </Reveal>
      </div>
    </section>
  );
}

function MiniKpi({ label, value, tone }: { label: string; value: string | number; tone?: "critical" }) {
  return (
    <div className="rounded-md border border-border-default bg-subtle/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className={"mt-1 font-tabular text-lg font-semibold " + (tone === "critical" ? "text-critical-fg" : "text-text-primary")}>{value}</p>
    </div>
  );
}

function IntelligenceSections() {
  const items = [
    {
      icon: <Activity className="h-5 w-5" />,
      title: "Project Intelligence",
      description: "A composite health score with a visible penalty breakdown — schedule, budget, tasks, risk, resources, dependencies — so you know exactly why a project is flagged.",
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: "Risk Intelligence",
      description: "A 5×5 probability-by-impact matrix plots every open risk by severity, backed by a full register with owners, mitigation notes, and status tracking.",
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Resource Intelligence",
      description: "Utilization state per resource, plus an explainable assignment ranking — skill match, availability, and cost — with the reasoning shown, not hidden.",
    },
    {
      icon: <Wallet className="h-5 w-5" />,
      title: "Financial Intelligence",
      description: "Budget vs. actual by project, burn rate, and an EVM-based baseline forecast, always labeled as a baseline estimate — never presented as predictive AI.",
    },
  ];

  return (
    <section id="intelligence" className="border-b border-border-default bg-subtle/40">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-8">
        <Reveal className="mb-10 max-w-2xl">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">Four intelligence layers</h2>
          <p className="mt-2 text-2xl font-semibold text-text-primary">Everything a portfolio lead checks, in one place.</p>
        </Reveal>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {items.map((item) => (
            <motion.div
              key={item.title}
              variants={staggerItem}
              whileHover={cardHover}
              className="rounded-lg border border-border-default bg-surface p-5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                {item.icon}
              </div>
              <h3 className="mt-4 text-sm font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-1.5 text-sm text-text-tertiary">{item.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function SecuritySection() {
  const points = [
    { icon: <Lock className="h-4 w-4" />, title: "Tenant isolation by default", description: "Every domain table is scoped by organization_id; cross-tenant reads are treated as a bug from day one." },
    { icon: <Database className="h-4 w-4" />, title: "Deterministic core services", description: "Health score, cost forecast, and resource ranking are computed formulas — no model calls, no non-determinism." },
    { icon: <GitBranch className="h-4 w-4" />, title: "Public live view", description: "Anonymous sessions are bound to a seeded organization; every write endpoint rejects unauthenticated write attempts." },
    { icon: <Layers className="h-4 w-4" />, title: "Clean layer separation", description: "FastAPI backend, Postgres storage, and a stateless Next.js frontend — no AI provider keys ever reach the browser." },
  ];

  return (
    <section id="security" className="border-b border-border-default">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-8">
        <Reveal className="mb-10 max-w-2xl">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">Architecture &amp; security</h2>
          <p className="mt-2 text-2xl font-semibold text-text-primary">Built like infrastructure, not a demo.</p>
        </Reveal>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {points.map((p) => (
            <motion.div
              key={p.title}
              variants={staggerItem}
              whileHover={cardHover}
              className="rounded-lg border border-border-default bg-surface p-5"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-subtle text-text-secondary">{p.icon}</div>
              <h3 className="mt-3 text-sm font-semibold text-text-primary">{p.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-text-tertiary">{p.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-brand-900">
      <Reveal className="mx-auto max-w-6xl px-4 py-16 text-center md:px-8">
        <p className="text-2xl font-semibold text-white">See it running on real seeded data.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-brand-100">
          Vertex Technologies — five projects, thirty-plus tasks, a full risk register, and a live budget picture.
        </p>
        <div className="mt-6">
          <LinkButton href="/" size="lg" className="bg-white text-brand-900 hover:bg-brand-50">
            Enter Command Center <ArrowRight className="h-4 w-4" />
          </LinkButton>
        </div>
      </Reveal>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="px-4 py-10 text-center text-xs text-text-tertiary md:px-8">
      <p>AI Project Management System — Phase 1</p>
    </footer>
  );
}
