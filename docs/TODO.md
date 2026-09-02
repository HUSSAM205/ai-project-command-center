# Remaining Work

Status snapshot as of this commit. See `docs/PROJECT_PLAN.md` for the full phase breakdown and
acceptance criteria this list is derived from.

## Done

- **Phase 1 — Core platform**: auth, multi-tenancy, projects/tasks/milestones/resources/risks/
  budgets CRUD, deterministic health score / cost forecast / resource optimization, executive
  dashboard with live SSE metrics, Gantt/Kanban/risk-matrix/budget views, public read-only Demo
  Mode, seeded "Vertex Technologies" demo org.
- **App shell**: Linear/Vercel-grade density, hairline borders, Cmd+K command bar, Framer Motion
  micro-interactions, landing-page bento grid.
- **Phase 2 — AI engineering layer**: `AIProvider`/`GeminiProvider`/`GroqProvider`/`AIRouter`
  (circuit breaker, timeout/retry, Redis cache, rate limiting), Demo AI mode (fully real,
  data-driven), Executive Brief dashboard widget, `/app/ai-assistant` chat UI. Live Gemini/Groq
  calls are dormant pending rotated API keys (see below) but architecturally complete.
- **Phase 3 — Document intelligence & RAG**: upload pipeline (PDF/DOCX/TXT), local
  `sentence-transformers` embeddings + `pgvector`, structured extraction, grounded Q&A with
  citations, `/app/documents`.
- **Phase 4 — AI Consulting Workspace**: `/app/consulting` — business case intake, 6-dimension
  deterministic opportunity scoring, impact/feasibility matrix, ROI calculator, AI-narrated
  5-phase transformation roadmap.
- **Phase 5 — Admin, RBAC, security hardening**: `role_permissions`-based RBAC, `audit_logs` +
  `feedback` tables (audit wired into all major write paths and AI dispatches), `/admin/*`
  (users, organizations, AI provider status, AI usage, audit log, feedback), security headers
  middleware.
- **Phase 6 — Reporting & analytics**: `/app/analytics` (budget burn trend, task-completion
  trend, honestly-labeled point-in-time risk snapshot), `/app/reports` (6 report types, print
  view).

## Blocked on the user

- **Live Gemini/Groq calls**: the API keys pasted in chat earlier are compromised and were never
  used anywhere. Add freshly rotated keys to `backend/.env` (`GEMINI_API_KEY`, `GROQ_API_KEY`) —
  live calls activate automatically, no code changes needed. The product runs correctly in Demo
  AI mode everywhere until then, including in production/public demo.

## Not started — Phase 7 (Quality & Ops)

- Unit/integration/API/AI-failure/security test suite.
- GitHub Actions CI.
- Backend + frontend Dockerfiles (docker-compose currently has postgres + redis only).
- Remaining docs: `AI_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`,
  `SECURITY.md`, `DEPLOYMENT.md`, `USER_STORIES.md` (30+ stories), `TESTING.md`.
- Risk register / milestone plan / roadmap artifacts (project-management-of-the-project docs).

## Known gaps / follow-ups

- Mobile hamburger-drawer interaction was verified correct via source review (click-testing was
  blocked by a reproducible Browser-pane tool limitation on this environment, not an app issue).
- The Browser preview tool intermittently returns blank/tiled screenshots on a few pages (landing
  page, mobile viewport, Consulting roadmap tab) — confirmed via DOM/page-text inspection each
  time that this is a capture artifact, not a real rendering bug. Worth a manual look if it
  recurs, but not a blocker.
