import pytest
from app.services.ai import AIUnavailable
from app.services.moderation import Moderator, rule_check

FLAGGED = ["너 진짜 멍청하다", "시1발 뭐래", "ㅅㅂ 그게 말이 돼?", "닥쳐", "그냥 꺼져!", "니 말은 수준 낮아", "병*신 같은 소리", "ㅋㅋㅋ 수준 봐"]
ALLOWED = [
    "저는 그 의견에 반대합니다. 근거가 약하다고 생각해요.",
    "음식을 꼭꼭 씹어 먹으면 잔반이 줄어요.",
    "폰이 꺼져서 연락이 안 된 적이 있어요.",
    "사물함을 뒤져서 찾았다는 건 사생활 침해예요.",
    "학생 의견이 규칙의 시발점이 되어야 해요.",
    "자료 보존 나중에 해도 되나요?",
    "너무 엄격한 규칙이라고 생각해요.",
    "진짜 그렇게 생각하세요? 저는 납득이 안 돼요.",
    "그 주장은 틀렸다고 봐요. 비용을 고려하지 않았어요.",
]


@pytest.mark.parametrize("text", FLAGGED)
def test_rules_catch_clear_profanity_and_attacks(text):
    verdict = rule_check(text)
    assert verdict and verdict.status == "flag" and verdict.category
    assert verdict.excerpt and verdict.excerpt in text


@pytest.mark.parametrize("text", ALLOWED)
def test_rules_allow_disagreement_and_ordinary_words(text):
    assert rule_check(text) is None


def test_ai_flag_quotes_only_the_students_own_words():
    moderator = Moderator(mode="ai", ai_call=lambda prompt: {"verdict": "flag", "category": "mockery", "excerpt": "다른 문장"})
    verdict = moderator.review("그 정도도 모르다니 웃기네요")
    assert verdict.status == "flag" and verdict.excerpt is None and verdict.category == "mockery"
    moderator = Moderator(mode="ai", ai_call=lambda prompt: {"verdict": "ok"})
    assert moderator.review("저는 반대합니다").status == "ok"


def test_a_timeout_is_not_retried_so_the_request_fits_the_server_time_limit(monkeypatch):
    calls = []
    now = [0.0]
    monkeypatch.setattr("app.services.moderation.time.monotonic", lambda: now[0])

    def slow(prompt):
        calls.append(prompt)
        now[0] += 20
        raise AIUnavailable("timed out")

    assert Moderator(mode="ai", ai_call=slow).review("평범한 질문이에요").status == "unavailable"
    assert len(calls) == 1


def test_ai_failure_retries_then_falls_back_to_teacher_review():
    calls = []

    def broken(prompt):
        calls.append(prompt)
        raise AIUnavailable("down")

    verdict = Moderator(mode="ai", ai_call=broken).review("평범한 질문이에요")
    assert verdict.status == "unavailable" and len(calls) == 2
    # Clear-cut cases never depend on the AI being up.
    assert Moderator(mode="ai", ai_call=broken).review("닥쳐").status == "flag"
