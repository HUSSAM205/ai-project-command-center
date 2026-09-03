"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Priority, Project, ProjectStatus } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DateInput } from "@/components/ui/DateInput";
import { Button } from "@/components/ui/Button";

const STATUS_OPTIONS: ProjectStatus[] = ["PLANNING", "ACTIVE", "ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED"];
const PRIORITY_OPTIONS: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Create-project form, posting to the real POST /projects endpoint (already in lib/api.ts,
 * unused by any page — the Projects page button was a disabled stub). No manager picker: the
 * backend's manager_id references the org's user accounts, and the only endpoint that lists
 * those is admin-gated — adding a real one is a separate, larger change than this form.
 * Remount on open via `key` (see TaskFormModal.tsx for why) rather than an effect-based reset.
 */
export function ProjectFormModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("PLANNING");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError("Target end date can't be before the start date.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const project = await api.createProject({
        name: name.trim(),
        client: client.trim() || null,
        status,
        priority,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        budget: budget ? Number(budget) : 0,
      });
      onCreated(project);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the project. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      description="Adds a real initiative to the portfolio — health score and EVM forecast start computing immediately."
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={submitting}>
            Create project
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Project name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claims Intake Automation" />
        <Input label="Client / business domain" value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Northbridge Financial, or leave blank for internal" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} options={STATUS_OPTIONS.map((s) => ({ label: titleCase(s), value: s }))} />
          <Select label="Strategic priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} options={PRIORITY_OPTIONS.map((s) => ({ label: titleCase(s), value: s }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DateInput label="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <DateInput label="Target end date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Input
          label="Total budget (planned value)"
          type="number"
          min="0"
          step="1000"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="0"
        />
        {error && <p className="text-xs text-critical-fg">{error}</p>}
      </form>
    </Modal>
  );
}
