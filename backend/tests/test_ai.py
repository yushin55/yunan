"""Provider selection must route server credentials and audio to the intended API."""
import io
import json
from dataclasses import replace
from urllib.error import HTTPError
from urllib.parse import urlparse

import pytest

from app.services import ai


@pytest.fixture
def configured(monkeypatch):
    def select(provider, **overrides):
        settings = replace(ai.settings, **{
            "ai_provider": provider,
            "gemini_api_key": "test-gemini-key",
            "vertex_api_key": "test-vertex-key",
            "gemini_model": "gemini-2.0-flash",
            "vertex_model": "gemini-2.0-flash",
            **overrides,
        })
        monkeypatch.setattr(ai, "settings", settings)
    return select


@pytest.mark.parametrize("provider,host,key", [
    ("gemini", "generativelanguage.googleapis.com", "test-gemini-key"),
    ("vertex", "aiplatform.googleapis.com", "test-vertex-key"),
])
@pytest.mark.parametrize("audio", [False, True])
def test_text_and_audio_use_only_the_selected_provider_credentials(monkeypatch, configured, provider, host, key, audio):
    configured(provider)
    calls = []

    def request(req, timeout):
        calls.append(req)
        assert urlparse(req.full_url).netloc == host
        assert req.get_header("X-goog-api-key") == key
        assert "key=" not in req.full_url
        payload = json.loads(req.data)
        contents = payload["contents"][0]
        assert contents["role"] == "user"
        assert contents["parts"][0] == {"text": "test prompt"}
        assert payload["generationConfig"]["responseMimeType"] == "application/json"
        assert payload["generationConfig"]["maxOutputTokens"] == 123
        assert timeout == 7
        if audio:
            assert contents["parts"][1]["inline_data"] == {"mime_type": "audio/wav", "data": "dGVzdA=="}
        return io.BytesIO(json.dumps({"candidates": [{"content": {"parts": [{"text": '{"ok":true}'}]}}]}).encode())

    monkeypatch.setattr(ai, "urlopen", request)
    if audio:
        result = ai.generate_json_from_audio("test prompt", "dGVzdA==", "audio/wav", timeout=7, max_tokens=123)
    else:
        result = ai.generate_json("test prompt", timeout=7, max_tokens=123)
    assert result == {"ok": True}
    assert len(calls) == 1


@pytest.mark.parametrize("provider", ["gemini", "vertex"])
def test_missing_selected_key_does_not_use_the_other_providers_key(monkeypatch, provider):
    monkeypatch.setattr(ai, "settings", replace(
        ai.settings,
        ai_provider=provider,
        gemini_api_key="" if provider == "gemini" else "test-gemini-key",
        vertex_api_key="" if provider == "vertex" else "test-vertex-key",
    ))
    monkeypatch.setattr(ai, "urlopen", lambda *args, **kwargs: pytest.fail("Missing credentials must not make a request"))
    with pytest.raises(ai.AIUnavailable, match=f"{provider.upper()}_API_KEY is not configured"):
        ai.generate_json("test prompt")


@pytest.mark.parametrize("status,code,retryable", [
    (400, "ai_configuration", False),
    (401, "ai_auth", False),
    (402, "ai_billing", False),
    (403, "ai_auth", False),
    (404, "ai_configuration", False),
    (429, "ai_unavailable", True),
    (503, "ai_unavailable", True),
])
def test_provider_errors_distinguish_credentials_from_temporary_outages(monkeypatch, configured, status, code, retryable):
    configured("vertex")

    def denied(req, timeout):
        raise HTTPError(req.full_url, status, "provider-secret-must-not-be-exposed", {}, None)

    monkeypatch.setattr(ai, "urlopen", denied)
    with pytest.raises(ai.AIUnavailable) as error:
        ai.generate_json("test prompt")
    assert isinstance(error.value.__cause__, HTTPError)
    assert error.value.code == code
    assert error.value.retryable is retryable
    assert "provider-secret" not in str(error.value)


def test_key_service_restrictions_are_distinct_from_invalid_credentials(monkeypatch, configured):
    configured("vertex")
    body = {"error": {"message": "private-provider-detail", "details": [{"reason": "API_KEY_SERVICE_BLOCKED", "metadata": {"service": "aiplatform.googleapis.com"}}]}}

    def blocked(req, timeout):
        raise HTTPError(req.full_url, 403, "Forbidden", {}, io.BytesIO(json.dumps(body).encode()))

    monkeypatch.setattr(ai, "urlopen", blocked)
    with pytest.raises(ai.AIUnavailable) as error:
        ai.generate_json("test prompt")
    assert error.value.code == "ai_service_blocked"
    assert error.value.retryable is False
    assert "private-provider-detail" not in str(error.value)


@pytest.mark.parametrize("provider", ["gemini", "vertex"])
def test_pro_transcription_reserves_room_for_thinking_and_parses_only_the_final_answer(monkeypatch, configured, provider):
    configured(provider, **{f"{provider}_model": "gemini-3.1-pro-preview"})

    def respond(req, timeout):
        config = json.loads(req.data)["generationConfig"]
        assert config["maxOutputTokens"] >= 4096  # 600 previously truncated the real audio response.
        assert config["thinkingConfig"]["thinkingLevel"] == "LOW"
        result = {"candidates": [{"finishReason": "STOP", "content": {"parts": [
            {"thought": True, "text": "private reasoning"},
            {"text": '{"text":"spoken words"}'},
        ]}}]}
        return io.BytesIO(json.dumps(result).encode())

    monkeypatch.setattr(ai, "urlopen", respond)
    assert ai.generate_json_from_audio("transcribe", "dGVzdA==", "audio/wav") == {"text": "spoken words"}


def test_token_limited_response_is_never_published_as_complete_text(monkeypatch, configured):
    configured("vertex")
    result = {"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": '{"text":"incomplete statement"}'}]}}]}
    monkeypatch.setattr(ai, "urlopen", lambda *args, **kwargs: io.BytesIO(json.dumps(result).encode()))
    with pytest.raises(ai.AIUnavailable, match="output token limit"):
        ai.generate_json_from_audio("transcribe", "dGVzdA==", "audio/wav")
