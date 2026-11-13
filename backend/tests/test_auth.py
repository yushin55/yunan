"""Server credential failures must not be confused with rejected user tokens."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from google.auth.exceptions import DefaultCredentialsError

from app.core import auth


def token():
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials="test-id-token")


@pytest.fixture
def configured(monkeypatch):
    app = SimpleNamespace(credential=SimpleNamespace(get_credential=lambda: object()))
    monkeypatch.setattr(auth, "firebase_app", lambda: app)
    return app


def test_missing_bearer_is_rejected_without_initializing_firebase(monkeypatch):
    monkeypatch.setattr(auth, "firebase_app", lambda: pytest.fail("No token must not initialize Firebase"))
    with pytest.raises(HTTPException) as error:
        auth.current_uid(None)
    assert error.value.status_code == 401


@pytest.mark.parametrize("failure", [ValueError("private-key-detail"), DefaultCredentialsError("credential-detail")])
def test_broken_server_credentials_are_503_without_leaking_details(monkeypatch, caplog, failure):
    def fail():
        raise failure

    monkeypatch.setattr(auth, "firebase_app", fail)
    monkeypatch.setattr(auth.auth, "verify_id_token", lambda *a, **k: pytest.fail("No token verification with broken config"))
    with pytest.raises(HTTPException) as error:
        auth.current_uid(token())
    assert error.value.status_code == 503
    assert str(failure) not in error.value.detail
    assert str(failure) not in caplog.text


def test_unavailable_application_default_credentials_are_503(configured, monkeypatch):
    def missing():
        raise DefaultCredentialsError("No default credentials")

    monkeypatch.setattr(configured.credential, "get_credential", missing)
    with pytest.raises(HTTPException) as error:
        auth.current_uid(token())
    assert error.value.status_code == 503


@pytest.mark.parametrize("failure", [auth.auth.InvalidIdTokenError("Wrong project"), auth.auth.ExpiredIdTokenError("Expired", cause=None)])
def test_rejected_user_token_remains_401(configured, monkeypatch, failure):
    def reject(*args, **kwargs):
        raise failure

    monkeypatch.setattr(auth.auth, "verify_id_token", reject)
    with pytest.raises(HTTPException) as error:
        auth.current_uid(token())
    assert error.value.status_code == 401


def test_verification_outage_is_503(configured, monkeypatch):
    def unavailable(*args, **kwargs):
        raise auth.auth.CertificateFetchError("Certificate service unavailable", cause=None)

    monkeypatch.setattr(auth.auth, "verify_id_token", unavailable)
    with pytest.raises(HTTPException) as error:
        auth.current_uid(token())
    assert error.value.status_code == 503


def test_verified_uid_is_used_with_project_scoped_app(configured, monkeypatch):
    def verify(value, *, app, check_revoked):
        assert value == "test-id-token"
        assert app is configured
        assert check_revoked is False
        return {"uid": "existing-anonymous-user"}

    monkeypatch.setattr(auth.auth, "verify_id_token", verify)
    assert auth.current_uid(token()) == "existing-anonymous-user"


@pytest.mark.parametrize("provider", ["google.com", "custom"])
def test_google_and_kakao_teachers_are_accepted(configured, monkeypatch, provider):
    monkeypatch.setattr(auth.auth, "verify_id_token", lambda *a, **k: {"uid": "t1", "firebase": {"sign_in_provider": provider}})
    assert auth.current_teacher(token()) == "t1"


@pytest.mark.parametrize("claims", [{"uid": "s1", "firebase": {"sign_in_provider": "anonymous"}}, {"uid": "s1"}])
def test_anonymous_students_cannot_act_as_teacher(configured, monkeypatch, claims):
    monkeypatch.setattr(auth.auth, "verify_id_token", lambda *a, **k: claims)
    with pytest.raises(HTTPException) as error:
        auth.current_teacher(token())
    assert error.value.status_code == 403


def test_claims_without_uid_are_rejected(configured, monkeypatch):
    monkeypatch.setattr(auth.auth, "verify_id_token", lambda *a, **k: {})
    with pytest.raises(HTTPException) as error:
        auth.current_uid(token())
    assert error.value.status_code == 401
