// Entity & enum types mirrored from docs/PRODUCT_REQUIREMENTS.md — keep in sync with backend contract.

export type UserRole = "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";

export type ProjectStatus =
  | "PLANNING"
  | "ACTIVE"
  | "ON_HOLD"
  | "AT_RISK"
  | "COMPLETED"
  | "CANCELLED";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "DONE";

export type MilestoneStatus = "PENDING" | "AT_RISK" | "COMPLETED";

export type UtilizationState = "UNDERUTILIZED" | "OPTIMAL" | "OVERLOADED";

export type RiskCategory =
  | "SCHEDULE"
  | "BUDGET"
  | "RESOURCE"
  | "TECHNICAL"
  | "SECURITY"
  | "OPERATIONAL"
  | "DEPENDENCY"
  | "EXTERNAL";

export type RiskStatus = "OPEN" | "MITIGATING" | "CLOSED";

export type DocumentStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

// Mirrors backend AIResponse (app/schemas/ai.py) — the canonical shape for every
// AI-touching endpoint. `source` is always present and honest: "demo_ai" means no live
// model ran (Demo AI mode), "cache" means a previously-cached live answer was served,
// "gemini"/"groq" mean a live provider actually ran. The frontend must never claim a live
// model ran when `source` says otherwise — always render the badge from this field.
export type AISource = "gemini" | "groq" | "cache" | "demo_ai";

export interface AIResponse {
  summary: string;
  confidence: number;
  source: AISource;
  detail: string | null;
  data: Record<string, unknown>;
  prompt_version: string | null;
}

export interface User {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  is_demo: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  client: string | null;
  manager_id: string | null;
  manager_name?: string | null;
  status: ProjectStatus;
  priority: Priority;
  start_date: string;
  end_date: string;
  budget: number;
  actual_cost: number;
  progress: number;
  health_score: number;
  risk_level: RiskLevel;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role_on_project: string;
  user?: User;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  status: TaskStatus;
  priority: Priority;
  estimated_hours: number | null;
  actual_hours: number | null;
  start_date: string | null;
  due_date: string | null;
  completion_percentage: number;
  required_skills: string[] | null;
  created_at: string;
  updated_at: string;
  depends_on?: string[];
}

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string;
  status: MilestoneStatus;
}

export interface Resource {
  id: string;
  organization_id: string;
  name: string;
  role: string;
  department: string;
  skills: string[];
  hourly_cost: number;
  capacity_hours_per_week: number;
  current_workload_hours_per_week: number;
  utilization_state: UtilizationState;
}

export interface ResourceAllocation {
  id: string;
  resource_id: string;
  project_id: string;
  allocation_percent: number;
  start_date: string;
  end_date: string;
  resource_name?: string;
  project_name?: string;
}

export interface Risk {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  category: RiskCategory;
  probability: number;
  impact: number;
  score: number;
  severity: RiskLevel;
  owner: string | null;
  mitigation: string | null;
  status: RiskStatus;
}

export interface Budget {
  id: string;
  project_id: string;
  initial_budget: number;
  currency: string;
}

export interface BudgetTransaction {
  id: string;
  project_id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
}

export interface HealthBreakdown {
  health_score: number;
  schedule_penalty: number;
  budget_penalty: number;
  task_penalty: number;
  risk_penalty: number;
  resource_penalty: number;
  dependency_penalty: number;
}

export interface CostForecast {
  forecasted_final_cost: number;
  method: string;
  variance: number;
  variance_percent: number;
  overrun_probability: number;
}

export interface AssigneeCandidate {
  resource_id: string;
  resource_name: string;
  skill_match_pct: number;
  availability_pct: number;
  cost_score: number;
  overall: number;
  explanation: string;
}

export interface DashboardSummary {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  at_risk_projects: number;
  avg_health_score: number;
  budget_utilization_pct: number;
  resource_utilization_pct: number;
  upcoming_deadlines: { id: string; name: string; due_date: string; type: "MILESTONE" | "TASK" }[];
  total_budget: number;
  total_actual_cost: number;
  risk_counts: Record<RiskLevel, number>;
  projects_by_status: Record<ProjectStatus, number>;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

export interface Document {
  id: string;
  organization_id: string;
  project_id: string | null;
  filename: string;
  file_type: string;
  uploaded_by: string | null;
  file_size_bytes: number;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
}

export interface DocumentDetail {
  document: Document;
  extraction: AIResponse | null;
}

export interface DocumentExtractionData {
  filename?: string;
  word_count?: number;
  sentence_count?: number;
  requirements?: string[];
  deliverables?: string[];
  important_dates?: { date: string; context: string }[];
  risks?: string[];
  action_items?: string[];
  missing_information?: string[];
}

export interface DocumentCitation {
  chunk_index: number;
  page_number: number | null;
  similarity: number;
  excerpt: string;
}

// Analytics (Phase 6) — mirrors backend app/schemas/analytics.py.
export interface BudgetBurnPoint {
  date: string;
  period_spend: number;
  cumulative_spend: number;
}

export interface TaskCompletionPoint {
  period: string;
  period_end: string;
  tasks_due_cumulative: number;
  tasks_completed_cumulative: number;
  completion_rate_pct: number;
}

export interface RiskSnapshot {
  as_of: string;
  severity_counts: Record<RiskLevel, number>;
  status_counts: Record<RiskStatus, number>;
  open_count: number;
  closed_count: number;
  note: string;
}

export interface AnalyticsSummary {
  generated_at: string;
  organization_name: string;
  total_projects: number;
  total_budget: number;
  total_actual_cost: number;
  budget_burn_trend: BudgetBurnPoint[];
  task_completion_trend: TaskCompletionPoint[];
  risk_snapshot: RiskSnapshot;
}

// Reports (Phase 6) — mirrors backend app/schemas/report.py.
export type ReportType = "status" | "executive" | "risk" | "budget" | "ai_transformation" | "weekly";

export const REPORT_TYPES: { value: ReportType; label: string; description: string }[] = [
  { value: "status", label: "Status Report", description: "Current status, progress, and issues" },
  { value: "executive", label: "Executive Summary", description: "High-level overview for leadership" },
  { value: "risk", label: "Risk Report", description: "Risk register and mitigation posture" },
  { value: "budget", label: "Budget Report", description: "Spend, forecast, and recent transactions" },
  { value: "ai_transformation", label: "AI Transformation Report", description: "Real AI adoption/usage telemetry" },
  { value: "weekly", label: "Weekly Report", description: "Activity over the last 7 days" },
];

export interface ReportSection {
  heading: string;
  body: string;
  data?: Record<string, unknown> | null;
}

export interface Report {
  report_type: ReportType;
  title: string;
  generated_at: string;
  organization_name: string;
  project_id: string | null;
  project_name: string | null;
  source: AISource;
  sections: ReportSection[];
}
