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
    allowed_origins: tuple[str, ...] = tuple(
        x.strip() for x in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()
    )

    @property
    def development(self) -> bool:
        return self.environment == "development" and bool(os.getenv("FIRESTORE_EMULATOR_HOST"))


settings = Settings()
