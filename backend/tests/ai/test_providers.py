"""Direct provider-level tests for GeminiProvider/GroqProvider (app/ai/providers/gemini.py,
groq.py). These mock the outbound httpx call with `respx` — NO real network call is ever made,
per the Phase 7 spec. Covers: success, timeout, HTTP 429, HTTP 500, and "not configured" (no
API key) for each of the two live providers, at the level below AIRouter (i.e. testing that
each provider itself raises/returns correctly), complementing tests/ai/test_router.py which
tests AIRouter's fallback behavior in response to provider failures.
"""

import httpx
import pytest
import respx

from app.ai.exceptions import AIProviderError, AIProviderUnavailable
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.groq import GroqProvider

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def _gemini_success_body(text: str) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def _groq_success_body(text: str) -> dict:
    return {"choices": [{"message": {"content": text}}]}


class TestGeminiProviderAvailability:
    def test_not_available_without_api_key(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GEMINI_API_KEY", None)
        provider = GeminiProvider()
        assert provider.is_available() is False

    def test_available_with_api_key(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GEMINI_API_KEY", "fake-key-123")
        provider = GeminiProvider()
        assert provider.is_available() is True

    def test_generate_text_raises_unavailable_without_key(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GEMINI_API_KEY", None)
        provider = GeminiProvider()
        with pytest.raises(AIProviderUnavailable):
            provider.generate_text("hello")


class TestGeminiProviderNetworkOutcomes:
    @respx.mock
    def test_success(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GEMINI_API_KEY", "fake-key")
        respx.post(GEMINI_URL).mock(
            return_value=httpx.Response(200, json=_gemini_success_body("SUMMARY: all good\nmore detail"))
        )
        provider = GeminiProvider()
        response = provider.summarize({"title": "Doc", "text": "Some content."})
        assert response.source == "gemini"
        assert response.summary == "all good"
        assert response.confidence == 0.85

    @respx.mock
    def test_timeout_raises_ai_provider_error(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GEMINI_API_KEY", "fake-key")
        respx.post(GEMINI_URL).mock(side_effect=httpx.TimeoutException("timed out"))
        provider = GeminiProvider()
        with pytest.raises(AIProviderError):
            provider.generate_text("hello")

    @respx.mock
    def test_http_429_raises_ai_provider_error(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GEMINI_API_KEY", "fake-key")
        respx.post(GEMINI_URL).mock(return_value=httpx.Response(429, json={"error": "rate limited"}))
        provider = GeminiProvider()
        with pytest.raises(AIProviderError):
            provider.generate_text("hello")

    @respx.mock
    def test_http_500_raises_ai_provider_error(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GEMINI_API_KEY", "fake-key")
        respx.post(GEMINI_URL).mock(return_value=httpx.Response(500, json={"error": "server error"}))
        provider = GeminiProvider()
        with pytest.raises(AIProviderError):
            provider.generate_text("hello")

    @respx.mock
    def test_malformed_response_shape_raises_ai_provider_error(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GEMINI_API_KEY", "fake-key")
        respx.post(GEMINI_URL).mock(return_value=httpx.Response(200, json={"unexpected": "shape"}))
        provider = GeminiProvider()
        with pytest.raises(AIProviderError):
            provider.generate_text("hello")


class TestGroqProviderAvailability:
    def test_not_available_without_api_key(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GROQ_API_KEY", None)
        provider = GroqProvider()
        assert provider.is_available() is False

    def test_generate_text_raises_unavailable_without_key(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GROQ_API_KEY", None)
        provider = GroqProvider()
        with pytest.raises(AIProviderUnavailable):
            provider.generate_text("hello")


class TestGroqProviderNetworkOutcomes:
    @respx.mock
    def test_success(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GROQ_API_KEY", "fake-key")
        respx.post(GROQ_URL).mock(
            return_value=httpx.Response(200, json=_groq_success_body("SUMMARY: groq says hi\nmore"))
        )
        provider = GroqProvider()
        response = provider.summarize({"title": "Doc", "text": "Some content."})
        assert response.source == "groq"
        assert response.summary == "groq says hi"
        assert response.confidence == 0.8

    @respx.mock
    def test_timeout_raises_ai_provider_error(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GROQ_API_KEY", "fake-key")
        respx.post(GROQ_URL).mock(side_effect=httpx.TimeoutException("timed out"))
        provider = GroqProvider()
        with pytest.raises(AIProviderError):
            provider.generate_text("hello")

    @respx.mock
    def test_http_429_raises_ai_provider_error(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GROQ_API_KEY", "fake-key")
        respx.post(GROQ_URL).mock(return_value=httpx.Response(429, json={"error": "rate limited"}))
        provider = GroqProvider()
        with pytest.raises(AIProviderError):
            provider.generate_text("hello")

    @respx.mock
    def test_http_500_raises_ai_provider_error(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GROQ_API_KEY", "fake-key")
        respx.post(GROQ_URL).mock(return_value=httpx.Response(500, json={"error": "server error"}))
        provider = GroqProvider()
        with pytest.raises(AIProviderError):
            provider.generate_text("hello")


class TestParseSummaryAndDetail:
    def test_extracts_summary_line(self):
        from app.ai.providers.live_common import parse_summary_and_detail

        summary, detail = parse_summary_and_detail("SUMMARY: short version\nlong version continues")
        assert summary == "short version"
        assert "long version continues" in detail

    def test_falls_back_to_first_line_when_no_summary_prefix(self):
        from app.ai.providers.live_common import parse_summary_and_detail

        summary, detail = parse_summary_and_detail("Just some text\nmore text")
        assert summary == "Just some text"

    def test_empty_text_does_not_raise(self):
        from app.ai.providers.live_common import parse_summary_and_detail

        summary, detail = parse_summary_and_detail("   ")
        assert "empty" in summary.lower()
