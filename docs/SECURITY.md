# Security

Honest account of what's implemented, where the enforcement lives in code, and what's
deliberately not done yet. Per this project's own stated ethos ("no fake claims" —
`docs/PROJECT_PLAN.md`), the gaps section below is not aspirational filler.

## Multi-tenancy isolation

Every domain table is scoped by `organization_id`, either directly or via its parent project
(see `docs/DATABASE_SCHEMA.md`). The enforcement point is **`app/core/deps.py`**:
`CurrentPrincipal.organization_id` is decoded from the JWT and never accepted from client input
(query params, path params, or request bodies). Every repository function and route handler
filters by `principal.organization_id` — a route that instead trusted a client-supplied org id
would be a bug, not a variant behavior.

Two places this is worth calling out explicitly:
- **`/admin/*`** — even an `ADMIN`-role user only ever sees their own organization's data
  (`app/api/admin.py::get_own_organization`'s docstring: "an ADMIN role is still scoped to its
  own `organization_id`, same as every other endpoint"). There is no cross-org admin view.
- **Demo Mode** — the same `organization_id` filter that isolates real tenants isolates the demo
  tenant too; a demo session's token is hard-bound to the seeded demo org's id at issuance
  (`app/api/demo.py`), so a demo visitor cannot query or mutate any other organization's data
  through any endpoint.

## Demo-mode read-only enforcement

`POST /demo/session` issues a JWT with `role="VIEWER"`, `read_only=true`, 2-hour expiry, and no
credentials. `app.core.deps.require_write_access` checks `principal.read_only` and raises
`403 demo organizations are read-only` before any mutating handler body runs — this guard sits on
every `POST`/`PATCH`/`DELETE` route in the core PM and consulting domains. Two deliberate
exceptions, both non-mutating and both explained in their own route's docstring:
`POST /consulting/business-cases/{id}/roi` (a pure calculation, not persisted) and
`POST /feedback` (feedback submission is intentionally open to anonymous demo visitors, gated
only by `get_current_principal`, not `require_write_access`).

## RBAC

Two layers, additive:
1. **Role check** (`app.core.deps.require_role`) — coarse, matches `CurrentPrincipal.role`
   against a fixed set of role names. Not currently used by any live route (available for future
   wiring).
2. **Permission check** (`app.core.deps.require_permission`) — backed by the real
   `permissions`/`role_permissions` tables (see `docs/DATABASE_SCHEMA.md`), seeded by the
   `c3d4e5f6a7b8` migration itself so RBAC works on a fresh checkout with no seed script run.
   Today this gates exactly one surface: `require_permission("admin.access")` on all of
   `/admin/*`. The rest of the seeded permission catalog (`project.write`, `task.write`,
   `risk.write`, `budget.write`, `document.upload`) exists in the database and is ready for
   future routers to adopt, but **is not currently enforced anywhere** — write access to
   projects/tasks/risks/budgets/documents today is gated only by `require_write_access` (i.e.
   "authenticated and not a demo session"), not by role or the fine-grained permission it's
   named after. Treat the permission catalog as seeded-but-not-yet-wired outside `admin.access`.

## JWT handling

`app/core/security.py`: HS256, signed with `JWT_SECRET` (a required env var — the app fails to
start without one, see `app/core/config.py::Settings`). Payload: `sub` (user id or the literal
string `"demo"`), `organization_id`, `role`, `read_only`, `iat`, `exp`. Default expiry 24h
(`JWT_EXPIRES_MINUTES=1440`), shortened to 2h for demo sessions. No refresh-token flow exists —
a token is a bearer credential valid until its own `exp`.

Known gaps: no token revocation/blocklist (a leaked token is valid until it expires, full stop);
no refresh tokens (re-login is the only way to extend a session); `JWT_SECRET` is a single static
secret with no rotation mechanism.

## Password handling

`bcrypt` via `passlib.CryptContext` (`app/core/security.py::hash_password`/`verify_password`).
No password complexity policy is enforced server-side beyond what the frontend form requires (not
audited here) and no rate limiting on login attempts — see gaps below.

## Security headers

`app.core.middleware.SecurityHeadersMiddleware`, applied globally in `main.py`, sets on every
response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`. Explicitly documented in its own docstring as
"a sane default for the app itself" — **not** a substitute for CSP/HSTS at a reverse-proxy/CDN
layer in a real production deployment, which this repo does not provide (see `docs/DEPLOYMENT.md`
for what a production deploy would still need).

## CORS

`main.py`: `CORSMiddleware` with `allow_origins=settings.CORS_ORIGINS` (default
`["http://localhost:3000"]`) plus, only when `ENVIRONMENT=development`, an
`allow_origin_regex=r"http://localhost:\d+"` so any local dev port works without reconfiguring
`.env` on every port change. That regex fallback is development-only by construction — it does
not apply when `ENVIRONMENT` is anything else. `allow_credentials=True`, all methods/headers
allowed.

## File upload validation (Document Intelligence, Phase 3)

`app/services/document_parser.py::detect_file_type` — validates by **actual file bytes**, not
just the declared `Content-Type` or filename extension:
- Rejects empty files and anything over 20MB (`MAX_FILE_SIZE_BYTES`).
- PDF: must start with the `%PDF-` magic bytes.
- DOCX: must start with the ZIP magic bytes (`PK\x03\x04`) *and* successfully open as a real
  Word document via `python-docx` — a same-signature zip that isn't actually a `.docx` (e.g. a
  renamed `.xlsx`/`.pptx`/plain `.zip`) is rejected, not silently mis-parsed.
- Legacy binary `.doc`/`.xls` (OLE magic bytes) are explicitly detected and rejected with a clear
  message rather than failing deep inside a parser.
- Anything that doesn't match a known signature is rejected (`UnsupportedFileError` → `415`).

Storage: `app/services/document_storage.py::save_upload` strips path components from the
filename, replaces unsafe characters, and writes under
`backend/uploads/<organization_id>/<uuid>_<safe_filename>` (org-namespaced, gitignored, local
disk only — never a cloud bucket per Phase 3 scope). Upload is gated behind
`require_write_access`, so demo/read-only sessions get `403`, not a partially-processed upload.

## AI-layer security posture

Covered in full in `docs/AI_ARCHITECTURE.md`; the security-relevant points:
- `GEMINI_API_KEY`/`GROQ_API_KEY` are read server-side only (`app/core/config.py`) and never
  appear in any API response — the frontend never holds or sees a provider key.
- Rate limiting (5/hr anonymous, 20/hr authenticated, per org+user, Redis fixed-window) protects
  both cost and abuse — see `AIRouter.enforce_rate_limit`.
- The Redis cache key bakes `organization_id` directly into the key string (not just hashed into
  the payload), so a bug elsewhere cannot cause one org's cached AI answer to be served to
  another org.
- Every prompt template instructs the model to use only the supplied structured data and never
  invent numbers — a soft mitigation against hallucinated figures, not a hard guarantee about
  live-provider output.

## Audit logging

`app/services/audit.py::log_audit_event` — best-effort (never raises; failures are logged and
swallowed so a logging failure can never break the write it's recording), called from
login, project/task/risk create-or-update, budget transactions, document upload, every AI
dispatch, and admin reads. Not currently exposed to non-admin users (only `GET
/admin/audit-logs`, itself gated by `admin.access`).

## What's NOT yet done (honest gaps)

- **No 2FA / MFA.**
- **No SSO** (no OAuth/SAML/OIDC identity provider integration) — the only auth path is
  email+password against the `users` table.
- **No login rate limiting / brute-force protection** — `POST /auth/login` has no attempt
  throttling of its own (distinct from the AI-endpoint rate limiter, which is unrelated).
- **No token revocation** — a compromised JWT is valid until its `exp`, with no server-side
  blocklist.
- **No CSP or HSTS** — `SecurityHeadersMiddleware` covers a small fixed set of headers; a real
  deployment needs a reverse proxy/CDN layer providing these (see `docs/DEPLOYMENT.md`).
- **No fine-grained write permissions outside `/admin/*`** — as noted above, `project.write`/
  `task.write`/`risk.write`/`budget.write`/`document.upload` are seeded in `role_permissions` but
  not yet checked by their corresponding routers; any authenticated non-read-only user can write
  to any of those domains regardless of role.
- **No secrets manager integration** — `backend/.env` is a local, gitignored file; there is no
  Vault/AWS Secrets Manager/etc. integration in this codebase.
- **No dependency/vulnerability scanning wired into CI** — there is no CI pipeline yet at all
  (Phase 7, still open — see `docs/TODO.md`).
- **No per-request audit-log exposure to end users** — audit trail is admin-only today, with no
  "your account activity" self-service view.
