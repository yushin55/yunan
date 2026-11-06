"""Server-only Gemini client. The API key never leaves the server environment."""
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import settings


class AIUnavailable(RuntimeError):
    pass


def _generate(parts: list[dict], timeout: float, max_tokens: int) -> dict:
    if not settings.gemini_api_key:
        raise AIUnavailable("GEMINI_API_KEY is not configured")
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": max_tokens, "responseMimeType": "application/json"},
    }
    request = Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": settings.gemini_api_key},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            result = json.load(response)
        parts = result["candidates"][0]["content"]["parts"]
        value = json.loads(" ".join(part.get("text", "") for part in parts if isinstance(part, dict)))
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise AIUnavailable(str(exc)) from exc
    if not isinstance(value, dict):
        raise AIUnavailable("Unexpected AI response")
    return value


def generate_json(prompt: str, timeout: float = 6, max_tokens: int = 200) -> dict:
    return _generate([{"text": prompt}], timeout, max_tokens)


def generate_json_from_audio(prompt: str, audio_base64: str, mime_type: str, timeout: float = 25, max_tokens: int = 600) -> dict:
    return _generate([{"text": prompt}, {"inline_data": {"mime_type": mime_type, "data": audio_base64}}], timeout, max_tokens)
