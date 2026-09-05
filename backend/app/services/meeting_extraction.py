"""Heuristic structured extraction over a raw meeting transcript -- used by
DemoAIProvider.parse_meeting_transcript (see app/ai/providers/demo.py). Same philosophy as
app/services/document_extraction.py: no LLM call, no invention. Every decision/risk returned is
a near-verbatim line from the actual transcript, and every action-item field (owner/priority/
due_date/estimated_hours) is either genuinely detected in the text or left null -- never guessed.

A live provider (Gemini/Groq) does the equivalent extraction via a prompt instead -- see
app/ai/prompts/meeting_intelligence.py.
"""

import re
from datetime import date, datetime, timedelta

from app.models.enums import Priority, RiskCategory

_DECISION_KEYWORDS = [
    "decided", "decision:", "agreed to", "agreed that", "we will proceed with",
    "approved", "resolved to", "final decision", "consensus was", "we're going with",
    "we are going with",
]

_ACTION_KEYWORDS = [
    "action item", "action:", "will own", "responsible for", "assigned to",
    "to do:", "todo:", "follow up", "will complete", "next step", "will draft",
    "will send", "will follow up", "will prepare", "will schedule", "will reach out",
]

_RISK_KEYWORDS = [
    "risk", "concern", "concerned about", "issue", "delay", "may not", "threat",
    "at risk", "jeopardize", "blocker", "could slip", "worried about", "may impact",
]

_OWNER_INLINE_RE = re.compile(
    r"\b(?:owner|assigned to|assignee)\s*:?\s*([A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-]+)?)", re.IGNORECASE
)
_WILL_OWNER_RE = re.compile(r"\b([A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-]+)?)\s+will\b")
# Common sentence-leading words that match the "capitalized word(s) + will" shape but are never
# a real owner name ("We will follow up" should not extract an owner called "We").
_OWNER_STOPWORDS = {
    "we", "i", "they", "it", "this", "that", "he", "she", "you", "the", "team",
    "everyone", "someone", "who", "there",
}
_DUE_INLINE_RE = re.compile(r"\bdue\s*:?\s*([^,;.\n]+)", re.IGNORECASE)
_BY_RE = re.compile(
    r"\bby\s+(next\s+)?("
    r"today|tomorrow|end of (?:day|week|month)|"
    r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4}|"
    r"jan\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|feb\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|"
    r"mar\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|apr\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|"
    r"may\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|jun\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|"
    r"jul\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|aug\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|"
    r"sep\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|oct\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|"
    r"nov\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|dec\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?"
    r")",
    re.IGNORECASE,
)
_EFFORT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?)\b", re.IGNORECASE)

_PRIORITY_CRITICAL_KEYWORDS = ["urgent", "asap", "critical", "immediately"]
_PRIORITY_HIGH_KEYWORDS = ["high priority", "important", "top priority"]
_PRIORITY_LOW_KEYWORDS = ["low priority", "minor", "nice to have", "whenever"]

_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

_RISK_CATEGORY_KEYWORDS: list[tuple[RiskCategory, list[str]]] = [
    (RiskCategory.SCHEDULE, ["schedule", "timeline", "deadline", "late", "behind", "slip"]),
    (RiskCategory.BUDGET, ["budget", "cost", "over budget", "expensive", "spend"]),
    (RiskCategory.RESOURCE, ["resource", "staffing", "bandwidth", "capacity", "headcount"]),
    (RiskCategory.TECHNICAL, ["technical", "bug", "integration", "architecture", "infrastructure"]),
    (RiskCategory.SECURITY, ["security", "breach", "vulnerab", "compliance", "audit"]),
    (RiskCategory.DEPENDENCY, ["depend", "blocked by", "waiting on", "blocker"]),
    (RiskCategory.EXTERNAL, ["vendor", "third-party", "third party", "client", "external"]),
]

_MAX_ITEMS_PER_CATEGORY = 15


