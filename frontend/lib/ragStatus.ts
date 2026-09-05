import type { ProjectStatus, RagStatus, RiskLevel } from "./types";

/** Mirrors backend/app/services/rag_status.py's compute_rag_status exactly -- same thresholds,
 * same precedence. Used wherever the frontend has to construct a Project object itself instead
 * of receiving one from the API: the sandbox-mode preview create (ProjectFormModal.tsx) and the
 * offline-fallback dataset (offlinePreview.ts). Real API responses always carry a real
 * server-computed rag_status already; this only exists for those two client-only paths. */
export function computeRagStatus(status: ProjectStatus, healthScore: number, riskLevel: RiskLevel): RagStatus {
  if (status === "COMPLETED" || status === "CANCELLED") return "COMPLETED";
  if (status === "AT_RISK" || riskLevel === "CRITICAL" || healthScore < 40) return "CRITICAL";
  if (status === "ON_HOLD" || riskLevel === "HIGH" || healthScore < 65) return "AT_RISK";
  return "ON_TRACK";
}
