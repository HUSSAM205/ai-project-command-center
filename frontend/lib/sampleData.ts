// Representative fixture data for the landing page's "product preview" section only.
// Real pages under /app never use this — they always fetch from the API.
import type { Milestone, Risk, Task } from "./types";

export const sampleTasks: Task[] = [
  { id: "t1", project_id: "p1", title: "Requirements & discovery", description: null, assignee_id: "r1", assignee_name: "Priya Nair", status: "DONE", priority: "HIGH", estimated_hours: 40, actual_hours: 38, start_date: "2026-06-01", due_date: "2026-06-12", completion_percentage: 100, required_skills: null, created_at: "", updated_at: "" },
  { id: "t2", project_id: "p1", title: "Data pipeline architecture", description: null, assignee_id: "r2", assignee_name: "Marcus Webb", status: "DONE", priority: "CRITICAL", estimated_hours: 80, actual_hours: 84, start_date: "2026-06-10", due_date: "2026-06-28", completion_percentage: 100, required_skills: null, created_at: "", updated_at: "", depends_on: ["t1"] },
  { id: "t3", project_id: "p1", title: "Model training infrastructure", description: null, assignee_id: "r3", assignee_name: "Elena Cho", status: "IN_PROGRESS", priority: "HIGH", estimated_hours: 100, actual_hours: 62, start_date: "2026-06-25", due_date: "2026-07-18", completion_percentage: 55, required_skills: null, created_at: "", updated_at: "", depends_on: ["t2"] },
  { id: "t4", project_id: "p1", title: "Integration testing", description: null, assignee_id: null, assignee_name: null, status: "BLOCKED", priority: "MEDIUM", estimated_hours: 50, actual_hours: 5, start_date: "2026-07-10", due_date: "2026-07-22", completion_percentage: 10, required_skills: null, created_at: "", updated_at: "", depends_on: ["t3"] },
  { id: "t5", project_id: "p1", title: "Stakeholder review", description: null, assignee_id: "r1", assignee_name: "Priya Nair", status: "TODO", priority: "MEDIUM", estimated_hours: 16, actual_hours: 0, start_date: "2026-07-20", due_date: "2026-07-30", completion_percentage: 0, required_skills: null, created_at: "", updated_at: "", depends_on: ["t4"] },
  { id: "t6", project_id: "p1", title: "Production rollout", description: null, assignee_id: "r2", assignee_name: "Marcus Webb", status: "TODO", priority: "CRITICAL", estimated_hours: 30, actual_hours: 0, start_date: "2026-07-28", due_date: "2026-08-08", completion_percentage: 0, required_skills: null, created_at: "", updated_at: "", depends_on: ["t5"] },
];

export const sampleMilestones: Milestone[] = [
  { id: "m1", project_id: "p1", name: "Architecture sign-off", description: null, due_date: "2026-06-28", status: "COMPLETED" },
  { id: "m2", project_id: "p1", name: "Beta release", description: null, due_date: "2026-07-22", status: "AT_RISK" },
  { id: "m3", project_id: "p1", name: "General availability", description: null, due_date: "2026-08-08", status: "PENDING" },
];

export const sampleRisks: Risk[] = [
  { id: "rk1", project_id: "p1", title: "Key vendor API deprecation", description: null, category: "TECHNICAL", probability: 3, impact: 4, score: 12, severity: "HIGH", owner: "Marcus Webb", mitigation: null, status: "OPEN" },
  { id: "rk2", project_id: "p1", title: "Scope creep from stakeholder asks", description: null, category: "SCHEDULE", probability: 4, impact: 3, score: 12, severity: "HIGH", owner: "Priya Nair", mitigation: null, status: "MITIGATING" },
  { id: "rk3", project_id: "p1", title: "GPU capacity shortage", description: null, category: "RESOURCE", probability: 3, impact: 5, score: 15, severity: "HIGH", owner: "Elena Cho", mitigation: null, status: "OPEN" },
  { id: "rk4", project_id: "p1", title: "Budget overrun on compute", description: null, category: "BUDGET", probability: 2, impact: 4, score: 8, severity: "MEDIUM", owner: "Priya Nair", mitigation: null, status: "OPEN" },
  { id: "rk5", project_id: "p1", title: "Data residency compliance gap", description: null, category: "SECURITY", probability: 2, impact: 5, score: 10, severity: "HIGH", owner: "Elena Cho", mitigation: null, status: "MITIGATING" },
  { id: "rk6", project_id: "p1", title: "Minor UI regressions", description: null, category: "TECHNICAL", probability: 2, impact: 1, score: 2, severity: "LOW", owner: "Marcus Webb", mitigation: null, status: "CLOSED" },
  { id: "rk7", project_id: "p1", title: "Third-party integration delay", description: null, category: "DEPENDENCY", probability: 4, impact: 4, score: 16, severity: "HIGH", owner: "Elena Cho", mitigation: null, status: "OPEN" },
  { id: "rk8", project_id: "p1", title: "Executive sponsor turnover", description: null, category: "EXTERNAL", probability: 1, impact: 3, score: 3, severity: "LOW", owner: "Priya Nair", mitigation: null, status: "CLOSED" },
];

export const sampleKpis = {
  totalProjects: 5,
  activeProjects: 3,
  atRiskProjects: 1,
  avgHealth: 76,
  budgetUtilization: 68,
  resourceUtilization: 82,
};

export const sampleProjects = [
  { name: "AI Customer Intelligence", health: 88, status: "ACTIVE" as const, risk: "LOW" as const },
  { name: "Digital Transformation Program", health: 61, status: "AT_RISK" as const, risk: "MEDIUM" as const },
  { name: "Cloud Migration Initiative", health: 92, status: "ACTIVE" as const, risk: "LOW" as const },
  { name: "Enterprise Automation Platform", health: 45, status: "AT_RISK" as const, risk: "HIGH" as const },
  { name: "Smart Operations System", health: 74, status: "ON_HOLD" as const, risk: "MEDIUM" as const },
];

// Derived from sampleProjects above — used by the landing page's status-mix donut tile so it
// stays consistent with the project list shown right next to it, rather than a separate fixture.
export const sampleStatusCounts: Record<string, number> = sampleProjects.reduce(
  (acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  },
  {} as Record<string, number>,
);
