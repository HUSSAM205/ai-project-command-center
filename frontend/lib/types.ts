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

// Canonical 4-value executive status (backend/app/services/rag_status.py) -- computed from a
// project's real status/health_score/risk_level, never a separate stored field. The one status
// vocabulary every view of a project should render from, so "at risk" means the same thing on
// the dashboard tile as it does in a PMO table row.
export type RagStatus = "ON_TRACK" | "AT_RISK" | "CRITICAL" | "COMPLETED";

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

export type AutomationTriggerType = "TASK_OVERDUE" | "BUDGET_BURNOVER" | "CRITICAL_RISK_SPOTTED";

export type AutomationActionType = "AUTO_CREATE_RISK" | "DISPATCH_NOTIFICATION" | "RECALCULATE_HEALTH";

// A rule evaluation's real outcome (backend/app/models/enums.py's AutomationOutcome) --
// CONDITION_NOT_MET is a normal, honest result (most evaluations), not an error.
export type AutomationOutcome = "FIRED" | "CONDITION_NOT_MET" | "ERROR";

export type NotificationCategory = "CRITICAL" | "AI_ALERT" | "WORKFLOW";

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
  rag_status: RagStatus;
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
  // Real financial burn (backend/app/api/serializers.py's serialize_resource) -- logged_hours/
  // planned_hours are sums of Task.actual_hours/estimated_hours across every task assigned to this
  // resource; cost_burn/planned_cost = those hours * hourly_cost. Not fabricated.
  logged_hours: number;
  planned_hours: number;
  cost_burn: number;
  planned_cost: number;
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

// backend/app/services/resource_state.py's compute_resource_project_matrix -- real cross-project
// allocation grid; is_single_point_of_failure is true only when this resource is the ONLY person
// currently allocated to that project.
export interface ResourceMatrixCell {
  project_id: string;
  project_name: string;
  allocation_percent: number;
  is_single_point_of_failure: boolean;
}

