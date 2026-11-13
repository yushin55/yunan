"""Kakao Login: code exchange → Firebase custom token, without calling Kakao or Firebase."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import login
from app.main import app
from app.services import kakao

CALLBACK = "http://localhost:5173/auth/kakao"


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(login, "settings", SimpleNamespace(allowed_origins=("http://localhost:5173",)))
    with TestClient(app) as client:
        yield client


@pytest.fixture
def firebase(monkeypatch):
    users = {}
    monkeypatch.setattr(kakao, "firebase_app", lambda: object())
    monkeypatch.setattr(kakao, "settings", SimpleNamespace(kakao_rest_api_key="rest-key", kakao_client_secret="secret"))

    def get_user(uid, app):
        if uid not in users:
            raise kakao.auth.UserNotFoundError("missing")
        return users[uid]

    monkeypatch.setattr(kakao.auth, "get_user", get_user)
    monkeypatch.setattr(kakao.auth, "create_user", lambda uid, display_name, app: users.__setitem__(uid, display_name))
    monkeypatch.setattr(kakao.auth, "update_user", lambda uid, display_name, app: users.__setitem__(uid, display_name))
    monkeypatch.setattr(kakao.auth, "create_custom_token", lambda uid, claims, app: f"token-for-{uid}".encode())
    return users


def test_code_becomes_a_custom_token_for_the_kakao_user(api, firebase, monkeypatch):
    calls = []

    def fake_request(url, *, data=None, headers=None):
        calls.append((url, data, headers))
        if url == kakao.TOKEN_URL:
            return {"access_token": "kakao-access"}
        return {"id": 1234, "kakao_account": {"profile": {"nickname": "김선생"}}}

    monkeypatch.setattr(kakao, "_request", fake_request)
    result = api.post("/api/auth/kakao", json={"code": "abc", "redirectUri": CALLBACK})
    assert result.status_code == 200, result.text
    assert result.json() == {"token": "token-for-kakao:1234"}
    assert firebase == {"kakao:1234": "김선생"}
    token_form = calls[0][1]
    assert token_form["code"] == "abc" and token_form["client_id"] == "rest-key" and token_form["client_secret"] == "secret"
    assert token_form["redirect_uri"] == CALLBACK
    assert calls[1][2] == {"Authorization": "Bearer kakao-access"}


def test_foreign_redirect_uri_is_refused(api, monkeypatch):
    monkeypatch.setattr(kakao, "custom_token", lambda *a: pytest.fail("Must not reach Kakao"))
    result = api.post("/api/auth/kakao", json={"code": "abc", "redirectUri": "https://evil.example/auth/kakao"})
    assert result.status_code == 400


def test_rejected_code_is_401(api, firebase, monkeypatch):
    def reject(*a, **k):
        raise kakao.KakaoError("카카오 로그인을 확인하지 못했어요. 다시 시도해 주세요.", 401)

    monkeypatch.setattr(kakao, "_request", reject)
    result = api.post("/api/auth/kakao", json={"code": "used", "redirectUri": CALLBACK})
    assert result.status_code == 401


def test_missing_kakao_key_is_503(api, monkeypatch):
    monkeypatch.setattr(kakao, "settings", SimpleNamespace(kakao_rest_api_key="", kakao_client_secret=""))
    result = api.post("/api/auth/kakao", json={"code": "abc", "redirectUri": CALLBACK})
    assert result.status_code == 503
