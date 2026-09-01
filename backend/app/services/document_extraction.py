"""Heuristic structured extraction over real parsed document text — used by
DemoAIProvider.analyze_document (see app/ai/providers/demo.py). No LLM call, no invention:
every item returned is a substring or near-verbatim sentence taken from the actual document
text, so the extraction is honest even without a live model.

A live provider (Gemini/Groq) does the equivalent extraction via a prompt instead — see
app/ai/prompts/document_analysis.py.
"""

import re

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")

_MONTHS = (
    "January|February|March|April|May|June|July|August|September|October|November|December|"
    "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
)

_DATE_PATTERNS = [
    re.compile(rf"\b(?:{_MONTHS})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{4}}\b", re.IGNORECASE),
    re.compile(rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:{_MONTHS})\.?,?\s+\d{{4}}\b", re.IGNORECASE),
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b"),
    re.compile(r"\bQ[1-4]\s+\d{4}\b", re.IGNORECASE),
]

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_MONEY_RE = re.compile(r"\$\s?[\d,]+(?:\.\d{2})?")

_REQUIREMENT_KEYWORDS = ["shall", "must", "required to", "requirement", "requires", "is required"]
_DELIVERABLE_KEYWORDS = ["deliverable", "will deliver", "provide the", "submit the", "produce a", "hand over"]
_DATE_CONTEXT_KEYWORDS = ["deadline", "due", "by ", "no later than", "date"]
_RISK_KEYWORDS = ["risk", "concern", "issue", "delay", "may not", "threat", "at risk", "jeopardize"]
_ACTION_KEYWORDS = [
    "action item",
    "responsible for",
    "assigned to",
    "will complete",
    "must complete",
    "next step",
    "to-do",
    "todo",
    "follow up",
]

_MAX_ITEMS_PER_CATEGORY = 6


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]


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


def _sentences_matching(sentences: list[str], keywords: list[str]) -> list[str]:
    matches = []
    for sentence in sentences:
        lowered = sentence.lower()
        if any(kw in lowered for kw in keywords):
            matches.append(sentence)
    return _dedupe(matches)


def find_dates(text: str) -> list[str]:
    found: list[str] = []
    for pattern in _DATE_PATTERNS:
        found.extend(m.group(0) for m in pattern.finditer(text))
    return _dedupe(found, limit=10)


def extract_important_dates(text: str, sentences: list[str]) -> list[dict]:
    """Pairs each found date with the sentence it appears in, so the date has context —
    never a bare date with no source."""
    dates = find_dates(text)
    out: list[dict] = []
    for date in dates:
        context = next((s for s in sentences if date in s), None)
        out.append({"date": date, "context": context or date})
    return out


def extract_requirements(sentences: list[str]) -> list[str]:
    return _sentences_matching(sentences, _REQUIREMENT_KEYWORDS)


def extract_deliverables(sentences: list[str]) -> list[str]:
    return _sentences_matching(sentences, _DELIVERABLE_KEYWORDS)


def extract_risks(sentences: list[str]) -> list[str]:
    return _sentences_matching(sentences, _RISK_KEYWORDS)


def extract_action_items(sentences: list[str]) -> list[str]:
    return _sentences_matching(sentences, _ACTION_KEYWORDS)


def find_missing_information(
    text: str, dates: list[str], requirements: list[str], deliverables: list[str], action_items: list[str]
) -> list[str]:
    """Honest gaps in what the document actually says — only flags something as missing
    when it is genuinely absent from the text, never a generic filler warning."""
    missing = []
    if not dates:
        missing.append("No explicit dates or deadlines were found in the document.")
    if not requirements:
        missing.append('No sentences using requirement language ("shall"/"must"/"required") were found.')
    if not deliverables:
        missing.append("No explicit deliverables were identified.")
    if not action_items:
        missing.append("No clearly assigned action items or owners were found.")
    if not _EMAIL_RE.search(text):
        missing.append("No point-of-contact email address was found.")
    if not _MONEY_RE.search(text):
        missing.append("No budget or cost figures were found.")
    return missing


def extract_structured_document_info(text: str) -> dict:
    """Single entry point used by DemoAIProvider.analyze_document. Returns everything as
    plain data — the caller (demo.py) turns it into an AIResponse."""
    sentences = split_sentences(text)
    dates = extract_important_dates(text, sentences)
    requirements = extract_requirements(sentences)
    deliverables = extract_deliverables(sentences)
    risks = extract_risks(sentences)
    action_items = extract_action_items(sentences)
    missing_information = find_missing_information(
        text, [d["date"] for d in dates], requirements, deliverables, action_items
    )
    return {
        "word_count": len(text.split()),
        "sentence_count": len(sentences),
        "requirements": requirements,
        "deliverables": deliverables,
        "important_dates": dates,
        "risks": risks,
        "action_items": action_items,
        "missing_information": missing_information,
    }