def _split_lines(transcript: str) -> list[str]:
    """Meeting transcripts are usually one thought per line ("Speaker: sentence."), unlike a
    prose document -- so lines are the primary unit, further split into sentences only when a
    single line clearly bundles more than one ("Sarah: We approved the budget. Also, the launch
    date may slip.")."""
    lines: list[str] = []
    for raw_line in transcript.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # Strip a leading "Speaker Name:" turn marker so keyword/owner matching runs on the
        # actual utterance, not the speaker label.
        line = re.sub(r"^[A-Z][\w .'\-]{0,40}:\s*", "", line)
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", line) if s.strip()]
        lines.extend(sentences or [line])
    return lines


def _dedupe(items: list[str], limit: int = _MAX_ITEMS_PER_CATEGORY) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def _next_weekday(today: date, target_idx: int, force_next_week: bool) -> date:
    days_ahead = (target_idx - today.weekday()) % 7
    if force_next_week and days_ahead < 7:
        days_ahead += 7
    return today + timedelta(days=days_ahead)


def _end_of_month(today: date) -> date:
    next_month = today.replace(day=28) + timedelta(days=4)
    return next_month - timedelta(days=next_month.day)


def resolve_date_phrase(phrase: str, today: date) -> date | None:
    """Real, computed date resolution from an actual `today` -- never a fabricated date. Returns
    None (rather than guessing) for anything not confidently recognized."""
    p = phrase.strip().lower().rstrip(".,;)")
    if not p:
        return None

    m = re.match(r"(\d{4})-(\d{2})-(\d{2})$", p)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None

    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})$", p)
    if m:
        month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if year < 100:
            year += 2000
        try:
            return date(year, month, day)
        except ValueError:
            return None

    if "end of month" in p:
        return _end_of_month(today)
    if "end of week" in p:
        return _next_weekday(today, 4, force_next_week=False)  # Friday
    if "end of day" in p or p == "today":
        return today
    if "tomorrow" in p:
        return today + timedelta(days=1)

    force_next = p.startswith("next ")
    for idx, name in enumerate(_WEEKDAYS):
        if name in p:
            return _next_weekday(today, idx, force_next)

    for fmt in ("%B %d %Y", "%B %d, %Y", "%b %d %Y", "%b %d, %Y", "%B %d", "%b %d"):
        try:
            parsed = datetime.strptime(p.title().replace(".", ""), fmt)
            year = parsed.year if "%Y" in fmt else today.year
            return date(year, parsed.month, parsed.day)
        except ValueError:
            continue
    return None


def _detect_owner(sentence: str) -> str | None:
    m = _OWNER_INLINE_RE.search(sentence)
    if m:
        return m.group(1).strip()
    m = _WILL_OWNER_RE.search(sentence)
    if m and m.group(1).strip().lower() not in _OWNER_STOPWORDS:
        return m.group(1).strip()
    return None


def _detect_due_date(sentence: str, today: date) -> date | None:
    m = _DUE_INLINE_RE.search(sentence)
    if m:
        resolved = resolve_date_phrase(m.group(1), today)
        if resolved:
            return resolved
    m = _BY_RE.search(sentence)
    if m:
        phrase = (m.group(1) or "") + m.group(2)
        return resolve_date_phrase(phrase, today)
    return None


def _detect_priority(sentence: str) -> Priority:
    lowered = sentence.lower()
    if any(kw in lowered for kw in _PRIORITY_CRITICAL_KEYWORDS):
        return Priority.CRITICAL
    if any(kw in lowered for kw in _PRIORITY_HIGH_KEYWORDS):
        return Priority.HIGH
    if any(kw in lowered for kw in _PRIORITY_LOW_KEYWORDS):
        return Priority.LOW
    return Priority.MEDIUM


def _detect_effort_hours(sentence: str) -> float | None:
    m = _EFFORT_RE.search(sentence)
    if not m:
        return None
    value = float(m.group(1))
    unit = m.group(2).lower()
    if unit.startswith("day"):
        value *= 8.0  # same 8h/business-day convention as this app's resource-capacity model
    return value


def _classify_risk_category(sentence: str) -> RiskCategory:
    lowered = sentence.lower()
    for category, keywords in _RISK_CATEGORY_KEYWORDS:
        if any(kw in lowered for kw in keywords):
            return category
    return RiskCategory.OPERATIONAL


