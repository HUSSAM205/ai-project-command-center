# Architecture

## System overview

```
Browser (Next.js SSR/CSR)
   |
   v
Next.js app (frontend/) --- REST/JSON ---> FastAPI app (backend/)
                                                |
                                                v
                                         PostgreSQL (aipcc)
```

AI providers (Gemini/Groq) do not exist in this system yet — see "Build status" below. When they
are added (Phase 2), they will sit **behind** the FastAPI backend only:

```
Frontend --> FastAPI --> AI Router --> Gemini --> Groq (fallback) --> Cache --> Demo fallback
```

The frontend will never hold `GEMINI_API_KEY` / `GROQ_API_KEY`, and will never call an AI provider
directly. Every AI-touching endpoint must degrade to cached/demo output if all providers fail —
core project-management functionality (dashboard, projects, tasks, Gantt, resources, risks,
budget, analytics) has no AI dependency at all and must keep working with zero AI providers up.

## Repo layout

```
ai-project-command-center/
  backend/         FastAPI app (app/api, app/core, app/models, app/schemas, app/services, app/repositories)
  frontend/        Next.js app (TypeScript, Tailwind, App Router)
  docs/            This file, PROJECT_PLAN.md, PRODUCT_REQUIREMENTS.md (+ more as later phases land)
  docker-compose.yml  Local Postgres (Phase 1); backend/frontend services added once Dockerfiles exist
  .env.example
```

## Multi-tenancy

Every domain table (`projects`, `tasks`, `resources`, `risks`, `budgets`, ...) is scoped by
`organization_id`, either directly or via its parent project. All repository/service queries filter
by the authenticated user's `organization_id` — cross-tenant reads are a bug, not a feature, from
day one (this matters even more once a public demo org exists — see Public Demo Mode).

## Public Demo Mode (production-safe, no auth/API keys required)

The app ships a dedicated **demo organization** ("Vertex Technologies") with a fixed, seeded
dataset. Anonymous visitors hitting `/demo` are issued a short-lived, read-scoped session bound to
that organization's ID only — they can browse Dashboard, Projects, Project Details, Tasks, Gantt,
Resources, Risks, Budget, and Analytics, but every write endpoint rejects requests scoped to the
demo organization (`403 demo organizations are read-only`). Demo visitors can never query or
mutate any other organization's data — the same `organization_id` filter that protects real tenants
protects the demo tenant. Demo Mode requires no AI provider to be reachable: all Phase 1 pages are
computed from stored/seeded data via deterministic services (health score, cost forecast, resource
optimization — see PRODUCT_REQUIREMENTS.md), so the public site keeps working even before Phase 2's
AI layer exists, and continues working after Phase 2 if Gemini and Groq are both down.

## Deterministic core services (no AI, no randomness)

- **Health Score** (`app/services/health_score.py`): schedule/budget/task-completion/risk/resource/
  dependency penalties subtracted from 100. Formula documented in PRODUCT_REQUIREMENTS.md.
- **Cost Forecast** (`app/services/cost_forecast.py`): EVM-style baseline (`EAC = BAC / CPI`),
  explicitly labeled a transparent baseline model, never presented as ML.
- **Resource Optimization** (`app/services/resource_optimization.py`): explainable weighted
  ranking (skill match / availability / cost), not AI-generated.

## Build status

**Phase 1 (this build):** deterministic core only — auth, orgs, projects, tasks, milestones,
resources, risks, budgets, dashboard, Gantt, public Demo Mode. No AI code exists yet: no `ai_*`
tables, no AI router, no AI UI element of any kind (including disabled/placeholder ones — see
PROJECT_PLAN.md's "no fake functionality" rule).

**Not yet built** (see PROJECT_PLAN.md for the full phase breakdown): AI engineering layer,
document intelligence/RAG, consulting workspace, admin panel, notifications, audit logs, full
RBAC/permissions tables, reporting engine, test suite, CI, and app-level Docker images.
