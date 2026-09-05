import type { ProjectStatus, RagStatus, RiskLevel } from "./types";

/** Mirrors backend/app/services/rag_status.py's compute_rag_status exactly -- same thresholds,
 * same precedence. Used wherever the frontend has to construct a Project object itself instead
 * of receiving one from the API: only the offline-fallback dataset (offlinePreview.ts) today --
 * ProjectFormModal.tsx used to need this for its sandbox-mode preview create, but project
 * creation now always goes through the real API (backend/app/api/projects.py gives a demo
 * session real, ownership-scoped write access instead of a client-only simulation). Real API
 * responses always carry a real server-computed rag_status already; this only exists for the
 * offline-fallback path. */
export function computeRagStatus(status: ProjectStatus, healthScore: number, riskLevel: RiskLevel): RagStatus {
  if (status === "COMPLETED" || status === "CANCELLED") return "COMPLETED";
  if (status === "AT_RISK" || riskLevel === "CRITICAL" || healthScore < 40) return "CRITICAL";
  if (status === "ON_HOLD" || riskLevel === "HIGH" || healthScore < 65) return "AT_RISK";
  return "ON_TRACK";
}
