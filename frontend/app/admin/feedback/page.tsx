"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

export default function AdminFeedbackPage() {
  const feedback = useApi(() => api.admin.feedback({ page: 1, pageSize: 50 }), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Feedback</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Submitted via POST /api/v1/feedback — open to any authenticated caller, including anonymous demo
          sessions.
        </p>
      </div>

      <SubmitFeedbackCard onSubmitted={feedback.reload} />

      {feedback.loading ? (
        <CardSkeleton />
      ) : feedback.error || !feedback.data ? (
        <ErrorState title="Couldn't load feedback" description={feedback.error?.message} onRetry={feedback.reload} />
      ) : feedback.data.items.length === 0 ? (
        <EmptyState title="No feedback yet" description="Submitted messages will show up here." />
      ) : (
        <ul className="space-y-3">
          {feedback.data.items.map((f) => (
            <li key={f.id} className="rounded-lg border border-border-default bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <Badge tone={f.user_id ? "info" : "neutral"}>{f.user_id ? "Registered user" : "Anonymous / demo"}</Badge>
                <span className="font-tabular text-xs text-text-tertiary">{formatDate(f.created_at)}</span>
              </div>
              <p className="mt-2 text-sm text-text-primary">{f.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubmitFeedbackCard({ onSubmitted }: { onSubmitted: () => void }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      await api.submitFeedback(message.trim());
      setMessage("");
      toast.push("Feedback submitted", "success");
      onSubmitted();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Couldn't submit feedback", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Leave feedback</CardTitle>
          <CardDescription>Test the endpoint as this session&apos;s user (works for demo sessions too)</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="feedback-message" className="mb-1.5 block text-sm font-medium text-text-primary">
              Message
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's working, what isn't…"
              rows={2}
              className="min-h-[40px] w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            />
          </div>
          <Button type="submit" loading={submitting} disabled={!message.trim()}>
            Submit
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
