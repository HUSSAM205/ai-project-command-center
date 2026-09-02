/**
 * Advanced PMO engines API client — EVM, RACI, stage gates, contract ledger, boardroom memo,
 * and the report PDF download (mirrors backend app/api/pmo.py + the /reports/{type}/pdf route
 * added to app/api/reports.py).
 *
 * Deliberately a separate module from ./api.ts rather than an addition to it: another
 * concurrent workstream in this repo owns frontend/lib/api.ts (adding the Next.js reverse-proxy
 * rewrite) and frontend/next.config.ts, so this file is additive-only — it imports the small
 * shared pieces it needs (API_BASE_URL, token helpers, ApiError) from api.ts rather than
 * duplicating them, but never edits that file. Mirrors request()'s behavior in api.ts exactly
 * (same headers/error handling) so callers can't tell the difference.
 */
import { API_BASE_URL, ApiError, getToken } from "./api";
import type {
  BoardroomMemo,
  ContractLedger,
  EVM,
  RaciEntry,
  StageGate,
  StageGateStatus,
} from "./types";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Could not reach the API. The backend may be offline.", 0);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data?.detail || data?.message || message;
    } catch {
      // ignore body parse failure
    }
    if (res.status === 403) {
      message = "This is a read-only demo session — write actions are disabled.";
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const pmoApi = {
  // EVM (computed on read — no persistence)
  evm: (projectId: string) => request<EVM>(`/projects/${projectId}/evm`),

  // RACI matrix
  raci: (projectId: string) => request<RaciEntry[]>(`/projects/${projectId}/raci`),
  createRaci: (
    projectId: string,
    payload: {
      task_or_deliverable: string;
      responsible_id?: string | null;
      accountable_id?: string | null;
      consulted_id?: string | null;
      informed_id?: string | null;
      notes?: string | null;
    },
  ) => request<RaciEntry>(`/projects/${projectId}/raci`, { method: "POST", body: payload }),
  updateRaci: (raciId: string, payload: Partial<RaciEntry>) =>
    request<RaciEntry>(`/raci/${raciId}`, { method: "PATCH", body: payload }),
  deleteRaci: (raciId: string) => request<void>(`/raci/${raciId}`, { method: "DELETE" }),

  // Stage gates
  stageGates: (projectId: string) => request<StageGate[]>(`/projects/${projectId}/stage-gates`),
  createStageGate: (
    projectId: string,
    payload: { gate: string; name: string; status?: StageGateStatus; approver?: string | null; notes?: string | null },
  ) => request<StageGate>(`/projects/${projectId}/stage-gates`, { method: "POST", body: payload }),
  updateStageGate: (
    stageGateId: string,
    payload: { name?: string; status?: StageGateStatus; approver?: string | null; notes?: string | null },
  ) => request<StageGate>(`/stage-gates/${stageGateId}`, { method: "PATCH", body: payload }),

  // Contract ledger (derived margin_leakage_pct etc. computed server-side on every call)
  contractLedger: (projectId: string) => request<ContractLedger>(`/projects/${projectId}/contract-ledger`),
  updateContractLedger: (
    projectId: string,
    payload: { total_contract_value?: number; billed_to_date?: number; wip?: number; currency?: string },
  ) => request<ContractLedger>(`/projects/${projectId}/contract-ledger`, { method: "PATCH", body: payload }),

  // Boardroom memo — generated fresh on every call, never persisted (see app/api/pmo.py)
  generateBoardroomMemo: (projectId: string) =>
    request<BoardroomMemo>(`/projects/${projectId}/boardroom-memo`, { method: "POST" }),
};

/** Downloads the server-generated PDF for a report (GET /reports/{type}/pdf) and hands the
 * browser a real file to save — a genuine one-click download that doesn't depend on the
 * visitor's browser print dialog (unlike the pre-existing window.print() button, which stays in
 * place). Fetches with the auth header (a plain <a href> can't carry an Authorization header),
 * then triggers the save via a short-lived object URL. */
export async function downloadReportPdf(reportType: string, projectId?: string): Promise<void> {
  const path = `/reports/${reportType}/pdf${projectId ? `?project_id=${projectId}` : ""}`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { headers });
  } catch {
    throw new ApiError("Could not reach the API. The backend may be offline.", 0);
  }
  if (!res.ok) {
    let message = `PDF download failed (${res.status})`;
    try {
      const data = await res.json();
      message = data?.detail || data?.message || message;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${reportType}-report.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
