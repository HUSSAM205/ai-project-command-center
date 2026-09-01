from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str
    JWT_SECRET: str
    JWT_EXPIRES_MINUTES: int = 1440
    ENVIRONMENT: str = "development"
    JWT_ALGORITHM: str = "HS256"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # --- AI layer (Phase 2) ---
    # Local Redis backs the AIRouter cache/rate-limiter. Defaults to the docker-compose
    # service so a fresh checkout works without any .env edits.
    REDIS_URL: str = "redis://localhost:6379/0"
    # Left unset by default: with no keys, every AI-touching endpoint runs in Demo AI mode
    # (real, data-driven, template-generated output — never a live model call, never claimed
    # to be one). Setting either key activates live Gemini/Groq calls automatically, with no
    # code changes required. Never hardcode a key here or in .env.example.
    GEMINI_API_KEY: str | None = None
    GROQ_API_KEY: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
