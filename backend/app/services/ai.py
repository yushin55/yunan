"""Server-only Gemini / Vertex AI client. The API key never leaves the server environment."""
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import settings


class AIUnavailable(RuntimeError):
    def __init__(self, message: str, *, code: str = "ai_unavailable", retryable: bool = True):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


def _endpoint() -> tuple[str, str]:
    if settings.ai_provider == "vertex":
        if not settings.vertex_api_key:
            raise AIUnavailable("VERTEX_API_KEY is not configured", code="ai_configuration", retryable=False)
        url = f"https://aiplatform.googleapis.com/v1/publishers/google/models/{settings.vertex_model}:generateContent"
        return url, settings.vertex_api_key
    if not settings.gemini_api_key:
        raise AIUnavailable("GEMINI_API_KEY is not configured", code="ai_configuration", retryable=False)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    return url, settings.gemini_api_key


def _generate(parts: list[dict], timeout: float, max_tokens: int) -> dict:
    url, key = _endpoint()
    config = {"temperature": 0, "maxOutputTokens": max_tokens, "responseMimeType": "application/json"}
    model = settings.vertex_model if settings.ai_provider == "vertex" else settings.gemini_model
    if model.startswith("gemini-3"):
        # Thinking shares the output budget. The old 200/600-token limits can stop Pro
        # before it finishes even a short JSON transcription or moderation verdict.
        config["thinkingConfig"] = {"thinkingLevel": "LOW"}
        config["maxOutputTokens"] = max(4096, max_tokens + 2048)
    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": config,
    }
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            result = json.load(response)
        candidate = result["candidates"][0]
        if candidate.get("finishReason") == "MAX_TOKENS":
            raise AIUnavailable("AI response exceeded its output token limit")
        parts = candidate["content"]["parts"]
        value = json.loads(" ".join(part.get("text", "") for part in parts if isinstance(part, dict) and not part.get("thought")))
    except HTTPError as exc:
        # Retrying the same key cannot fix authentication or an invalid model setting.
        # Keep provider response bodies (which may include credentials) out of errors and logs.
        if exc.code == 402:
            code = "ai_billing"
        elif exc.code in (401, 403):
            code = "ai_auth"
        elif exc.code in (400, 404):
            code = "ai_configuration"
        else:
            code = "ai_unavailable"
        if exc.code == 403:
            try:
                error = json.loads(exc.read(65536)).get("error", {})
                if any(isinstance(detail, dict) and detail.get("reason") == "API_KEY_SERVICE_BLOCKED" for detail in error.get("details", [])):
                    code = "ai_service_blocked"
            except (ValueError, TypeError, AttributeError):
                pass
        raise AIUnavailable(f"AI provider returned HTTP {exc.code}", code=code, retryable=exc.code == 429 or exc.code >= 500) from exc
    except (URLError, TimeoutError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise AIUnavailable(str(exc)) from exc
    if not isinstance(value, dict):
        raise AIUnavailable("Unexpected AI response")
    return value


def generate_json(prompt: str, timeout: float = 6, max_tokens: int = 200) -> dict:
    return _generate([{"text": prompt}], timeout, max_tokens)


def generate_json_from_audio(prompt: str, audio_base64: str, mime_type: str, timeout: float = 25, max_tokens: int = 600) -> dict:
    return _generate([{"text": prompt}, {"inline_data": {"mime_type": mime_type, "data": audio_base64}}], timeout, max_tokens)
