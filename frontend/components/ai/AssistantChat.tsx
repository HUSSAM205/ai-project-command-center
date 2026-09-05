"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { FileText, Mic, MicOff, Paperclip, Send, Sparkles, X } from "lucide-react";
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
  attachedFilename?: string;
}

// Matches backend/app/services/chat_attachment.py's ALLOWED_CHAT_EXTENSIONS exactly. Client-side
// check is just a fast, friendly rejection -- the server re-validates by real content/magic
// bytes regardless (same discipline as the Documents page upload).
const ACCEPTED_CHAT_EXTENSIONS = [".pdf", ".docx", ".txt", ".csv", ".json"];
const MAX_CHAT_ATTACHMENT_BYTES = 5 * 1024 * 1024;

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
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTranscript = useCallback((text: string) => setQuestion(text), []);
  const voice = useVoiceInput(handleTranscript);

  function attachFile(file: File | undefined | null) {
    if (!file) return;
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    if (!ACCEPTED_CHAT_EXTENSIONS.includes(ext)) {
      setAttachError(`.${ext.slice(1)} isn't supported here — attach a PDF, DOCX, TXT, CSV, or JSON file.`);
      return;
    }
    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      setAttachError(`Attachments are limited to ${MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    setAttachError(null);
    setAttachedFile(file);
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    if (voice.listening) voice.stop();
    setLoading(true);
    setError(null);
    const fileToSend = attachedFile ?? undefined;
    try {
      const answer = await api.askAssistant(text, projectId || undefined, fileToSend);
      setHistory((h) => [...h, { question: text, answer, attachedFilename: fileToSend?.name }]);
      setQuestion("");
      setAttachedFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The assistant couldn't answer that.");
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragActive(false);
    attachFile(e.dataTransfer.files?.[0]);
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
            <div className="ml-auto max-w-[85%] space-y-1.5 text-right">
              {exchange.attachedFilename && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border-default bg-surface px-2.5 py-1 text-[11px] text-text-tertiary">
                  <FileText className="h-3 w-3" aria-hidden="true" />
                  {exchange.attachedFilename}
                </span>
              )}
              <div className="rounded-lg rounded-tr-sm bg-brand-700 px-3.5 py-2 text-left text-sm text-white">
                {exchange.question}
              </div>
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
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col gap-2 rounded-md border-t border-border-default pt-3",
          !compact && "sticky bottom-0 bg-canvas pt-4",
          dragActive && "border border-dashed border-brand-500 bg-brand-50 dark:bg-brand-950/20",
        )}
      >
        {attachedFile && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border-default bg-surface px-2.5 py-1 text-xs text-text-secondary">
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {attachedFile.name}
            <button
              type="button"
              onClick={() => setAttachedFile(null)}
              aria-label={`Remove ${attachedFile.name}`}
              className="text-text-tertiary hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        {attachError && <p className="text-xs text-critical-fg">{attachError}</p>}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_CHAT_EXTENSIONS.join(",")}
            className="sr-only"
            onChange={(e) => attachFile(e.target.files?.[0])}
            aria-label="Attach a file to this question"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Attach a file"
            title="Attach a PDF, DOCX, TXT, CSV, or JSON file"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
            placeholder="Ask about a project, risk, resource, or budget — or drop a file here…"
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
        </div>
      </form>
    </div>
  );
}
