import type {
  AdminOrganization,
  AdminUser,
  AIOpportunity,
  AIProviderStatus,
  AIResponse,
  AIUsage,
  AnalyticsSummary,
  AssigneeCandidate,
  AuditHealth,
  AuditLogPage,
  AuthResponse,
  AutomationLog,
  AutomationRule,
  BalanceSuggestion,
  Bottleneck,
  Budget,
  BudgetTransaction,
  BusinessCase,
  CostForecast,
  DashboardSummary,
  Document,
  DocumentDetail,
  FeedbackEntry,
  FeedbackPage,
  HealthBreakdown,
  MeetingActionItem,
  MeetingCommitResponse,
  Milestone,
  MonteCarloForecast,
  Notification,
  NotificationList,
  Project,
  ResourceMatrixRow,
  Report,
  ReportType,
  Resource,
  ResourceAllocation,
  Risk,
  RoadmapPhase,
  ROIRequest,
  ROIResult,
  Task,
  User,
} from "./types";

// Relative by default so requests go through the same-origin Next.js rewrite proxy defined in
// `next.config.ts` (zero CORS, works identically in dev and production). Override with an
// absolute URL only if you intentionally want the browser to hit the backend directly.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

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
  // Opt-in only: allows a non-GET request to share the same gateway-error retry as GETs below.
  // Reserved for calls that are genuinely safe to reissue — no side effects, same result every
  // time (e.g. demoSession(), which only reads the already-seeded demo org and mints a token;
  // see backend/app/api/demo.py). Every other mutating call stays "one honest attempt, surfaced
  // to the user" — this must never be set for anything that creates/modifies/deletes real data.
  idempotent?: boolean;
  // Internal — set automatically when re-issuing a request after a silent demo-session refresh
  // (see `request()` below). Never set this from a call site.
  retriedAfterRefresh?: boolean;
}

function isDemoSession(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem("aipcc_demo") === "1";
}

// Demo sessions (the read-only session every visitor gets automatically — see lib/auth.tsx) issue
// a short-lived JWT. If a tab sits open past expiry, the next call 401s with "token expired" and
// previously crashed whatever page made it. Since a demo session carries no credentials worth
// protecting (it's an anonymous read-only token, minted with no user input), the honest fix is to
// transparently mint a fresh one and retry — the visitor never had to "log in" in the first place,
// so silently re-establishing the same kind of session isn't hiding anything from them. A real
// account's expiry is handled separately below: we never silently swap a signed-in user into an
// anonymous demo session.
let demoRefreshPromise: Promise<void> | null = null;
function refreshDemoSession(): Promise<void> {
  if (!demoRefreshPromise) {
    demoRefreshPromise = request<AuthResponse>("/demo/session", { method: "POST", auth: false, idempotent: true })
      .then((res) => {
        setToken(res.access_token);
        window.localStorage.setItem("aipcc_demo_user", JSON.stringify(res.user));
      })
      .finally(() => {
        demoRefreshPromise = null;
      });
  }
  return demoRefreshPromise;
}

// Render's free-tier backend sleeps after ~15 minutes with no traffic; waking it up can briefly
// surface as a 502/503/504 from Render's own edge (not the application) while the container spins
// back up. Retrying a GET a few times with backoff resolves this invisibly instead of showing an
// error for what is, from the user's perspective, nothing having gone wrong. Never retries
// mutating requests (POST/PATCH/PUT/DELETE) unless explicitly marked `idempotent` above — those
// get one honest attempt, since a transient gateway error on a write is surfaced to the user
// rather than silently reissued.
const GATEWAY_RETRY_STATUSES = new Set([502, 503, 504]);
const GATEWAY_RETRY_DELAYS_MS = [800, 1600, 2800];

// A burst of concurrent page loads (this shared free-tier deployment, hit by real traffic plus its
// own automated verification) can trip a platform-level 429 on a plain read with nothing wrong at
// the application layer. This is deliberately kept separate from the app's own, intentional 429s
// (the demo-upload hourly budget, the AI executive-brief/assistant hourly quota via
// AIRouter.enforce_rate_limit): those always come back as a real FastAPI HTTPException with a
// meaningful JSON `detail` ("Demo upload limit reached...", "You've hit the AI request limit...")
// and must be surfaced immediately, verbatim, never retried or relabeled -- retrying wouldn't
// clear a quota anyway, and papering over it with a generic message would hide real, correct
// information the user needs. A platform-edge 429 has no such body (or an unparseable one), so
// isAppLevel429 below is the signal: only a bodyless/non-JSON 429 is treated as transient and
// retried, the same way a gateway cold-start is.
const RATE_LIMIT_RETRY_DELAYS_MS = [1500, 3000, 6000];

