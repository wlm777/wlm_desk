import os
import sys

from pydantic_settings import BaseSettings


def _require_env(name: str) -> str:
    """Require an environment variable at startup. Fail fast if missing."""
    val = os.environ.get(name, "")
    if not val:
        print(f"FATAL: Required environment variable {name} is not set.", file=sys.stderr)
        sys.exit(1)
    return val


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@postgres:5432/wlm_tasks"
    redis_url: str = "redis://redis:6379"

    # Secrets — NO defaults, must come from environment
    secret_key: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    preview_token_secret: str
    preview_token_expire_minutes: int = 30

    # Storage
    attachments_dir: str = "/app/data/attachments"
    max_upload_size: int = 10 * 1024 * 1024  # 10 MB

    # Slack bot (optional)
    slack_bot_token: str = ""
    slack_signing_secret: str = ""

    # Google OAuth (optional)
    google_client_id: str = ""
    google_client_secret: str = ""

    # Public URLs — configurable per environment
    frontend_url: str = "https://desk.weblabmedia.eu"
    backend_public_url: str = "https://desk.weblabmedia.eu"
    allowed_origins: str = "https://desk.weblabmedia.eu"  # comma-separated

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.backend_public_url}/api/v1/auth/google/callback"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    # Limits
    batch_max_tasks: int = 100
    pagination_max_limit: int = 100

    # Worker
    worker_check_interval: int = 300
    slack_digest_hour: int = 8
    stuck_default_days: int = 5

    model_config = {"env_file": ".env"}


settings = Settings()
