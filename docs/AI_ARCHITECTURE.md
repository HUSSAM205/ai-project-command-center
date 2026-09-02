# AI Architecture

Covers the Phase 2 AI engineering layer: `backend/app/ai/`. This is the only place in the
codebase that talks to an external AI provider — every AI-touching API endpoint goes through
it, and nothing else in the app calls Gemini/Groq directly.

## Design goal

The product must be fully usable, in production, with **zero** AI providers configured or
reachable. Every AI-touching endpoint always returns a real, schema-validated response — never
a 500, never a "service unavailable" for the caller. What differs is *how honest* the response
is about its own provenance (`AIResponse.source`), never whether one comes back at all. See
`docs/ARCHITECTURE.md`'s "Public Demo Mode" section for why this matters: the public `/demo`
site runs entirely on this fallback behavior.

## Component map

```
frontend
   |  REST calls only (never holds an API key)
   v
FastAPI endpoint (app/api/ai.py, projects.py::ai-insights, documents.py::ask,
                   reports.py, consulting.py::roadmap)
   |
   v
app/ai/context.py            builds a plain dict from real DB-backed data
   |                          (health score breakdown, forecast, risks, tasks, resources —
   |                          never free text where the shape is already known)
   v
AIRouter.dispatch()  (app/ai/router.py)
   |
   |-- 1. GeminiProvider   (if configured + circuit closed)
   |-- 2. GroqProvider     (if configured + circuit closed)
   |-- 3. Redis cache      (last successful live response for this exact request)
   `-- 4. DemoAIProvider   (unconditional, never fails)
   |
   v
