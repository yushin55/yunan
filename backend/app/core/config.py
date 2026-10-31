import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


@dataclass(frozen=True)
class Settings:
    project_id: str = os.getenv("FIREBASE_PROJECT_ID", "demo-yunan")
    service_account: str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "")
    environment: str = os.getenv("ENVIRONMENT", "production")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    # "ai": rules + AI; when AI cannot answer, the teacher reviews. "rules": rules only (local development).
    moderation_mode: str = os.getenv("MODERATION_MODE", "ai")
    allowed_origins: tuple[str, ...] = tuple(
        x.strip() for x in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()
    )

    @property
    def development(self) -> bool:
        return self.environment == "development" and bool(os.getenv("FIRESTORE_EMULATOR_HOST"))


settings = Settings()

if settings.moderation_mode not in ("ai", "rules"):
    raise RuntimeError("MODERATION_MODE must be 'ai' or 'rules'")
if settings.moderation_mode == "rules" and settings.environment == "production":
    raise RuntimeError("MODERATION_MODE=rules is for local development only")
