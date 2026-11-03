"""Configuration guards only: no credentials, Firebase requests or DB writes."""
import base64
import json
from types import SimpleNamespace

import pytest

from app.core import firebase


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    for name in ("FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "GOOGLE_APPLICATION_CREDENTIALS"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(firebase, "settings", SimpleNamespace(
        environment="development", project_id="test-project", service_account="",
    ))
    firebase.firebase_app.cache_clear()
    yield
    firebase.firebase_app.cache_clear()


@pytest.mark.parametrize("host", ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"])
def test_partial_emulator_configuration_rejected(monkeypatch, host):
    monkeypatch.setenv(host, "127.0.0.1:8080")
    with pytest.raises(RuntimeError, match="both"):
        firebase.validate_environment()


def test_emulator_credentials_and_production_rejected(monkeypatch):
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
    firebase.validate_environment()
    firebase.settings.environment = "production"
    with pytest.raises(RuntimeError, match="Production"):
        firebase.validate_environment()
    firebase.settings.environment = "development"
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "test-only.json")
    with pytest.raises(RuntimeError, match="Remove server credentials"):
        firebase.validate_environment()


@pytest.mark.parametrize("project", ["", "demo-yunan", "<projectId>"])
def test_real_project_required(project):
    firebase.settings.project_id = project
    with pytest.raises(RuntimeError, match="FIREBASE_PROJECT_ID"):
        firebase.validate_environment()


def test_real_project_accepts_host_supplied_adc_without_fetching_it():
    firebase.validate_environment()


@pytest.mark.parametrize("value", ["invalid-secret-marker", base64.b64encode(json.dumps({"project_id": "other-project"}).encode()).decode()])
def test_invalid_server_secret_is_sanitized(monkeypatch, value):
    firebase.settings.service_account = value
    def missing_app():
        raise ValueError("No app")
    monkeypatch.setattr(firebase.firebase_admin, "get_app", missing_app)
    with pytest.raises(RuntimeError) as error:
        firebase.firebase_app()
    assert value not in str(error.value)
