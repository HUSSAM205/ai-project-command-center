import type {
  AIResponse,
  AnalyticsSummary,
  AssigneeCandidate,
  AuthResponse,
  Budget,
  BudgetTransaction,
  CostForecast,
  DashboardSummary,
  Document,
  DocumentDetail,
  HealthBreakdown,
  Milestone,
  Project,
  Report,
  ReportType,
  Resource,
  ResourceAllocation,
  Risk,
  Task,
  User,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const TOKEN_KEY = "aipcc_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  isReadOnly: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.isReadOnly = status === 403;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    throw new ApiError(
      "Could not reach the API. The backend may be offline.",
      0,
    );
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

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  register: (payload: { email: string; password: string; full_name: string; organization_name: string }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: payload, auth: false }),
  me: () => request<User>("/auth/me"),
  demoSession: () => request<AuthResponse>("/demo/session", { method: "POST", auth: false }),

  // Dashboard
  dashboard: () => request<DashboardSummary>("/dashboard"),

  // Projects
  projects: () => request<Project[]>("/projects"),
  project: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (payload: Partial<Project>) => request<Project>("/projects", { method: "POST", body: payload }),
  updateProject: (id: string, payload: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: "PATCH", body: payload }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
  projectHealth: (id: string) => request<HealthBreakdown>(`/projects/${id}/health`),
  projectForecast: (id: string) => request<CostForecast>(`/projects/${id}/forecast`),

  // Tasks
  tasks: (projectId: string) => request<Task[]>(`/projects/${projectId}/tasks`),
  // The contract only documents /projects/{id}/tasks (no org-wide list), so the cross-project
  // Tasks page aggregates by fetching tasks for every project and tagging them with project info.
  allTasks: async (): Promise<(Task & { project_name?: string })[]> => {
    const projects = await request<Project[]>("/projects");
    const perProject = await Promise.all(
      projects.map((p) =>
        request<Task[]>(`/projects/${p.id}/tasks`).then((tasks) =>
          tasks.map((t) => ({ ...t, project_name: p.name })),
        ),
      ),
    );
    return perProject.flat();
  },
  createTask: (projectId: string, payload: Partial<Task>) =>
    request<Task>(`/projects/${projectId}/tasks`, { method: "POST", body: payload }),
  updateTask: (id: string, payload: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, { method: "PATCH", body: payload }),
  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: "DELETE" }),
  addDependency: (taskId: string, dependsOnTaskId: string) =>
    request<void>(`/tasks/${taskId}/dependencies`, { method: "POST", body: { depends_on_task_id: dependsOnTaskId } }),
  removeDependency: (taskId: string, dependsOnTaskId: string) =>
    request<void>(`/tasks/${taskId}/dependencies`, { method: "DELETE", body: { depends_on_task_id: dependsOnTaskId } }),
  suggestAssignees: (taskId: string) =>
    request<AssigneeCandidate[]>(`/tasks/${taskId}/suggest-assignees`, { method: "POST" }),

  // Milestones
  milestones: (projectId: string) => request<Milestone[]>(`/projects/${projectId}/milestones`),
  createMilestone: (projectId: string, payload: Partial<Milestone>) =>
    request<Milestone>(`/projects/${projectId}/milestones`, { method: "POST", body: payload }),
  updateMilestone: (id: string, payload: Partial<Milestone>) =>
    request<Milestone>(`/milestones/${id}`, { method: "PATCH", body: payload }),
  deleteMilestone: (id: string) => request<void>(`/milestones/${id}`, { method: "DELETE" }),

  // Resources
  resources: () => request<Resource[]>("/resources"),
  createResource: (payload: Partial<Resource>) => request<Resource>("/resources", { method: "POST", body: payload }),
  updateResource: (id: string, payload: Partial<Resource>) =>
    request<Resource>(`/resources/${id}`, { method: "PATCH", body: payload }),
  deleteResource: (id: string) => request<void>(`/resources/${id}`, { method: "DELETE" }),
  allocations: (projectId: string) => request<ResourceAllocation[]>(`/projects/${projectId}/allocations`),
  createAllocation: (projectId: string, payload: Partial<ResourceAllocation>) =>
    request<ResourceAllocation>(`/projects/${projectId}/allocations`, { method: "POST", body: payload }),

  // Risks
  risks: (projectId: string) => request<Risk[]>(`/projects/${projectId}/risks`),
  // Same reasoning as allTasks: no org-wide /risks endpoint is documented.
  allRisks: async (): Promise<(Risk & { project_name?: string })[]> => {
    const projects = await request<Project[]>("/projects");
    const perProject = await Promise.all(
      projects.map((p) =>
        request<Risk[]>(`/projects/${p.id}/risks`).then((risks) =>
          risks.map((r) => ({ ...r, project_name: p.name })),
        ),
      ),
    );
    return perProject.flat();
  },
  createRisk: (projectId: string, payload: Partial<Risk>) =>
    request<Risk>(`/projects/${projectId}/risks`, { method: "POST", body: payload }),
  updateRisk: (id: string, payload: Partial<Risk>) =>
    request<Risk>(`/risks/${id}`, { method: "PATCH", body: payload }),
  deleteRisk: (id: string) => request<void>(`/risks/${id}`, { method: "DELETE" }),

  // Budget
  budget: (projectId: string) =>
    request<{ budget: Budget; transactions: BudgetTransaction[]; actual_cost: number }>(
      `/projects/${projectId}/budget`,
    ),
  addBudgetTransaction: (projectId: string, payload: Partial<BudgetTransaction>) =>
    request<BudgetTransaction>(`/projects/${projectId}/budget/transactions`, { method: "POST", body: payload }),

  // Documents (Phase 3 — Document Intelligence / RAG)
  documents: (projectId?: string) =>
    request<Document[]>(`/documents${projectId ? `?project_id=${projectId}` : ""}`),
  document: (id: string) => request<DocumentDetail>(`/documents/${id}`),
  uploadDocument: (file: File, projectId?: string) => uploadDocumentRequest(file, projectId),
  askDocument: (id: string, question: string) =>
    request<AIResponse>(`/documents/${id}/ask`, { method: "POST", body: { question } }),

  // Analytics & Reports (Phase 6)
  analytics: () => request<AnalyticsSummary>("/analytics"),
  report: (reportType: ReportType, projectId?: string) =>
    request<Report>(`/reports/${reportType}${projectId ? `?project_id=${projectId}` : ""}`),

  // AI Assistant / Executive Brief (Phase 2)
  executiveBrief: () => request<AIResponse>("/ai/executive-brief"),
  projectAiInsights: (projectId: string) => request<AIResponse>(`/projects/${projectId}/ai-insights`),
  askAssistant: (question: string, projectId?: string) =>
    request<AIResponse>("/ai/assistant", { method: "POST", body: { question, project_id: projectId } }),
};

/** Multipart upload can't go through `request()` (it JSON-stringifies every body and forces
 * a `Content-Type: application/json` header, which would break the multipart boundary) —
 * built separately but mirrors the same auth/error handling. */
async function uploadDocumentRequest(file: File, projectId?: string): Promise<Document> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const form = new FormData();
  form.append("file", file);
  if (projectId) form.append("project_id", projectId);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/documents`, { method: "POST", headers, body: form });
  } catch {
    throw new ApiError("Could not reach the API. The backend may be offline.", 0);
  }

  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
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

  return (await res.json()) as Document;
}
