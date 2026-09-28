import base64
import json
import os
from functools import lru_cache

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import settings


@lru_cache(maxsize=1)
def firebase_app():
    if settings.environment == "production" and (
        os.getenv("FIRESTORE_EMULATOR_HOST") or os.getenv("FIREBASE_AUTH_EMULATOR_HOST")
    ):
        raise RuntimeError("Production must not configure Firebase emulator hosts")
    try:
        return firebase_admin.get_app()
    except ValueError:
        credential = None
        if settings.service_account:
            credential = credentials.Certificate(json.loads(base64.b64decode(settings.service_account)))
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
