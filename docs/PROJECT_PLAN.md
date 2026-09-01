# Project Plan

## Guiding rule

No phase ships a nav item, tab, or button for functionality that doesn't fully work yet. AI
features specifically must never appear as disabled/"coming soon" UI — they simply don't exist in
the product until their phase lands.

## Phases

- **Phase 1 — Core platform (current):** organizations/users/auth, projects, tasks (+dependencies),
  milestones, resources/allocations, risks, budgets. Deterministic health score, cost forecast,
  resource optimization. Executive dashboard, project detail, Gantt, Kanban, risk matrix, budget
  views. Public, read-only, isolated Demo Mode. Enterprise design system, light/dark mode.
- **Phase 2 — AI engineering layer:** `AIProvider` interface; Gemini + Groq adapters; `AIRouter`
  with timeout/retry/backoff, circuit breaker, cache, rate limiting; AI Assistant chat; Executive
  AI Brief; centralized/versioned prompts; schema-validated responses. Requires the user to supply
  freshly rotated API keys via a local, gitignored `backend/.env` — never via chat or source.
- **Phase 3 — Document intelligence + RAG:** upload/parse (PDF/DOCX/TXT), chunking, `pgvector`
  embeddings, semantic retrieval, grounded Q&A with source citations.
- **Phase 4 — Consulting workspace:** business-case intake, AI opportunity/use-case scoring,
  impact-vs-feasibility prioritization matrix, ROI calculator, transformation roadmap generator.
- **Phase 5 — Admin, RBAC, security hardening:** full roles/permissions tables, admin panel
  (users/orgs/AI providers/usage/system health/audit/feedback), notifications, audit logging, CORS/
  security headers/file-validation/multi-tenancy hardening beyond the Phase 1 baseline.
- **Phase 6 — Reporting & analytics:** `/app/analytics`, `/app/reports`, report generation
  (status/executive/risk/budget/AI-transformation/weekly).
- **Phase 7 — Quality & ops:** unit/integration/API/AI-failure/security test suites, GitHub Actions
  CI, app-level Dockerfiles + docker-compose services (backend/frontend, alongside the Phase 1
  postgres service), remaining docs (`AI_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`,
  `API_DOCUMENTATION.md`, `SECURITY.md`, `DEPLOYMENT.md`, `USER_STORIES.md` with 30+ stories,
  `TESTING.md`), risk register / milestone plan / roadmap artifacts.

## Phase 1 acceptance criteria

1. `alembic upgrade head` runs clean against the local Postgres (docker-compose).
2. Seed script produces org "Vertex Technologies" with 5 projects, 30+ tasks, 10+ risks, 10+
   resources, budgets, and milestones — internally consistent (e.g. a project marked `AT_RISK` has
   a computed health score that actually reflects that).
3. Backend and frontend dev servers both start clean with no errors.
4. Golden path works end-to-end in-browser: register/login (or enter via `/demo`) → dashboard KPIs
   are non-zero and derived from seeded data → project detail tabs render real data → task board and
   Gantt render and update state → risk matrix places seeded risks in the correct cells → budget
   page's forecast matches the documented EVM formula.
5. `/demo` is reachable with no login and no API key, and demo-scoped write attempts are rejected.
6. No secrets in git history; `.env` files are gitignored.