export interface ResourceMatrixRow {
  resource_id: string;
  resource_name: string;
  role: string | null;
  utilization_state: UtilizationState;
  workload_hours: number;
  capacity_hours: number;
  allocations: ResourceMatrixCell[];
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

// backend/app/services/monte_carlo.py -- 1,000-run bootstrap simulation over this org's own
// historical task estimate accuracy, not a canned/fabricated distribution.
export interface MonteCarloForecast {
  project_id: string;
  p50_date: string;
  p85_date: string;
  p95_date: string;
  remaining_task_count: number;
  remaining_hours_estimate: number;
  weekly_capacity_hours: number;
  historical_sample_size: number;
  method: string;
  runs: number;
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

// backend/app/services/workload_balancer.py's suggest_portfolio_balance -- one real, actionable
// reassignment per currently-overloaded (>110%) resource, reusing the same explainable candidate
// ranking as AssigneeCandidate and only ever suggesting a genuinely skill-qualified alternative who
// would land at/under 75% utilization after taking the task. A read; applying it is a real,
// separate PATCH /tasks/{id} the caller makes itself.
export interface BalanceSuggestion {
  task_id: string;
  task_title: string;
  from_resource_id: string;
  from_resource_name: string;
  from_utilization_pct: number;
  to_resource_id: string;
  to_resource_name: string;
  to_utilization_pct_before: number;
  to_utilization_pct_after: number;
  explanation: string;
}

export interface Bottleneck {
  task_id: string;
  task_title: string;
  root_cause: string;
  slippage_days: number;
  downstream_task_ids: string[];
  downstream_task_titles: string[];
  suggested_action: string;
  suggested_candidate: AssigneeCandidate | null;
}

export interface PortfolioEVM {
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  cpi: number | null;
  spi: number | null;
  sv: number;
  cv: number;
  eac: number;
  vac: number;
  critical_exposure: number;
  project_count: number;
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
  portfolio_evm: PortfolioEVM;
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

// Meeting Intelligence (Phase 4) -- backend/app/services/meeting_extraction.py (Demo AI, no LLM
// call) or backend/app/ai/prompts/meeting_intelligence.py (live provider JSON mode). Any field a
// live/heuristic parser couldn't confidently detect is null, never guessed.
export interface MeetingActionItem {
  title: string;
  description?: string | null;
  owner_name: string | null;
  priority: Priority;
  due_date: string | null;
  estimated_hours: number | null;
  source_line?: string;
}

export interface MeetingRisk {
  description: string;
  category: RiskCategory;
}

export interface MeetingParseData {
  decisions: string[];
  action_items: MeetingActionItem[];
  risks_identified: MeetingRisk[];
}

export interface MeetingCommitResponse {
  created_tasks: Task[];
  // owner_name values that couldn't be matched to exactly one real Resource in this org -- those
  // tasks were created unassigned, not guessed.
  unresolved_owners: string[];
}

// Event Automation Engine (backend/app/services/automation_engine.py) -- this deployment has no
// background scheduler, so a rule's condition is evaluated for real either lazily (piggybacked on
// GET /notifications, at most every few minutes) or explicitly via /test-run. Never a literally-
// continuous watcher, and never presented as one in the UI copy either.
export interface AutomationRule {
  id: string;
  name: string;
  trigger_type: AutomationTriggerType;
  condition_json: Record<string, unknown>;
  action_type: AutomationActionType;
  action_params_json: Record<string, unknown>;
  is_active: boolean;
  last_triggered_at: string | null;
}

export interface AutomationLog {
  id: string;
  rule_id: string;
  triggered_at: string;
  outcome: AutomationOutcome;
  detail: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

export interface Notification {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationList {
  notifications: Notification[];
  unread_count: number;
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

// Admin panel (Phase 5) — mirrors backend app/schemas/admin.py.
export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  is_demo: boolean;
  created_at: string;
  user_count: number;
  project_count: number;
}

export interface AIProviderStatus {
  name: string;
  configured: boolean;
  available: boolean;
  circuit_open: boolean;
  consecutive_failures: number;
  cooldown_seconds_remaining: number | null;
}

export interface AIUsageProviderBreakdown {
  provider: string;
  request_count: number;
  success_rate: number;
  avg_latency_ms: number;
}

export interface AIUsage {
  window_hours: number;
  since: string;
  total_requests: number;
  success_rate: number;
  avg_latency_ms: number;
  provider_breakdown: AIUsageProviderBreakdown[];
}

export interface AuditLogEntry {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  event_metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface FeedbackEntry {
  id: string;
  organization_id: string;
  user_id: string | null;
  message: string;
  created_at: string;
}

export interface FeedbackPage {
  items: FeedbackEntry[];
  total: number;
  page: number;
  page_size: number;
}

// AI Consulting Workspace (Phase 4) — mirrors backend app/schemas/consulting.py.
export interface BusinessCase {
  id: string;
  organization_id: string;
  name: string;
  business_problem: string;
  current_state: string;
  desired_state: string;
  objectives: string;
  constraints: string | null;
  stakeholders: string | null;
  budget: number;
  timeline: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AIOpportunity {
  id: string;
  business_case_id: string;
  name: string;
  description: string | null;
  business_impact: number;
  feasibility: number;
  data_readiness: number;
  cost: number;
  time_to_value: number;
  risk: number;
  overall_score: number;
  score_breakdown: Record<string, number>;
  created_at: string;
}

export interface ROIRequest {
  current_cost: number;
  implementation_cost: number;
  expected_efficiency_gain: number;
  annual_savings: number;
  maintenance_cost: number;
}

export interface ROIResult extends ROIRequest {
  business_case_id: string;
  efficiency_savings: number;
  annual_benefit: number;
  net_benefit: number;
  roi_percent: number | null;
  payback_period_months: number | null;
  formula: string;
}

export type RoadmapPhaseType = "DISCOVERY" | "DATA_READINESS" | "PILOT" | "IMPLEMENTATION" | "SCALE";

export const ROADMAP_PHASE_ORDER: RoadmapPhaseType[] = [
  "DISCOVERY",
  "DATA_READINESS",
  "PILOT",
  "IMPLEMENTATION",
  "SCALE",
];

export interface RoadmapPhase {
  id: string;
  business_case_id: string;
  phase: RoadmapPhaseType;
  objectives: string[];
  deliverables: string[];
  kpis: string[];
  risks: string[];
  duration_weeks: number;
  resources: string[];
  budget: number;
  sequence_order: number;
  source: AISource;
}

// Advanced PMO engines — mirrors backend app/schemas/pmo.py. EVM and the boardroom memo have
// no backing table (computed/generated on every call); RACI/stage gates/contract ledger are
// real CRUD domains.
export interface EVMAnomaly {
  metric: string;
  value: number;
  level: "warning" | "critical";
  message: string;
}

export interface EVM {
  project_id: string;
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  cpi: number | null;
  spi: number | null;
  eac: number;
  vac: number;
  planned_pct: number;
  progress: number;
  method: string;
  anomalies: EVMAnomaly[];
}

export interface WhatIfInputs {
  delay_days: number;
  budget_delta: number;
  scope_change_percent: number;
}

export interface WhatIfScenario {
  evm: EVM;
  monte_carlo: MonteCarloForecast;
}

export interface WhatIfResult {
  project_id: string;
  baseline: WhatIfScenario;
  scenario: WhatIfScenario;
  inputs: WhatIfInputs;
}

export interface RaciEntry {
  id: string;
  project_id: string;
  task_or_deliverable: string;
  responsible_id: string | null;
  responsible_name: string | null;
  accountable_id: string | null;
  accountable_name: string | null;
  consulted_id: string | null;
  consulted_name: string | null;
  informed_id: string | null;
  informed_name: string | null;
  notes: string | null;
}

export type StageGateNumber = "G1" | "G2" | "G3" | "G4" | "G5";
export type StageGateStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";

export const STAGE_GATE_ORDER: StageGateNumber[] = ["G1", "G2", "G3", "G4", "G5"];

export interface StageGate {
  id: string;
  project_id: string;
  gate: StageGateNumber;
  name: string;
  status: StageGateStatus;
  approver: string | null;
  signed_off_at: string | null;
  notes: string | null;
}

export interface ContractLedger {
  project_id: string;
  total_contract_value: number;
  billed_to_date: number;
  wip: number;
  currency: string;
  earned_value: number;
  cost_variance: number;
  margin_leakage_pct: number;
  expected_billing_at_progress: number;
  billing_gap: number;
  scope_creep_flag: boolean;
  planned_margin_pct: number;
  current_margin_pct: number;
}

export interface TradeOffOption {
  key: string;
  title: string;
  description: string;
  new_forecast_cost: number;
  variance_vs_budget: number;
  assumptions: string[];
  details: Record<string, unknown>;
}

export interface BoardroomMemo {
  project_id: string;
  project_name: string;
  generated_at: string;
  narrative: AIResponse;
  options: TradeOffOption[];
}
