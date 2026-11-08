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
        settings = replace(
            ai.settings,
            ai_provider=provider,
            gemini_api_key="test-gemini-key",
            vertex_api_key="test-vertex-key",
            **overrides,
        )
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


def test_provider_permission_errors_become_ai_unavailable(monkeypatch, configured):
    configured("vertex")

    def denied(req, timeout):
        raise HTTPError(req.full_url, 403, "Forbidden", {}, None)

    monkeypatch.setattr(ai, "urlopen", denied)
    with pytest.raises(ai.AIUnavailable) as error:
        ai.generate_json("test prompt")
    assert isinstance(error.value.__cause__, HTTPError)