AIResponse { summary, detail, confidence, source, data, prompt_version }
```

`AIProvider` (`app/ai/base.py`) is the shared abstract interface all four "providers" implement
(`GeminiProvider`, `GroqProvider`, `DemoAIProvider` — plus the same interface shape informally
followed by cache reads). Every method takes a structured `context: dict` (built once per
request by `app/ai/context.py`) and returns an `AIResponse` — the two live providers turn that
context into a prompt (via `app/ai/prompts/*`) and parse the model's text back into
`summary`/`detail`; `DemoAIProvider` turns the same context directly into readable prose with no
model call at all.

## The fallback chain, in order

`AIRouter.dispatch()` (`app/ai/router.py`) tries, in this order, stopping at the first success:

1. **Gemini** (`GeminiProvider`, `app/ai/providers/gemini.py`) — real REST calls to
   `generativelanguage.googleapis.com` (no SDK, plain `httpx`), only attempted if
   `is_available()` is true (i.e. `GEMINI_API_KEY` is set) and the circuit breaker is closed.
2. **Groq** (`GroqProvider`, `app/ai/providers/groq.py`) — same shape, gated on `GROQ_API_KEY`.
3. **Redis cache** — if both live providers are unavailable/failed, the last successful response
   for the *exact same request* (see cache key below) is served if present and unexpired.
4. **Demo AI** (`DemoAIProvider`, `app/ai/providers/demo.py`) — the unconditional final
   fallback. Makes no network call, ever; it is a first-class product feature (Demo Mode), not a
   stub — it assembles real, already-computed numbers (health score breakdowns, cost forecasts,
   seeded risks/tasks/resources) into honest prose. Because this step can never fail, `dispatch()`
   always returns a value — callers never handle a "no AI available" case.

`AIResponse.source` is always one of `"gemini" | "groq" | "cache" | "demo_ai"`, set truthfully by
whichever step actually produced the response, so the frontend can render an honest
`AISourceBadge` next to any AI-generated content instead of implying every answer came from a
live model.

## Reliability behavior (per live-provider attempt)

Defined as module constants at the top of `app/ai/router.py`:

- **Timeout**: 20s per request, enforced inside each provider's own `httpx` client
  (`REQUEST_TIMEOUT_SECONDS` in `gemini.py`/`groq.py`).
- **Retry**: up to `MAX_RETRIES = 2` retries with backoff `RETRY_BACKOFF_SECONDS = [1, 2]`
  seconds, inside `AIRouter._call_provider`.
- **Circuit breaker** (`_CircuitState`, per provider): `CIRCUIT_FAILURE_THRESHOLD = 3`
  consecutive failures opens the circuit for `CIRCUIT_COOLDOWN_SECONDS = 60.0`; once the cooldown
  elapses, exactly one retest is allowed (`_circuit_available` resets `failures` and
  `opened_until` as a side effect of that retest, not proactively). Circuit state is
  in-process/per-provider, held on the `AIRouter` singleton (`get_ai_router`, `@lru_cache`) — it
  is not persisted to Redis or shared across worker processes.
- Admin introspection (`AIRouter.provider_status()`, backing `GET /api/v1/admin/ai-providers`)
  deliberately does **not** call `_circuit_available` — it snapshots `opened_until`/`failures`
  read-only so that an admin status check can never itself flip a breaker back closed.

## Caching

Redis-backed, in `AIRouter._cache_get`/`_cache_set`:

- **Key**: `ai:cache:{organization_id}:{method_name}:{sha256(json({"m": method_name, "c": context}))}`
  — `organization_id` is baked directly into the key string (not just hashed into the payload),
  so a bug elsewhere can never cause one org's cached AI answer to leak to another org.
- **TTL**: 30 minutes (`CACHE_TTL_SECONDS`) — long enough to be useful within a session, short
  enough that a stale answer doesn't linger once the underlying project data has changed.
- A cache hit sets `AIResponse.source = "cache"` before returning it.
- Any Redis error on a cache read/write is swallowed (`except redis_lib.RedisError`) — a down
  cache degrades to "always fall through to Demo AI", never a request failure.

## Rate limiting

A Redis fixed-window counter, one window per calendar hour (`time.strftime("%Y%m%d%H")`), keyed
by `ai:ratelimit:{organization_id}:{user_id}:{window}`:

- **5 requests/hour** for read-only (anonymous/demo-scoped) tokens.
- **20 requests/hour** for authenticated tokens.
- Enforced by `AIRouter.enforce_rate_limit`, called from `app/api/ai.py` before `dispatch()`.
- **Fails open**: if Redis itself is unreachable, the limiter logs a warning and allows the
  request rather than blocking AI endpoints entirely — a down cache should degrade the AI layer,
  not take it offline.
- Exceeding the limit raises `HTTPException(429)` with a message naming the limit.

## Every dispatch is logged

`AIRouter.dispatch()` writes one row to `ai_requests` (via
`app.repositories.ai_requests.log_ai_request`) on every call — success or failure — in a
`finally` block, recording `organization_id`, `endpoint`, `provider_used`
(`"gemini" | "groq" | "cache" | "demo_ai" | "none"`), `success`, and `latency_ms`. This is the
same table `GET /api/v1/admin/ai-usage` aggregates for the Phase 5 admin AI Usage view — not a
separate/duplicated tracking mechanism.

## Demo AI mode — why it exists, and why it's real

`DemoAIProvider` is not a "coming soon" placeholder or a hardcoded canned response. It builds its
prose from the exact same computed data a live model would have been given — health score
component breakdowns (`app/services/health_score.py`), EVM cost forecasts
(`app/services/cost_forecast.py`), the actual seeded/entered risks, blocked tasks, and overloaded
resources — via the shared helper logic in `demo.py` (`_top_penalty_reasons`,
`_recommend_action`). For document Q&A (`answer_document_question`) it returns the top-k
retrieved chunk excerpts verbatim rather than synthesizing free text, since there is no model to
synthesize with — it is explicit about that in the response detail text. `analyze_document`
(structured extraction) reuses `app/services/document_extraction.py`'s regex/heuristic extraction
rather than fabricating findings.

This exists because:
1. **Public Demo Mode has no user-supplied API keys** (`docs/ARCHITECTURE.md`) — anonymous
   `/demo` visitors must get a fully working, data-driven AI experience with zero secrets in the
   deployment.
2. **Gemini/Groq calls are dormant by default** in this repo today (`docs/TODO.md` — the API keys
   pasted in chat earlier were compromised and never used; live calls activate automatically the
   moment real, freshly-rotated keys are added to `backend/.env`, no code changes required) — so
   Demo AI mode is what every reviewer of this codebase actually sees running, not a fallback
   path that's rarely exercised.
3. It is the terminal step of the fallback chain for everyone, demo or not — a live-key
   deployment still lands here if both Gemini and Groq are down.

## Prompt versioning

`backend/app/ai/prompts/` holds one module per AI capability — `project_health.py`,
`risk_analysis.py`, `executive_summary.py`, `summarize.py`, `document_analysis.py`,
`document_qa.py`, `assistant_qa.py`. Each module exports:

- `PROMPT_VERSION` — a plain string (`"v1"` today for all of them), stamped onto every
  `AIResponse.prompt_version` returned for that capability, live or demo. Bumping the prompt
  template's wording later means bumping this string, so responses generated under different
  prompt revisions are distinguishable in `ai_requests`/UI without re-deriving it from the prompt
  text itself.
- `TEMPLATE` (live providers only) — an f-string-style `.format()` template with named
  placeholders that match the context dict's keys exactly (e.g. `project_health.py`'s template
  consumes `project_name`, `status`, `progress`, `breakdown`, `forecast`, `top_risks`, …).
- `build_prompt(context: dict) -> str` — does `TEMPLATE.format(**context)`; this is the one
  function `GeminiProvider`/`GroqProvider` call before making the live request.

Every prompt template instructs the model to use **only** the data given and never invent
numbers, and explicitly states that scores/forecasts are already computed deterministically
upstream (e.g. `project_health.py`: "do not recompute or contradict them") — the model's job is
narration, never computation, of anything the deterministic services already own.

`DemoAIProvider` imports the same prompt modules purely to read `PROMPT_VERSION` off them
(`from app.ai.prompts import project_health, ...`) — it never calls `build_prompt`, since it
never sends a prompt to a model, but it stamps the identical version string so a UI or analytics
query can't tell which fallback tier produced a response just by looking at `prompt_version`.

## What the frontend never sees

Per `docs/ARCHITECTURE.md`: `GEMINI_API_KEY`/`GROQ_API_KEY` live only in `backend/.env`
(`app/core/config.py::Settings`), read server-side, and are never returned in any API response.
The frontend's only AI-related signal is `AIResponse.source`/`confidence`, used purely for
display (the `AISourceBadge` pattern referenced throughout `demo.py`'s docstrings).
