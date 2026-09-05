"""Abstract base for all AI providers (live and demo).

Every method takes structured input (a plain dict built from real DB-backed data by
app/ai/context.py  -  never free text where the shape is already known) and returns a
schema-validated app.schemas.ai.AIResponse, always with an honest `source`.
"""

from abc import ABC, abstractmethod

from app.schemas.ai import AIResponse


class AIProvider(ABC):
    name: str

    @abstractmethod
    def is_available(self) -> bool:
        """Cheap, non-network check (e.g. "is an API key configured"). AIRouter only
        attempts a call when this is True, so a missing key never produces a failed
        network request."""

    @abstractmethod
    def generate_text(self, prompt: str, *, max_tokens: int = 1024, temperature: float = 0.3) -> str:
        """Low-level passthrough: a fully-built prompt string in, raw model text out.
        The structured methods below build their prompts from app/ai/prompts/* and call
        this; callers with already-known structure should prefer those instead."""

    @abstractmethod
    def analyze_project(self, context: dict) -> AIResponse:
        """context: app.ai.context.build_project_context(...) shape."""

    @abstractmethod
    def analyze_risk(self, context: dict) -> AIResponse:
        """context: {"risks": [...]}  -  a list of risk dicts (title/category/score/severity/status)."""

    @abstractmethod
    def generate_report(self, context: dict) -> AIResponse:
        """context: app.ai.context.build_portfolio_context(...) shape."""

    @abstractmethod
    def summarize(self, context: dict) -> AIResponse:
        """context: {"title": str, "text": str}."""

    @abstractmethod
    def analyze_document(self, context: dict) -> AIResponse:
        """context: {"filename": str, "text": str}."""

    @abstractmethod
    def answer_project_question(self, context: dict) -> AIResponse:
        """context: app.ai.context.build_assistant_context(...) shape."""

    @abstractmethod
    def answer_document_question(self, context: dict) -> AIResponse:
        """Grounded document Q&A (Phase 3 RAG). context: {"question": str, "filename": str,
        "chunks": [{"chunk_index": int, "page_number": int | None, "content": str,
        "similarity": float}, ...]} — chunks are the top-k pgvector retrieval results for the
        question, most similar first. Implementations must ground the answer in `chunks` and
        cite which chunk_index/page it came from — never answer from outside knowledge."""

    @abstractmethod
    def parse_meeting_transcript(self, context: dict) -> AIResponse:
        """Meeting Intelligence (Phase 4). context: {"transcript": str, "today": "YYYY-MM-DD"}.
        Response.data must contain "decisions": list[str], "action_items": list[{"title",
        "owner_name", "priority", "due_date", "estimated_hours"}], and "risks_identified":
        list[{"description", "category"}] — grounded only in the transcript text; any action-item
        field not explicitly stated must be null, never guessed."""
