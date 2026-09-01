class AIProviderUnavailable(Exception):
    """Raised when a provider is asked to run without the config it needs (e.g. no API key)."""

    def __init__(self, provider_name: str):
        self.provider_name = provider_name
        super().__init__(f"{provider_name} provider is unavailable (no API key configured)")


class AIProviderError(Exception):
    """Raised when a provider's live call fails or returns an unexpected response shape."""
