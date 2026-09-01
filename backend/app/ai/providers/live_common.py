"""Shared helpers for the live REST-backed providers (Gemini, Groq)."""


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
