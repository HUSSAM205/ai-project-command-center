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
