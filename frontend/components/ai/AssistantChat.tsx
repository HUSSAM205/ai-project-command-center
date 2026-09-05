"use client";

import { useCallback, useState } from "react";
import { Mic, MicOff, Send, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useVoiceInput } from "@/lib/useVoiceInput";
import type { AIResponse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/ErrorState";
import { AISourceBadge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/LoadingState";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const EXAMPLE_QUESTIONS = [
  "Why is this project at risk?",
  "What are the biggest risks?",
  "Who is overloaded?",
  "Which task is blocking delivery?",
  "What should the PM do next?",
  "Summarize this project.",
];

interface Exchange {
  question: string;
  answer: AIResponse;
}

/** Shared Q&A logic and rendering for both surfaces that ground a conversation in real project
 * data via the same real POST /api/v1/ai/assistant endpoint (app/api/ai.py) -- the full
 * /app/ai-assistant page and the global floating Copilot drawer (components/ai/CopilotLauncher.tsx).
 * One implementation so the two surfaces can never drift into answering differently for the same
 * question. `compact` trims the padding/heading for the drawer's narrower panel. */
export function AssistantChat({ compact = false, initialProjectId }: { compact?: boolean; initialProjectId?: string }) {
  const projects = useApi(() => api.projects(), []);
  const [projectId, setProjectId] = useState<string>(initialProjectId ?? "");
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTranscript = useCallback((text: string) => setQuestion(text), []);
  const voice = useVoiceInput(handleTranscript);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    if (voice.listening) voice.stop();
    setLoading(true);
    setError(null);
    try {
      const answer = await api.askAssistant(text, projectId || undefined);
      setHistory((h) => [...h, { question: text, answer }]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The assistant couldn't answer that.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex h-full flex-col gap-4", compact && "gap-3")}>
      {!compact && (
        <div>
          <h1 className="text-xl font-semibold text-text-primary">AI Assistant</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Ask about real project, task, risk, resource, and budget data. Every answer is labeled with its real
            source — Demo AI mode answers from your actual seeded data with no live model involved.
          </p>
        </div>
      )}

      <Select
        label={compact ? undefined : "Scope"}
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        options={(projects.data ?? []).map((p) => ({ label: p.name, value: p.id }))}
        placeholder="Portfolio-wide (all projects)"
      />

      {history.length === 0 && !loading && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.slice(0, compact ? 3 : EXAMPLE_QUESTIONS.length).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              className="rounded-full border border-border-default bg-surface px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto">
        {history.map((exchange, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-brand-700 px-3.5 py-2 text-sm text-white">
              {exchange.question}
            </div>
            <Card className="max-w-[85%]">
              <CardContent className="space-y-2 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex items-start gap-2 text-sm leading-relaxed text-text-primary">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                    <span>{exchange.answer.summary}</span>
                  </p>
                  <AISourceBadge source={exchange.answer.source} className="shrink-0" />
                </div>
                {exchange.answer.detail && exchange.answer.detail !== exchange.answer.summary && (
                  <p className="whitespace-pre-line pl-6 text-xs text-text-tertiary">{exchange.answer.detail}</p>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <Spinner className="h-4 w-4" /> Thinking…
          </div>
        )}
        {error && <ErrorState description={error} onRetry={() => ask(history.at(-1)?.question ?? question)} />}
      </div>

      {voice.permissionDenied && (
        <p className="text-xs text-warning-fg">
          Microphone access was denied — allow it in your browser&apos;s site settings to use voice input, or just type.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className={cn("flex items-end gap-2 border-t border-border-default pt-3", !compact && "sticky bottom-0 bg-canvas pt-4")}
      >
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(question);
            }
          }}
          placeholder="Ask about a project, risk, resource, or budget…"
          className="min-h-[44px]"
          disabled={loading}
        />
        {voice.supported && (
          <Button
            type="button"
            variant={voice.listening ? "secondary" : "outline"}
            size="icon"
            aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
            title={voice.listening ? "Stop voice input" : "Ask by voice"}
            onClick={() => (voice.listening ? voice.stop() : voice.start(question))}
            className={cn(voice.listening && "relative")}
          >
            {voice.listening ? (
              <>
                <span className="absolute inset-0 -m-1 animate-ping rounded-full bg-critical-solid/40" aria-hidden="true" />
                <Mic className="h-4 w-4 text-critical-fg" />
              </>
            ) : (
              <MicOff className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button type="submit" disabled={loading || !question.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