_TITLE_STRIP_PATTERNS = [
    re.compile(r"^(action item|action|to-?do)\s*:?\s*", re.IGNORECASE),
    re.compile(r",?\s*\b(?:owner|assigned to|assignee)\s*:?\s*[A-Za-z][a-zA-Z'\-]+(?:\s[A-Za-z][a-zA-Z'\-]+)?", re.IGNORECASE),
    re.compile(r",?\s*\bdue\s*:?\s*[^,.\n]+", re.IGNORECASE),
    re.compile(
        r",?\s*\bby\s+(?:next\s+)?(?:today|tomorrow|end of (?:day|week|month)|"
        r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
        r"\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4}|[a-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)\b",
        re.IGNORECASE,
    ),
    re.compile(r",?\s*\b(?:high|low|critical|urgent)\s+priority\b", re.IGNORECASE),
    re.compile(r",?\s*\bpriority\s*:?\s*(?:low|medium|high|critical)\b", re.IGNORECASE),
    re.compile(r",?\s*(?:(?:this should take|roughly|about|approximately)\s*)*~?\d+(?:\.\d+)?\s*(?:hours?|hrs?|days?)\b", re.IGNORECASE),
]


def _clean_action_title(sentence: str) -> str:
    """Strips a leading explicit marker ("Action item:", "TODO:") plus any inline owner/due/
    priority/effort modifier clauses already pulled out into their own structured fields, so the
    stored task title reads as a real title rather than repeating that metadata."""
    cleaned = sentence
    for pattern in _TITLE_STRIP_PATTERNS:
        cleaned = pattern.sub("", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ,.")
    if not cleaned:
        return sentence.strip()
    return cleaned[0].upper() + cleaned[1:]


def extract_meeting_intelligence(transcript: str, today: date | None = None) -> dict:
    """Single entry point used by DemoAIProvider.parse_meeting_transcript. Returns plain data --
    the caller turns it into an AIResponse."""
    today = today or date.today()
    lines = _split_lines(transcript)

    decisions: list[str] = []
    action_items: list[dict] = []
    risks: list[dict] = []

    for sentence in lines:
        lowered = sentence.lower()
        is_action = any(kw in lowered for kw in _ACTION_KEYWORDS)
        is_decision = not is_action and any(kw in lowered for kw in _DECISION_KEYWORDS)
        # Mutually exclusive with is_action -- an "action item: ... risk register ..." sentence is
        # a task, not a risk mention; without this, generic risk keywords ("risk", "issue") that
        # merely appear inside an action item's own wording (e.g. "update the risk register")
        # would double-classify it as a risk too.
        is_risk = not is_action and any(kw in lowered for kw in _RISK_KEYWORDS)

        if is_action:
            action_items.append(
                {
                    "title": _clean_action_title(sentence),
                    "owner_name": _detect_owner(sentence),
                    "priority": _detect_priority(sentence).value,
                    "due_date": (_detect_due_date(sentence, today) or None),
                    "estimated_hours": _detect_effort_hours(sentence),
                    "source_line": sentence,
                }
            )
        elif is_decision:
            decisions.append(sentence)

        if is_risk:
            risks.append({"description": sentence, "category": _classify_risk_category(sentence).value})

    # Serialize dates to ISO strings for the JSON-shaped AIResponse.data contract (every other
    # AIResponse.data value in this app is JSON-primitive -- see document_extraction.py's dates).
    for item in action_items:
        if item["due_date"] is not None:
            item["due_date"] = item["due_date"].isoformat()

    decisions = _dedupe(decisions)
    seen_action_titles: set[str] = set()
    deduped_actions: list[dict] = []
    for item in action_items:
        key = item["title"].lower()
        if key in seen_action_titles:
            continue
        seen_action_titles.add(key)
        deduped_actions.append(item)
        if len(deduped_actions) >= _MAX_ITEMS_PER_CATEGORY:
            break
    seen_risk_desc: set[str] = set()
    deduped_risks: list[dict] = []
    for item in risks:
        key = item["description"].lower()
        if key in seen_risk_desc:
            continue
        seen_risk_desc.add(key)
        deduped_risks.append(item)
        if len(deduped_risks) >= _MAX_ITEMS_PER_CATEGORY:
            break

    return {
        "decisions": decisions,
        "action_items": deduped_actions,
        "risks_identified": deduped_risks,
    }
