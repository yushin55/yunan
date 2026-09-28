import re

from fastapi import HTTPException


def validate_text_fields(data: dict):
    for key in ("nickname", "text", "reason", "clue", "cardConnection", "understood", "disagree", "opinion"):
        value = data.get(key)
        if value and re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", value):
            raise HTTPException(422, "입력에 허용하지 않는 제어 문자가 있어요.")


def check_rate(private: dict, now: int):
    """Persisted rate windows work across serverless invocations and instances."""
    if now - private.get("rateWindow", 0) >= 60_000:
        private["rateWindow"] = now
        private["rateCount"] = 0
    private["rateCount"] = private.get("rateCount", 0) + 1
    if private["rateCount"] > 90:
        raise HTTPException(429, "요청이 너무 빨라요. 잠시 후 다시 시도해 주세요.")
