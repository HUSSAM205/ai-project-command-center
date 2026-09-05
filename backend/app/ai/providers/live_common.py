"""Shared helpers for the live REST-backed providers (Gemini, Groq)."""

import json

from app.ai.exceptions import AIProviderError


def parse_json_object(text: str) -> dict:
    """Strict JSON is asked for (see app/ai/prompts/meeting_intelligence.py), but a model will
    sometimes still wrap it in a markdown code fence -- strip that if present, then parse. Raises
    AIProviderError (never a bare JSON error) on anything that isn't valid JSON, so AIRouter's
    existing per-provider fallback chain handles it the same way as a network failure -- falling
    through to the next live provider, then to DemoAIProvider's heuristic parser -- rather than
    ever surfacing a 500 to the caller."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped[:4].lower() == "json":
            stripped = stripped[4:]
        stripped = stripped.strip()
    try:
        parsed = json.loads(stripped)
    except (TypeError, ValueError) as exc:
        raise AIProviderError(f"provider returned non-JSON response: {text[:200]}") from exc
    if not isinstance(parsed, dict):
        raise AIProviderError(f"provider returned a JSON value that isn't an object: {text[:200]}")
    return parsed


def parse_summary_and_detail(text: str, max_summary_len: int = 400) -> tuple[str, str]:
    """Both live prompts instruct the model to start its reply with "SUMMARY: <...>".
    Pull that line out as the short `summary` field; the full text is always the `detail`.
    Falls back to truncating the first line if the model didn't follow the instruction  - 
    never raises on an unexpected shape, since a slightly-off summary is fine but a 500 isn't.
    """
    stripped = text.strip()
    if not stripped:
        return "(empty response from provider)", stripped

    first_line = stripped.splitlines()[0].strip()
    if first_line.upper().startswith("SUMMARY:"):
        summary = first_line.split(":", 1)[1].strip() or stripped[:max_summary_len]
    else:
        summary = first_line[:max_summary_len]
    return summary, stripped
