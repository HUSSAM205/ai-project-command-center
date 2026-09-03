"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Project, Risk, RiskCategory, RiskStatus } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

const CATEGORY_OPTIONS: RiskCategory[] = ["SCHEDULE", "BUDGET", "RESOURCE", "TECHNICAL", "SECURITY", "OPERATIONAL", "DEPENDENCY", "EXTERNAL"];
const STATUS_OPTIONS: RiskStatus[] = ["OPEN", "MITIGATING", "CLOSED"];
const SCALE_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: String(n) }));

/**
 * Create/edit risk form — same modal for both. Passing `risk` switches it to edit mode (PATCH
 * /risks/{id}); omitting it creates one (POST /projects/{id}/risks). `severity` and `score` are
 * never inputs here — the backend derives them from probability x impact, same as everywhere
 * else in the app that reads a Risk.
 *
 * Callers must remount this on open/target-change (e.g. `key={\`${open}-${risk?.id ?? "new"}\`}`)
 * rather than relying on an effect to reset fields — state below is initialized once, from props,
 * at mount time.
 */
export function RiskFormModal({
  open,
  onClose,
  projectId,
  projects,
  risk,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  projects?: Project[];
  risk?: Risk | null;
  onSaved: (risk: Risk) => void;
}) {
  const isEdit = !!risk;
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? risk?.project_id ?? "");
  const [title, setTitle] = useState(risk?.title ?? "");
  const [category, setCategory] = useState<RiskCategory>(risk?.category ?? "OPERATIONAL");
  const [probability, setProbability] = useState(String(risk?.probability ?? 3));
  const [impact, setImpact] = useState(String(risk?.impact ?? 3));
  const [owner, setOwner] = useState(risk?.owner ?? "");
  const [mitigation, setMitigation] = useState(risk?.mitigation ?? "");
  const [status, setStatus] = useState<RiskStatus>(risk?.status ?? "OPEN");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveProjectId = projectId ?? risk?.project_id ?? selectedProjectId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEdit && !effectiveProjectId) {
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
      const payload = {
        title: title.trim(),
        category,
        probability: Number(probability),
        impact: Number(impact),
        owner: owner.trim() || null,
        mitigation: mitigation.trim() || null,
        status,
      };
      const saved = isEdit ? await api.updateRisk(risk!.id, payload) : await api.createRisk(effectiveProjectId, payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${isEdit ? "update" : "create"} the risk. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit risk" : "Add risk"}
      description={isEdit ? "Updates the real risk register entry — the matrix re-plots it immediately." : "Adds a real entry to the project's risk register."}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="risk-form" loading={submitting}>
            {isEdit ? "Save changes" : "Add risk"}
          </Button>
        </>
      }
    >
      <form id="risk-form" onSubmit={handleSubmit} className="space-y-4">
        {!projectId && !isEdit && (
          <Select
            label="Project"
            required
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            options={(projects ?? []).map((p) => ({ label: p.name, value: p.id }))}
            placeholder="Select a project"
          />
        )}
        <Input label="Risk" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Key vendor contract renewal slips past Q3" />
        <div className="grid grid-cols-3 gap-3">
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as RiskCategory)}
            options={CATEGORY_OPTIONS.map((c) => ({ label: titleCase(c), value: c }))}
          />
          <Select label="Probability (1-5)" value={probability} onChange={(e) => setProbability(e.target.value)} options={SCALE_OPTIONS} />
          <Select label="Impact (1-5)" value={impact} onChange={(e) => setImpact(e.target.value)} options={SCALE_OPTIONS} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Optional" />
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as RiskStatus)} options={STATUS_OPTIONS.map((s) => ({ label: titleCase(s), value: s }))} />
        </div>
        <Textarea label="Mitigation" value={mitigation} onChange={(e) => setMitigation(e.target.value)} placeholder="Optional — how this risk is being contained" />
        {error && <p className="text-xs text-critical-fg">{error}</p>}
      </form>
    </Modal>
  );
}
