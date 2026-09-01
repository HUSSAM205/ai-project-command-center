"""Real Gemini provider using the generateContent REST endpoint directly (no SDK).

Dormant without a key: `is_available()` returns False and AIRouter skips straight to the
next provider, so no request is ever attempted with a missing/invalid key. Setting
GEMINI_API_KEY in backend/.env activates this provider automatically  -  no code changes.
"""

import httpx

from app.ai.base import AIProvider
from app.ai.exceptions import AIProviderError, AIProviderUnavailable
from app.ai.prompts import (
    assistant_qa,
    document_analysis,
    executive_summary,
    project_health,
    risk_analysis,
    summarize,
)
from app.ai.providers.live_common import parse_summary_and_detail
from app.core.config import settings
from app.schemas.ai import AIResponse

REQUEST_TIMEOUT_SECONDS = 20.0


class GeminiProvider(AIProvider):
    name = "gemini"
    MODEL = "gemini-1.5-flash"
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY

    def is_available(self) -> bool:
        return bool(self.api_key)

    def generate_text(self, prompt: str, *, max_tokens: int = 1024, temperature: float = 0.3) -> str:
        if not self.is_available():
            raise AIProviderUnavailable(self.name)

        url = f"{self.BASE_URL}/{self.MODEL}:generateContent"
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature},
        }
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                resp = client.post(url, params={"key": self.api_key}, json=body)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as exc:
            raise AIProviderError(f"gemini request failed: {exc}") from exc

        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIProviderError(f"gemini returned an unexpected response shape: {data}") from exc

    def _respond(self, context: dict, prompt_module) -> AIResponse:
        prompt = prompt_module.build_prompt(context)
        text = self.generate_text(prompt)
        summary, detail = parse_summary_and_detail(text)
        return AIResponse(
            summary=summary,
            confidence=0.85,
            source="gemini",
            detail=detail,
            data={},
            prompt_version=prompt_module.PROMPT_VERSION,
        )

    def analyze_project(self, context: dict) -> AIResponse:
        return self._respond(context, project_health)

    def analyze_risk(self, context: dict) -> AIResponse:
        return self._respond(context, risk_analysis)

    def generate_report(self, context: dict) -> AIResponse:
        return self._respond(context, executive_summary)

    def summarize(self, context: dict) -> AIResponse:
        return self._respond(context, summarize)

    def analyze_document(self, context: dict) -> AIResponse:
        return self._respond(context, document_analysis)

    def answer_project_question(self, context: dict) -> AIResponse:
        return self._respond(context, assistant_qa)
