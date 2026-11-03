import base64
import json
import os
from functools import lru_cache

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import settings


def validate_environment():
    firestore_emulator = bool(os.getenv("FIRESTORE_EMULATOR_HOST"))
    auth_emulator = bool(os.getenv("FIREBASE_AUTH_EMULATOR_HOST"))
    if firestore_emulator != auth_emulator:
        raise RuntimeError("Configure both Firebase emulator hosts, or remove both for real Firebase")
    if settings.environment == "production" and firestore_emulator:
        raise RuntimeError("Production must not configure Firebase emulator hosts")
    if firestore_emulator and (settings.service_account or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")):
        raise RuntimeError("Remove server credentials when using Firebase emulators")
    if not firestore_emulator and (
        not settings.project_id.strip() or settings.project_id.startswith("demo-")
        or "<" in settings.project_id or ">" in settings.project_id
    ):
        raise RuntimeError("FIREBASE_PROJECT_ID must identify a real Firebase project")


@lru_cache(maxsize=1)
def firebase_app():
    validate_environment()
    try:
        return firebase_admin.get_app()
    except ValueError:
        credential = None
        if settings.service_account:
            try:
                account = json.loads(base64.b64decode(settings.service_account, validate=True))
                if not isinstance(account, dict) or account.get("project_id") != settings.project_id:
                    raise RuntimeError("Service account project must match FIREBASE_PROJECT_ID")
                credential = credentials.Certificate(account)
            except RuntimeError:
                raise
            except Exception:
                raise RuntimeError("Invalid FIREBASE_SERVICE_ACCOUNT_JSON_BASE64; check the server secret") from None
        # The emulator uses an unsigned client credential. No service account file needed.
        if os.getenv("FIRESTORE_EMULATOR_HOST") and not credential:
            from google.auth.credentials import AnonymousCredentials

            class EmulatorCredential(credentials.Base):
                def get_credential(self):
                    return AnonymousCredentials()

            credential = EmulatorCredential()
        return firebase_admin.initialize_app(credential, {"projectId": settings.project_id})


@lru_cache(maxsize=1)
def firestore_client():
    return firestore.client(app=firebase_app())
