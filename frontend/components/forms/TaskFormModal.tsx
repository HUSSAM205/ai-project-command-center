"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { makePreviewId, simulateLatency } from "@/lib/demoSandbox";
import type { Priority, Project, Resource, Task, TaskStatus } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DateInput } from "@/components/ui/DateInput";
import { Button } from "@/components/ui/Button";

const STATUS_OPTIONS: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "DONE"];
const PRIORITY_OPTIONS: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Create-task form. `projectId` fixed (project detail page) hides the project picker; omitting it
 * (global Tasks page) shows one fed by `projects`. Posts to the real POST /projects/{id}/tasks
 * endpoint (already existed in lib/api.ts, unused by any page until now) — no client-side fake state.
 *
 * In a demo (anonymous, read-only) session, submitting never calls that real endpoint — it would
 * just 403. Instead it builds a locally-scoped task with a `preview-` id (lib/demoSandbox.ts) so
 * the sandbox stays fully interactive without ever writing to the shared seeded portfolio.
 * `onCreated`'s second argument tells the caller which happened, for honest toast copy.
 *
 * Callers must remount this on open (e.g. `key={open ? "open" : "closed"}`) rather than relying on
 * an effect to reset fields — form state below is deliberately initialized once, from props, at
 * mount time.
 */
export function TaskFormModal({
  open,
  onClose,
  projectId,
  projects,
  resources,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  projects?: Project[];
  resources?: Resource[];
  onCreated: (task: Task, simulated: boolean) => void;
}) {
  const { isDemo } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TaskStatus>("TODO");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveProjectId = projectId ?? selectedProjectId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveProjectId) {
      setError("Choose a project.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const assignee = (resources ?? []).find((r) => r.id === assigneeId);
      const payload = {
        title: title.trim(),
        status,
        priority,
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
        estimated_hours: estimatedHours ? Number(estimatedHours) : null,
      };
      if (isDemo) {
        await simulateLatency();
        const now = new Date().toISOString();
        const task: Task = {
          id: makePreviewId(),
          project_id: effectiveProjectId,
          title: payload.title,
          description: null,
          assignee_id: payload.assignee_id,
          assignee_name: assignee?.name ?? null,
          status: payload.status,
          priority: payload.priority,
          estimated_hours: payload.estimated_hours,
          actual_hours: null,
          start_date: null,
          due_date: payload.due_date,
          completion_percentage: status === "DONE" ? 100 : 0,
          required_skills: null,
          created_at: now,
          updated_at: now,
        };
        onCreated(task, true);
      } else {
        const task = await api.createTask(effectiveProjectId, payload);
        onCreated(task, false);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the task. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      description="Adds a real task to the project's execution plan."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" loading={submitting}>
            Create task
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
        {!projectId && (
          <Select
            label="Project"
            required
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            options={(projects ?? []).map((p) => ({ label: p.name, value: p.id }))}
            placeholder="Select a project"
          />
        )}
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Draft data migration runbook" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} options={STATUS_OPTIONS.map((s) => ({ label: titleCase(s), value: s }))} />
          <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} options={PRIORITY_OPTIONS.map((s) => ({ label: titleCase(s), value: s }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            options={(resources ?? []).map((r) => ({ label: r.name, value: r.id }))}
            placeholder="Unassigned"
          />
          <DateInput label="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <Input
          label="Estimated hours"
          type="number"
          min="0"
          step="1"
          value={estimatedHours}
          onChange={(e) => setEstimatedHours(e.target.value)}
          placeholder="Optional"
        />
        {error && <p className="text-xs text-critical-fg">{error}</p>}
      </form>
    </Modal>
  );
}
