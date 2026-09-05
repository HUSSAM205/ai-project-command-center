import { type HTMLAttributes } from "react";
import { Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AISource } from "@/lib/types";

export type SemanticTone = "success" | "warning" | "high" | "critical" | "info" | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: SemanticTone;
  dot?: boolean;
}

const toneClasses: Record<SemanticTone, string> = {
  success: "bg-success-bg text-success-fg border-success-border",
  warning: "bg-warning-bg text-warning-fg border-warning-border",
  high: "bg-high-bg text-high-fg border-high-border",
  critical: "bg-critical-bg text-critical-fg border-critical-border",
  info: "bg-info-bg text-info-fg border-info-border",
  neutral: "bg-subtle text-text-secondary border-border-default",
};

const dotClasses: Record<SemanticTone, string> = {
  success: "bg-success-solid",
  warning: "bg-warning-solid",
  high: "bg-high-solid",
  critical: "bg-critical-solid",
  info: "bg-info-solid",
  neutral: "bg-text-tertiary",
};

/** Raw CSS-variable solid colors per semantic tone, for contexts that can't use Tailwind classes
 * (e.g. recharts `fill`/`stroke` props). Combine with a `*Tone` helper below to get a consistent
 * color for a given status/severity everywhere it's charted. */
export const SOLID_COLORS: Record<SemanticTone, string> = {
  success: "var(--success-solid)",
  warning: "var(--warning-solid)",
  high: "var(--high-solid)",
  critical: "var(--critical-solid)",
  info: "var(--info-solid)",
  neutral: "var(--neutral-400)",
};

export function Badge({ tone = "neutral", dot, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium leading-4 whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[tone])} aria-hidden="true" />}
      {children}
    </span>
  );
}

// Semantic mapping helpers so every page uses the same tone logic (spec: consistent semantic color use)
export function riskLevelTone(level: string): SemanticTone {
  switch (level) {
    case "LOW":
      return "success";
    case "MEDIUM":
      return "warning";
    case "HIGH":
      return "high";
    case "CRITICAL":
      return "critical";
    default:
      return "neutral";
  }
}

export function priorityTone(priority: string): SemanticTone {
  switch (priority) {
    case "LOW":
      return "neutral";
    case "MEDIUM":
      return "info";
    case "HIGH":
      return "warning";
    case "CRITICAL":
      return "critical";
    default:
      return "neutral";
  }
}

export function projectStatusTone(status: string): SemanticTone {
  switch (status) {
    case "PLANNING":
      return "neutral";
    case "ACTIVE":
      return "info";
    case "ON_HOLD":
      return "warning";
    case "AT_RISK":
      return "critical";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "neutral";
    default:
      return "neutral";
  }
}

// Canonical RAG status (backend/app/services/rag_status.py) -- the one status vocabulary this
// app renders everywhere a project's overall standing is shown, so "critical" always means the
// same real, computed thing regardless of which page it's on. Strict semantic discipline: this
// tone mapping is the ONLY place red (critical) is used for a project's status.
export function ragStatusTone(status: string): SemanticTone {
  switch (status) {
    case "ON_TRACK":
      return "success";
    case "AT_RISK":
      return "warning";
    case "CRITICAL":
      return "critical";
    case "COMPLETED":
      return "info";
    default:
      return "neutral";
  }
}

export function taskStatusTone(status: string): SemanticTone {
  switch (status) {
    case "TODO":
      return "neutral";
    case "IN_PROGRESS":
      return "info";
    case "BLOCKED":
      return "critical";
    case "REVIEW":
      return "warning";
    case "DONE":
      return "success";
    default:
      return "neutral";
  }
}

// AI response provenance (mirrors backend AIResponse.source — app/schemas/ai.py). Every
// AI-touching surface must render this so the UI never implies a live model ran when Demo
// AI mode actually produced the answer (no API keys configured is the default/common case).
const AI_SOURCE_LABEL: Record<AISource, string> = {
  demo_ai: "Demo AI",
  cache: "AI (cached)",
  gemini: "Gemini",
  groq: "Groq",
};

export function aiSourceTone(source: AISource): SemanticTone {
  return source === "demo_ai" ? "neutral" : "info";
}

/** Small badge labeling where an AI-touching response actually came from. Always shown
 * alongside AI-generated content (document extraction, document Q&A, etc.) so Demo AI mode
 * is never mistaken for a live model response. */
export function AISourceBadge({ source, className }: { source: AISource; className?: string }) {
  return (
    <Badge tone={aiSourceTone(source)} className={className}>
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {AI_SOURCE_LABEL[source]}
    </Badge>
  );
}

/** Visually related to `AISourceBadge` (same pill shape, same corner of the card) but
 * deliberately a different icon/label/tone — this labels a locally-computed, non-AI fallback
 * (see lib/localExecutiveBrief.ts), and must never be confused with a real `AISource` value like
 * `demo_ai`/`gemini`/`groq`/`cache`. Zap (not Sparkles) is the visual tell it's not an AI response. */
export function QuickSummaryBadge({ className }: { className?: string }) {
  return (
    <Badge tone="neutral" className={className}>
      <Zap className="h-3 w-3" aria-hidden="true" />
      Quick summary
    </Badge>
  );
}

export function documentStatusTone(status: string): SemanticTone {
  switch (status) {
    case "PENDING":
      return "neutral";
    case "PROCESSING":
      return "info";
    case "READY":
      return "success";
    case "FAILED":
      return "critical";
    default:
      return "neutral";
  }
}

export function utilizationTone(state: string): SemanticTone {
  switch (state) {
    case "UNDERUTILIZED":
      return "info";
    case "OPTIMAL":
      return "success";
    case "OVERLOADED":
      return "critical";
    default:
      return "neutral";
  }
}
