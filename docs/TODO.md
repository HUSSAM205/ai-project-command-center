# Remaining Work

Status snapshot as of this commit. See `docs/PROJECT_PLAN.md` for the full phase breakdown and
acceptance criteria this list is derived from.

## Done

- **Phase 1 — Core platform**: auth, multi-tenancy, projects/tasks/milestones/resources/risks/
  budgets CRUD, deterministic health score / cost forecast / resource optimization, executive
  dashboard with live SSE metrics, Gantt/Kanban/risk-matrix/budget views, public read-only Demo
  Mode, seeded "Vertex Technologies" demo org.
- **App shell polish**: Linear/Vercel-grade density, hairline borders, Cmd+K command bar
  (extensible registry — see `frontend/lib/commands.ts` and `NAV_ITEMS` in
  `frontend/app/app/layout.tsx` for how to add entries), Framer Motion micro-interactions,
  landing-page bento grid.
- **Phase 2 — AI engineering layer (core)**: `AIProvider`/`GeminiProvider`/`GroqProvider`/
  `AIRouter` (circuit breaker, timeout/retry, Redis cache, rate limiting), Demo AI mode (fully
  real, data-driven — not a stub) so `/api/v1/ai/executive-brief`, `/api/v1/projects/{id}/
  ai-insights`, and `/api/v1/ai/assistant` all work today with **no API keys required**.

## Blocked on the user

- **Live Gemini/Groq calls**: the API keys pasted earlier in chat are compromised and were never
  used. Add freshly rotated keys to `backend/.env` (`GEMINI_API_KEY`, `GROQ_API_KEY`) — live calls
  activate automatically, no code changes needed. Until then the product correctly runs in Demo AI
  mode everywhere, including in production/public demo.

## Not started

- **AI Assistant UI / Executive Brief widget**: backend endpoints exist; no `/app/ai-assistant`
  page or dashboard "AI Management Brief" section yet.
- **Phase 3 — Document intelligence & RAG**: upload pipeline (PDF/DOCX/TXT), chunking, local
  `sentence-transformers` embeddings + `pgvector`, grounded Q&A with citations, `/app/documents`.
- **Phase 4 — AI Consulting Workspace**: `/app/consulting` — 6-dimension opportunity scoring,
  impact-vs-feasibility matrix, ROI calculator (formula given in spec §38), transformation roadmap
  generator.
- **Phase 5 — Admin, RBAC, security hardening**: full roles/permissions tables (today: a simple
  role string + read-only demo flag, not full RBAC), `/admin/*` (users, organizations, AI provider
  status/usage telemetry — `ai_requests` table already exists and is being populated, just has no
  UI yet — audit logs, feedback), notifications, CORS/header/file-validation hardening beyond the
  Phase 1 baseline.
- **Phase 6 — Reporting & analytics**: `/app/analytics`, `/app/reports`, one-click report
  generators (status/executive/risk/budget/AI-transformation/weekly).
- **Phase 7 — Quality & ops**: unit/integration/API/AI-failure/security test suite, GitHub Actions
  CI, backend + frontend Dockerfiles (docker-compose currently has postgres + redis only; app
  services not yet containerized), remaining docs (`AI_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`,
  `API_DOCUMENTATION.md`, `SECURITY.md`, `DEPLOYMENT.md`, `USER_STORIES.md` with 30+ stories,
  `TESTING.md`), risk register / milestone plan / roadmap artifacts.

## Known gaps / follow-ups

- Mobile hamburger-drawer interaction on the app shell was visually confirmed but not
  click-tested end-to-end (browser tooling limitation during that verification pass) — worth a
  manual pass on a phone-width viewport.
- Nav items (Sidebar + Command Bar) for AI Assistant, Documents, Consulting, Analytics, Reports,
  and Admin should be added only once each page is actually built, per this project's
  no-dead-links rule — do this as the last step of each corresponding phase above, not before.
