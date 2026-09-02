# Remaining Work

All 7 phases of the master specification are built, verified end-to-end, and committed. This
file now tracks what's genuinely left, not a phase checklist.

## Blocked on the user

- **Live Gemini/Groq calls**: the API keys pasted in chat early in this project are compromised
  and were never used anywhere in the codebase. Add freshly rotated keys to `backend/.env`
  (`GEMINI_API_KEY`, `GROQ_API_KEY`) — live calls activate automatically, no code changes
  needed. The product runs correctly in Demo AI mode everywhere until then, including in
  production/public demo — this is a real, permanent feature, not a placeholder.

## Known gaps (documented honestly in docs/SECURITY.md, not hidden)

- The `role_permissions` catalog seeded in the Phase 5 migration covers `project.write`,
  `task.write`, `risk.write`, `budget.write`, and `document.upload` as permission keys, but only
  `admin.access` is actually enforced via `require_permission` today — the rest of the catalog
  is wired for future use, not yet gating those specific routers. `require_write_access`
  (demo-read-only enforcement) is unrelated and fully enforced everywhere.
- No 2FA, no SSO/OAuth — JWT email/password only, per the original Phase 1 scope.
- The Browser preview tool used during this build intermittently returns blank/tiled screenshots
  on a few pages (confirmed via DOM/page-text inspection each time to be a capture artifact, not
  a real rendering bug) — not an app issue, just a note for future verification passes.

## Natural next steps (not required, not started)

- Wire the seeded `role_permissions` catalog into the domain routers it already covers, so
  non-admin write permissions are enforced as granularly as `admin.access` already is.
- Risk register / milestone plan / roadmap-of-the-project artifacts (project-management-of-this-
  project docs, distinct from the product's own risk/roadmap features).
- Production deployment (Vercel/managed Postgres/secrets manager) — `docs/DEPLOYMENT.md`
  documents what this would need without claiming it's done.