async function isAppLevel429(res: Response): Promise<boolean> {
  try {
    const data = await res.clone().json();
    return typeof data?.detail === "string" || typeof data?.message === "string";
  } catch {
    return false;
  }
}

function retryDelayMs(res: Response, attempt: number, fallback: number[]): number {
  const retryAfter = res.headers.get("Retry-After");
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return fallback[attempt];
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, auth = true, idempotent = false, retriedAfterRefresh = false } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  let attempt = 0;
  for (;;) {
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
    const retryable = method === "GET" || idempotent;
    const canRetryGateway = retryable && GATEWAY_RETRY_STATUSES.has(res.status) && attempt < GATEWAY_RETRY_DELAYS_MS.length;
    const canRetryRateLimit =
      retryable && res.status === 429 && attempt < RATE_LIMIT_RETRY_DELAYS_MS.length && !(await isAppLevel429(res));
    if (!canRetryGateway && !canRetryRateLimit) break;
    const delay = canRetryRateLimit ? retryDelayMs(res, attempt, RATE_LIMIT_RETRY_DELAYS_MS) : GATEWAY_RETRY_DELAYS_MS[attempt];
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt += 1;
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data?.detail || data?.message || message;
    } catch {
      // ignore body parse failure
    }

    if (res.status === 401 && auth && !retriedAfterRefresh) {
      if (isDemoSession()) {
        try {
          await refreshDemoSession();
          return request<T>(path, { ...options, retriedAfterRefresh: true });
        } catch {
          // Refresh itself failed (e.g. backend unreachable) — fall through to the normal
          // error path below instead of masking a real outage as a token problem.
        }
      } else if (typeof window !== "undefined") {
        // A real account's session actually expired. Never silently re-establish a different
        // (anonymous demo) identity in its place — clear the dead token and let the app shell's
        // existing "not authenticated" state take over, same as any other session loss.
        clearToken();
        window.dispatchEvent(new Event("aipcc:session-expired"));
      }
    }

    if (res.status === 403) {
      message = "This view is read-only. Get full account access to make changes.";
    }
    if (GATEWAY_RETRY_STATUSES.has(res.status)) {
      message = "The backend is warming up after being idle — please try again in a few seconds.";
    }
    // Only relabels the generic fallback -- an app-level 429's real `detail` (demo-upload budget,
    // AI hourly quota) was already picked up by the parse above and is left untouched.
    if (res.status === 429 && message === `Request failed (429)`) {
      message = "The server is handling a lot of requests right now — please try again in a moment.";
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// A handful of read endpoints are hit far more often than the rest: `allTasks`/`allRisks` each
// fan out one request per project (N+1 by nature -- there's no org-wide /tasks or /risks endpoint,
// see their own comments below), and `projects`/`resources` back onto multiple pages that all
// mount independently. Rapid tab-switching or a quick round of page navigations was refetching all
// of these from scratch every time, which is what actually trips the free-tier backend's rate
// limiting -- not any single page being expensive on its own. This is a plain in-memory
// stale-while-revalidate cache, not a general-purpose HTTP cache: entries are addressed by a fixed
// set of keys (below), live only for this tab's session, and are invalidated explicitly by the
// mutations that would make them wrong rather than by guessing at cache-control semantics.
const CACHE_FRESH_MS = 45_000;
const CACHE_STALE_CEILING_MS = 5 * 60_000;
const responseCache = new Map<string, { data: unknown; timestamp: number }>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const pending = inFlightRequests.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const entry = responseCache.get(key) as { data: T; timestamp: number } | undefined;
  const age = entry ? Date.now() - entry.timestamp : Infinity;

  if (entry && age < CACHE_FRESH_MS) return Promise.resolve(entry.data);

  const promise = fetcher()
    .then((data) => {
      responseCache.set(key, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => inFlightRequests.delete(key));
  inFlightRequests.set(key, promise);

  if (entry && age < CACHE_STALE_CEILING_MS) {
    // Stale-while-revalidate: hand back what we already have immediately and let `promise` above
    // refresh the cache in the background for whoever asks next. A background revalidation failure
    // must never surface here (or become an unhandled rejection) -- a caller that actually needs
    // fresh data finds out for real the next time this key is asked for past CACHE_FRESH_MS.
    promise.catch(() => {});
    return Promise.resolve(entry.data);
  }

  return promise;
}

function invalidateCached(...keys: string[]) {
  for (const key of keys) responseCache.delete(key);
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  register: (payload: { email: string; password: string; full_name: string; organization_name: string }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: payload, auth: false }),
  me: () => request<User>("/auth/me"),
  demoSession: () => request<AuthResponse>("/demo/session", { method: "POST", auth: false, idempotent: true }),

  // Dashboard
  dashboard: () => request<DashboardSummary>("/dashboard"),

  // Projects
  projects: () => cached("projects", () => request<Project[]>("/projects")),
  project: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (payload: Partial<Project>) =>
    request<Project>("/projects", { method: "POST", body: payload }).then((p) => {
      invalidateCached("projects", "allTasks", "allRisks");
      return p;
    }),
  updateProject: (id: string, payload: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: "PATCH", body: payload }).then((p) => {
      invalidateCached("projects", "allTasks", "allRisks");
      return p;
    }),
  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }).then(() => {
      invalidateCached("projects", "allTasks", "allRisks");
    }),
  projectHealth: (id: string) => request<HealthBreakdown>(`/projects/${id}/health`),
  projectForecast: (id: string) => request<CostForecast>(`/projects/${id}/forecast`),
  projectMonteCarloForecast: (id: string) => request<MonteCarloForecast>(`/projects/${id}/forecast/monte-carlo`),
  projectBottlenecks: (id: string) => request<Bottleneck[]>(`/projects/${id}/bottlenecks`),

  // Tasks
  tasks: (projectId: string) => request<Task[]>(`/projects/${projectId}/tasks`),
  // The contract only documents /projects/{id}/tasks (no org-wide list), so the cross-project
  // Tasks page aggregates by fetching tasks for every project and tagging them with project info.
  allTasks: (): Promise<(Task & { project_name?: string })[]> =>
    cached("allTasks", async () => {
      const projects = await request<Project[]>("/projects");
      const perProject = await Promise.all(
        projects.map((p) =>
          request<Task[]>(`/projects/${p.id}/tasks`).then((tasks) =>
            tasks.map((t) => ({ ...t, project_name: p.name })),
          ),
        ),
      );
      return perProject.flat();
    }),
  createTask: (projectId: string, payload: Partial<Task>) =>
    request<Task>(`/projects/${projectId}/tasks`, { method: "POST", body: payload }).then((t) => {
      invalidateCached("allTasks");
      return t;
    }),
  updateTask: (id: string, payload: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, { method: "PATCH", body: payload }).then((t) => {
      invalidateCached("allTasks");
      return t;
    }),
  deleteTask: (id: string) =>
    request<void>(`/tasks/${id}`, { method: "DELETE" }).then(() => {
      invalidateCached("allTasks");
    }),
  addDependency: (taskId: string, dependsOnTaskId: string) =>
    request<void>(`/tasks/${taskId}/dependencies`, { method: "POST", body: { depends_on_task_id: dependsOnTaskId } }).then(() => {
      invalidateCached("allTasks");
    }),
  removeDependency: (taskId: string, dependsOnTaskId: string) =>
    request<void>(`/tasks/${taskId}/dependencies`, { method: "DELETE", body: { depends_on_task_id: dependsOnTaskId } }).then(() => {
      invalidateCached("allTasks");
    }),
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
  resources: () => cached("resources", () => request<Resource[]>("/resources")),
  resourceMatrix: () => request<ResourceMatrixRow[]>("/resources/matrix"),
  createResource: (payload: Partial<Resource>) =>
    request<Resource>("/resources", { method: "POST", body: payload }).then((r) => {
      invalidateCached("resources");
      return r;
    }),
  updateResource: (id: string, payload: Partial<Resource>) =>
    request<Resource>(`/resources/${id}`, { method: "PATCH", body: payload }).then((r) => {
      invalidateCached("resources");
      return r;
    }),
  deleteResource: (id: string) =>
    request<void>(`/resources/${id}`, { method: "DELETE" }).then(() => {
      invalidateCached("resources");
    }),
  balanceSuggestions: () => request<BalanceSuggestion[]>("/resources/balance-suggestions", { method: "POST" }),
  allocations: (projectId: string) => request<ResourceAllocation[]>(`/projects/${projectId}/allocations`),
  createAllocation: (projectId: string, payload: Partial<ResourceAllocation>) =>
    request<ResourceAllocation>(`/projects/${projectId}/allocations`, { method: "POST", body: payload }).then((a) => {
      invalidateCached("resources");
      return a;
    }),

  // Risks
  risks: (projectId: string) => request<Risk[]>(`/projects/${projectId}/risks`),
  // Same reasoning as allTasks: no org-wide /risks endpoint is documented.
  allRisks: (): Promise<(Risk & { project_name?: string })[]> =>
    cached("allRisks", async () => {
      const projects = await request<Project[]>("/projects");
      const perProject = await Promise.all(
        projects.map((p) =>
          request<Risk[]>(`/projects/${p.id}/risks`).then((risks) =>
            risks.map((r) => ({ ...r, project_name: p.name })),
          ),
        ),
      );
      return perProject.flat();
    }),
  createRisk: (projectId: string, payload: Partial<Risk>) =>
    request<Risk>(`/projects/${projectId}/risks`, { method: "POST", body: payload }).then((r) => {
      invalidateCached("allRisks");
      return r;
    }),
  updateRisk: (id: string, payload: Partial<Risk>) =>
    request<Risk>(`/risks/${id}`, { method: "PATCH", body: payload }).then((r) => {
      invalidateCached("allRisks");
      return r;
    }),
  deleteRisk: (id: string) =>
    request<void>(`/risks/${id}`, { method: "DELETE" }).then(() => {
      invalidateCached("allRisks");
    }),

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

  // Meeting Intelligence (Phase 4)
  parseMeetingTranscript: (transcript: string) =>
    request<AIResponse>("/meetings/parse-transcript", { method: "POST", body: { transcript } }),
  commitMeetingTasks: (projectId: string, actionItems: MeetingActionItem[]) =>
    request<MeetingCommitResponse>("/meetings/commit-tasks", {
      method: "POST",
      body: {
        project_id: projectId,
        action_items: actionItems.map((item) => ({
          title: item.title,
          description: item.description ?? null,
          owner_name: item.owner_name,
          priority: item.priority,
          due_date: item.due_date,
          estimated_hours: item.estimated_hours,
        })),
      },
    }),

  // Event Automation Engine & Smart Notifications
  automations: () => request<AutomationRule[]>("/automations"),
  toggleAutomation: (id: string) => request<AutomationRule>(`/automations/${id}/toggle`, { method: "POST" }),
  testRunAutomation: (id: string) => request<AutomationLog>(`/automations/${id}/test-run`, { method: "POST" }),
  automationLogs: (id: string) => request<AutomationLog[]>(`/automations/${id}/logs`),
  notifications: () => request<NotificationList>("/notifications"),
  markNotificationRead: (id: string) => request<Notification>(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request<void>("/notifications/mark-all-read", { method: "POST" }),

  // Analytics & Reports (Phase 6)
  analytics: () => request<AnalyticsSummary>("/analytics"),
  report: (reportType: ReportType, projectId?: string) =>
    request<Report>(`/reports/${reportType}${projectId ? `?project_id=${projectId}` : ""}`),

  // AI Assistant / Executive Brief (Phase 2)
  executiveBrief: () => request<AIResponse>("/ai/executive-brief"),
  projectAiInsights: (projectId: string) => request<AIResponse>(`/projects/${projectId}/ai-insights`),
  askAssistant: (question: string, projectId?: string, file?: File) =>
    askAssistantRequest(question, projectId, file),

  // Feedback (Phase 5) — open to any authenticated caller, including anonymous demo sessions.
  submitFeedback: (message: string) => request<FeedbackEntry>("/feedback", { method: "POST", body: { message } }),

  // Admin panel (Phase 5) — every call here 403s unless the caller's role has been granted the
  // "admin.access" permission (see backend app/core/deps.py::require_permission).
  admin: {
    users: () => request<AdminUser[]>("/admin/users"),
    organization: () => request<AdminOrganization>("/admin/organizations"),
    aiProviders: () => request<AIProviderStatus[]>("/admin/ai-providers"),
    aiUsage: (hours: number) => request<AIUsage>(`/admin/ai-usage?hours=${hours}`),
    auditLogs: (params: { page?: number; pageSize?: number; action?: string; entityType?: string } = {}) => {
      const q = new URLSearchParams();
      q.set("page", String(params.page ?? 1));
      q.set("page_size", String(params.pageSize ?? 25));
      if (params.action) q.set("action", params.action);
      if (params.entityType) q.set("entity_type", params.entityType);
      return request<AuditLogPage>(`/admin/audit-logs?${q.toString()}`);
    },
    feedback: (params: { page?: number; pageSize?: number } = {}) => {
      const q = new URLSearchParams();
      q.set("page", String(params.page ?? 1));
      q.set("page_size", String(params.pageSize ?? 25));
      return request<FeedbackPage>(`/admin/feedback?${q.toString()}`);
    },
  },

  // Governance & Compliance -- same admin.access gate as the admin panel above, a richer read
  // surface over the SAME audit_logs table (date-range filtering, CSV export, hash-chain health),
  // not a second/competing audit pipeline.
  audit: {
    logs: (
      params: { page?: number; pageSize?: number; action?: string; resourceType?: string; dateFrom?: string; dateTo?: string } = {},
    ) => {
      const q = new URLSearchParams();
      q.set("page", String(params.page ?? 1));
      q.set("page_size", String(params.pageSize ?? 25));
      if (params.action) q.set("action", params.action);
      if (params.resourceType) q.set("resource_type", params.resourceType);
      if (params.dateFrom) q.set("date_from", params.dateFrom);
      if (params.dateTo) q.set("date_to", params.dateTo);
      return request<AuditLogPage>(`/audit/logs?${q.toString()}`);
    },
    health: () => request<AuditHealth>("/audit/health"),
  },

  // AI Consulting Workspace (Phase 4)
  consulting: {
    businessCases: () => request<BusinessCase[]>("/consulting/business-cases"),
    businessCase: (id: string) => request<BusinessCase>(`/consulting/business-cases/${id}`),
    createBusinessCase: (payload: Partial<BusinessCase>) =>
      request<BusinessCase>("/consulting/business-cases", { method: "POST", body: payload }),
    updateBusinessCase: (id: string, payload: Partial<BusinessCase>) =>
      request<BusinessCase>(`/consulting/business-cases/${id}`, { method: "PATCH", body: payload }),
    deleteBusinessCase: (id: string) => request<void>(`/consulting/business-cases/${id}`, { method: "DELETE" }),

    opportunities: (businessCaseId: string) =>
      request<AIOpportunity[]>(`/consulting/business-cases/${businessCaseId}/opportunities`),
    createOpportunity: (businessCaseId: string, payload: Partial<AIOpportunity>) =>
      request<AIOpportunity>(`/consulting/business-cases/${businessCaseId}/opportunities`, {
        method: "POST",
        body: payload,
      }),

    calculateRoi: (businessCaseId: string, payload: ROIRequest) =>
      request<ROIResult>(`/consulting/business-cases/${businessCaseId}/roi`, { method: "POST", body: payload }),

    roadmap: (businessCaseId: string) =>
      request<RoadmapPhase[]>(`/consulting/business-cases/${businessCaseId}/roadmap`),
    generateRoadmap: (businessCaseId: string) =>
      request<RoadmapPhase[]>(`/consulting/business-cases/${businessCaseId}/roadmap`, { method: "POST" }),
  },
};

/** POST /ai/assistant is multipart/form-data (not JSON) specifically so it can carry an optional
 * chat attachment (backend/app/api/ai.py) -- same reasoning as uploadDocumentRequest below, same
 * pattern. The attachment is transient (read for this one question only, never persisted to the
 * documents/document_chunks tables the real Documents page uses). */
async function askAssistantRequest(question: string, projectId?: string, file?: File): Promise<AIResponse> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const form = new FormData();
  form.append("question", question);
  if (projectId) form.append("project_id", projectId);
  if (file) form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/ai/assistant`, { method: "POST", headers, body: form });
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
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as AIResponse;
}

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
      message = "This view is read-only. Get full account access to make changes.";
    }
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as Document;
}
