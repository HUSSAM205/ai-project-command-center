"use client";

import { useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { AIResponse } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/ErrorState";
import { AISourceBadge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/LoadingState";

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

export default function AiAssistantPage() {
  const projects = useApi(() => api.projects(), []);
  const [projectId, setProjectId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">AI Assistant</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Ask about real project, task, risk, resource, and budget data. Every answer is labeled with its real
          source — Demo AI mode answers from your actual seeded data with no live model involved.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Scope</CardTitle>
            <CardDescription>Ask about one project, or leave blank for the whole portfolio</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Select
            label="Project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={(projects.data ?? []).map((p) => ({ label: p.name, value: p.id }))}
            placeholder="Portfolio-wide (all projects)"
          />
        </CardContent>
      </Card>

      {history.length === 0 && !loading && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((q) => (
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

      <div className="space-y-4">
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="sticky bottom-0 flex items-end gap-2 border-t border-border-default bg-canvas pt-4"
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
        <Button type="submit" disabled={loading || !question.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
